/**
 * data-loader.js - Data loading and caching for Chandy-Seidel visualization
 *
 * Loads compact columnar JSON files and converts to row format for calculations.
 * Supports two access patterns:
 *   - Per-country:  data/dist/{CODE}.json  (all years for one country)
 *   - Per-year:     data/dist-by-year/{YEAR}.json (all countries for one year)
 */

// Cache for loaded data
const countryDataCache = new Map();
const yearDataCache = new Map();
let countriesMetadata = null;
let nasData = null;

/**
 * Load country metadata (list of countries with available years)
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
 * Convert compact columnar data to row-based bins array.
 *
 * Columnar format:  {"p":[...], "l":[...], "w":[...], "n":[...]}
 * Row format:       [{q, p, l, w, new}, ...]
 */
function columnarToRows(cols) {
    const len = cols.p.length;
    const bins = new Array(len);
    const hasNew = cols.n !== undefined;

    for (let i = 0; i < len; i++) {
        bins[i] = {
            q: i + 1,
            p: cols.p[i],
            l: cols.l[i],
            w: cols.w[i],
            new: hasNew ? cols.n[i] : 0
        };
    }
    return bins;
}

/**
 * Load distribution data for a specific country (all years).
 * Data is cached after first load.
 */
export async function loadCountryData(countryCode) {
    if (!countryCode) {
        throw new Error('Country code is required');
    }

    if (countryDataCache.has(countryCode)) {
        return countryDataCache.get(countryCode);
    }

    try {
        const response = await fetch(`data/dist/${countryCode}.json`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const compact = await response.json();

        // Convert columnar format to legacy structure: {code, years: {YEAR: {bins: [...]}}}
        const data = { code: countryCode, years: {} };
        for (const [year, cols] of Object.entries(compact)) {
            data.years[year] = { bins: columnarToRows(cols) };
        }

        countryDataCache.set(countryCode, data);
        return data;
    } catch (error) {
        console.error(`Failed to load data for ${countryCode}:`, error);
        throw new Error(`Could not load distribution data for ${countryCode}.`);
    }
}

/**
 * Get distribution for a specific country and year
 */
export async function getDistribution(countryCode, year) {
    const countryData = await loadCountryData(countryCode);

    if (!countryData.years || !countryData.years[year]) {
        throw new Error(`No data available for ${countryCode} in ${year}`);
    }

    const yearData = countryData.years[year];

    // Filter out placeholder bins (new=1 with null p/l values)
    const distribution = yearData.bins
        .filter(bin => bin.p != null && bin.l != null)
        .map(bin => ({
            p: bin.p,
            l: bin.l,
            w: bin.w,
            quantile: bin.q,
            isNew: bin.new === 1
        }));

    // Get survey_mean from NAS data (distribution files don't include it)
    const nas = await loadNasData();
    const nasEntry = nas?.[countryCode]?.[year];
    const surveyMean = nasEntry?.survey_mean || calculateMeanFromBins(distribution);

    return {
        countryCode,
        year,
        distribution,
        surveyMean
    };
}

/**
 * Load all countries for a specific year (for batch operations).
 * Uses per-year files for a single HTTP request.
 *
 * @param {number|string} year - Year to load
 * @returns {Promise<Object>} Object keyed by country code, each value is {bins: [...]}
 */
export async function loadAllCountriesForYear(year) {
    const yearStr = String(year);

    if (yearDataCache.has(yearStr)) {
        return yearDataCache.get(yearStr);
    }

    try {
        const response = await fetch(`data/dist-by-year/${yearStr}.json`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const compact = await response.json();

        // Convert each country's columnar data to rows
        const result = {};
        for (const [cc, cols] of Object.entries(compact)) {
            const bins = columnarToRows(cols);
            result[cc] = {
                distribution: bins.map(bin => ({
                    p: bin.p,
                    l: bin.l,
                    w: bin.w,
                    quantile: bin.q,
                    isNew: bin.new === 1
                })),
                surveyMean: calculateMeanFromBins(bins.map(b => ({p: b.p, w: b.w})))
            };
        }

        yearDataCache.set(yearStr, result);
        return result;
    } catch (error) {
        console.error(`Failed to load year ${year}:`, error);
        throw new Error(`Could not load distribution data for year ${year}.`);
    }
}

/**
 * Get NAS data for a specific country and year
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
    yearDataCache.clear();
    countriesMetadata = null;
    nasData = null;
}

/**
 * Preload data for a list of countries (for faster access)
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
 */
export function getLoadStatus() {
    return {
        countriesLoaded: countriesMetadata !== null,
        nasLoaded: nasData !== null,
        cachedCountries: Array.from(countryDataCache.keys()),
        cachedYears: Array.from(yearDataCache.keys())
    };
}
