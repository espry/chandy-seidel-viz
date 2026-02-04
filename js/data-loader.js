/**
 * data-loader.js - Data loading and caching for Chandy-Seidel visualization
 *
 * Handles lazy loading of country distribution data and NAS aggregates.
 */

// Cache for loaded data
const countryDataCache = new Map();
let countriesMetadata = null;
let nasData = null;

/**
 * Load country metadata (list of countries with available years)
 *
 * @returns {Promise<Array>} Array of country objects
 */
export async function loadCountries() {
    if (countriesMetadata) {
        return countriesMetadata;
    }

    try {
        const response = await fetch('data/countries.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        countriesMetadata = await response.json();
        return countriesMetadata;
    } catch (error) {
        console.error('Failed to load countries metadata:', error);
        throw new Error('Could not load country list. Please check that data files exist.');
    }
}

/**
 * Load NAS (National Accounts) data for all countries
 *
 * @returns {Promise<Object>} Object keyed by country code
 */
export async function loadNasData() {
    if (nasData) {
        return nasData;
    }

    try {
        const response = await fetch('data/nas_data.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        nasData = await response.json();
        return nasData;
    } catch (error) {
        console.error('Failed to load NAS data:', error);
        throw new Error('Could not load national accounts data.');
    }
}

/**
 * Load distribution data for a specific country
 * Data is cached after first load.
 *
 * @param {string} countryCode - ISO3 country code
 * @returns {Promise<Object>} Country distribution data
 */
export async function loadCountryData(countryCode) {
    if (!countryCode) {
        throw new Error('Country code is required');
    }

    // Check cache
    if (countryDataCache.has(countryCode)) {
        return countryDataCache.get(countryCode);
    }

    try {
        const response = await fetch(`data/distributions/${countryCode}.json`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();

        // Cache the data
        countryDataCache.set(countryCode, data);

        return data;
    } catch (error) {
        console.error(`Failed to load data for ${countryCode}:`, error);
        throw new Error(`Could not load distribution data for ${countryCode}.`);
    }
}

/**
 * Get distribution for a specific country and year
 *
 * @param {string} countryCode - ISO3 country code
 * @param {number} year - Year
 * @returns {Promise<Object>} Distribution data with bins array
 */
export async function getDistribution(countryCode, year) {
    const countryData = await loadCountryData(countryCode);

    if (!countryData.years || !countryData.years[year]) {
        throw new Error(`No data available for ${countryCode} in ${year}`);
    }

    const yearData = countryData.years[year];

    // Convert bins to standard format {p, l, w}
    const distribution = yearData.bins.map(bin => ({
        p: bin.p,
        l: bin.l,
        w: bin.w,
        quantile: bin.q,
        isNew: bin.new === 1
    }));

    return {
        countryCode,
        year,
        distribution,
        surveyMean: yearData.survey_mean || calculateMeanFromBins(distribution)
    };
}

/**
 * Get NAS data for a specific country and year
 *
 * @param {string} countryCode - ISO3 country code
 * @param {number} year - Year
 * @returns {Promise<Object>} NAS data with hfce and gdp
 */
export async function getNasForCountryYear(countryCode, year) {
    const nas = await loadNasData();

    if (!nas[countryCode] || !nas[countryCode][year]) {
        return { hfce: null, gdp: null, surveyMean: null };
    }

    return nas[countryCode][year];
}

/**
 * Get all available years for a country
 *
 * @param {string} countryCode - ISO3 country code
 * @returns {Promise<Array<number>>} Array of years
 */
export async function getAvailableYears(countryCode) {
    const countries = await loadCountries();
    const country = countries.find(c => c.code === countryCode);

    if (!country) {
        return [];
    }

    return country.years || [];
}

/**
 * Search countries by name or code
 *
 * @param {string} query - Search query
 * @returns {Promise<Array>} Matching countries
 */
export async function searchCountries(query) {
    const countries = await loadCountries();
    const lowerQuery = query.toLowerCase();

    return countries.filter(c =>
        c.code.toLowerCase().includes(lowerQuery) ||
        c.name.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Get countries grouped by region
 *
 * @returns {Promise<Object>} Countries grouped by region code
 */
export async function getCountriesByRegion() {
    const countries = await loadCountries();

    const regionNames = {
        'EAP': 'East Asia & Pacific',
        'ECA': 'Europe & Central Asia',
        'LAC': 'Latin America & Caribbean',
        'MNA': 'Middle East & North Africa',
        'NAC': 'North America',
        'SAS': 'South Asia',
        'SSA': 'Sub-Saharan Africa',
        'OHI': 'Other High Income'
    };

    const grouped = {};

    countries.forEach(country => {
        const region = country.region || 'Other';
        if (!grouped[region]) {
            grouped[region] = {
                name: regionNames[region] || region,
                countries: []
            };
        }
        grouped[region].countries.push(country);
    });

    // Sort countries within each region
    Object.values(grouped).forEach(region => {
        region.countries.sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
}

/**
 * Calculate mean welfare from distribution bins
 */
function calculateMeanFromBins(distribution) {
    let totalWelfare = 0;
    let totalPop = 0;

    for (let i = 1; i < distribution.length; i++) {
        const popShare = distribution[i].p - distribution[i-1].p;
        const welfare = distribution[i].w;

        if (popShare > 0 && welfare) {
            totalWelfare += welfare * popShare;
            totalPop += popShare;
        }
    }

    return totalPop > 0 ? totalWelfare / totalPop : null;
}

/**
 * Clear all cached data
 */
export function clearCache() {
    countryDataCache.clear();
    countriesMetadata = null;
    nasData = null;
}

/**
 * Preload data for a list of countries (for faster access)
 *
 * @param {Array<string>} countryCodes - List of country codes to preload
 */
export async function preloadCountries(countryCodes) {
    const promises = countryCodes.map(code =>
        loadCountryData(code).catch(err => {
            console.warn(`Could not preload ${code}:`, err.message);
            return null;
        })
    );

    await Promise.all(promises);
}

/**
 * Get data loading status
 *
 * @returns {Object} Status of loaded data
 */
export function getLoadStatus() {
    return {
        countriesLoaded: countriesMetadata !== null,
        nasLoaded: nasData !== null,
        cachedCountries: Array.from(countryDataCache.keys())
    };
}
