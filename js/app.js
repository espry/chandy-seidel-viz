/**
 * app.js - Main application logic for Chandy-Seidel visualization
 *
 * Coordinates data loading, calculations, and UI updates.
 */

import { calculateChandySeidel } from './chandy-seidel.js';
import { calculateGini, calculateStatistics, formatGini, formatPercent } from './lorenz.js';
import { LorenzChart, CDFChart, createLegend } from './chart.js';
import {
    loadCountries,
    loadNasData,
    getDistribution,
    getNasForCountryYear,
    getAvailableYears,
    getCountriesByRegion
} from './data-loader.js';
import {
    exportDistributionCSV,
    exportSummaryCSV,
    exportLorenzCSV
} from './export.js';

// Application state
const state = {
    selectedCountry: null,
    selectedYear: 2019,
    gapShare: 0.5,
    nasSource: 'hfce',
    activeTab: 'lorenz',

    // Data
    countries: [],
    currentDistribution: null,
    currentNasData: null,
    adjustmentResult: null,

    // Computed
    surveyGini: null,
    adjustedGini: null,

    // Chart data
    chartData: {
        surveyLorenz: null,
        adjustedLorenz: null,
        paretoPoints: null
    }
};

// Chart instances
let chart = null;
let cdfChart = null;

// DOM Elements
const elements = {
    countrySelect: document.getElementById('country-select'),  // hidden input storing code
    countryInput: document.getElementById('country-input'),
    countryDropdown: document.getElementById('country-dropdown'),
    yearButtons: document.getElementById('year-buttons'),
    loadBtn: document.getElementById('load-btn'),
    gapShareSlider: document.getElementById('gap-share-slider'),
    gapShareDisplay: document.getElementById('gap-share-display'),
    nasHfceRadio: document.getElementById('nas-hfce-radio'),
    nasGdpRadio: document.getElementById('nas-gdp-radio'),

    // Stats displays
    surveyMean: document.getElementById('survey-mean'),
    nasHfce: document.getElementById('nas-hfce'),
    nasGdp: document.getElementById('nas-gdp'),
    nasGap: document.getElementById('nas-gap'),
    paretoAlpha: document.getElementById('pareto-alpha'),
    surveyCoverage: document.getElementById('survey-coverage'),
    paretoBins: document.getElementById('pareto-bins'),
    giniSurvey: document.getElementById('gini-survey'),
    giniAdjusted: document.getElementById('gini-adjusted'),
    giniChange: document.getElementById('gini-change'),

    // New result displays
    meanSurvey: document.getElementById('mean-survey'),
    meanAdjusted: document.getElementById('mean-adjusted'),
    meanChange: document.getElementById('mean-change'),
    top10Survey: document.getElementById('top10-survey'),
    top10Adjusted: document.getElementById('top10-adjusted'),
    top10Change: document.getElementById('top10-change'),

    // UI elements
    selectionBadge: document.getElementById('selection-badge'),
    loadingOverlay: document.getElementById('loading-overlay'),
    noDataMessage: document.getElementById('no-data-message'),
    statusMessage: document.getElementById('status-message'),
    statusText: document.getElementById('status-text'),

    // Chart tabs
    chartTabs: document.getElementById('chart-tabs'),

    // Export buttons
    exportDistBtn: document.getElementById('export-dist-btn'),
    exportSummaryBtn: document.getElementById('export-summary-btn'),
    exportLorenzBtn: document.getElementById('export-lorenz-btn')
};

/**
 * Initialize the application
 */
async function init() {
    console.log('Initializing Chandy-Seidel Visualization...');

    // Initialize charts
    chart = new LorenzChart('lorenz-chart');
    cdfChart = new CDFChart('cdf-chart');

    // Set up event listeners
    setupEventListeners();

    // Load initial data
    try {
        await loadInitialData();
        console.log('Initialization complete');
    } catch (error) {
        console.error('Initialization failed:', error);
        showError('Failed to load application data. Please check that data files exist.');
    }
}

/**
 * Load countries list and NAS data
 */
async function loadInitialData() {
    showLoading(true);

    try {
        // Load countries and NAS data in parallel
        const [countries, nasData] = await Promise.all([
            loadCountries(),
            loadNasData()
        ]);

        state.countries = countries;

        // Populate country dropdown
        populateCountryDropdown(countries);

        // Enable load button
        elements.loadBtn.disabled = false;

        // Auto-select first country and load its data
        await autoSelectFirstCountry();

        showLoading(false);
    } catch (error) {
        showLoading(false);
        throw error;
    }
}

/**
 * Auto-select first country and load its distribution
 */
async function autoSelectFirstCountry() {
    if (state.countries.length === 0) return;

    const country = state.countries[0];
    if (!country.code || !country.years || country.years.length === 0) return;

    selectCountry(country);

    // Load the distribution automatically
    await loadDistribution();
}

/**
 * Store flat country list for search
 */
function populateCountryDropdown(countries) {
    // countries list is stored in state.countries already
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Country search input
    elements.countryInput.addEventListener('input', onCountrySearch);
    elements.countryInput.addEventListener('focus', () => showCountryDropdown());
    elements.countryInput.addEventListener('keydown', onCountryKeydown);
    document.addEventListener('click', (e) => {
        if (!elements.countryInput.contains(e.target) && !elements.countryDropdown.contains(e.target)) {
            elements.countryDropdown.style.display = 'none';
        }
    });

    // Load button
    elements.loadBtn.addEventListener('click', loadDistribution);

    // Gap share slider
    elements.gapShareSlider.addEventListener('input', onGapShareChange);

    // NAS source radio
    elements.nasHfceRadio.addEventListener('change', onNasSourceChange);
    elements.nasGdpRadio.addEventListener('change', onNasSourceChange);

    // Chart tabs
    elements.chartTabs.addEventListener('click', (e) => {
        const link = e.target.closest('[data-tab]');
        if (!link) return;
        e.preventDefault();
        elements.chartTabs.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        state.activeTab = link.dataset.tab;
        // Show/hide chart containers
        document.getElementById('lorenz-chart').style.display = state.activeTab === 'lorenz' ? '' : 'none';
        document.getElementById('cdf-chart').style.display = state.activeTab === 'cdf' ? '' : 'none';
        updateChart();
    });

    // Export buttons
    elements.exportDistBtn.addEventListener('click', () => {
        if (state.adjustmentResult && state.selectedCountry) {
            exportDistributionCSV(state.adjustmentResult, state.selectedCountry, state.selectedYear);
        }
    });

    elements.exportSummaryBtn.addEventListener('click', () => {
        if (state.adjustmentResult && state.selectedCountry) {
            exportSummaryCSV(
                state.adjustmentResult,
                { surveyGini: state.surveyGini, adjustedGini: state.adjustedGini },
                state.selectedCountry,
                state.selectedYear
            );
        }
    });

    elements.exportLorenzBtn.addEventListener('click', () => {
        if (state.chartData.surveyLorenz && state.selectedCountry) {
            exportLorenzCSV(state.chartData, state.selectedCountry, state.selectedYear);
        }
    });

    // Window resize
    window.addEventListener('resize', debounce(() => {
        if (chart) chart.resize();
        updateChart();
    }, 250));
}

/**
 * Show filtered country dropdown
 */
function showCountryDropdown(filter = '') {
    const dd = elements.countryDropdown;
    dd.innerHTML = '';

    const lowerFilter = filter.toLowerCase();
    const matches = state.countries.filter(c =>
        !lowerFilter ||
        c.name.toLowerCase().includes(lowerFilter) ||
        c.code.toLowerCase().includes(lowerFilter)
    );

    if (matches.length === 0) {
        dd.style.display = 'none';
        return;
    }

    // Limit to 30 results for performance
    matches.slice(0, 30).forEach((country, idx) => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        if (idx === 0) item.classList.add('active');
        item.innerHTML = `${country.name} <span class="code">${country.code}</span>`;
        item.dataset.code = country.code;
        item.dataset.years = JSON.stringify(country.years);
        item.addEventListener('click', () => selectCountry(country));
        dd.appendChild(item);
    });

    dd.style.display = 'block';
}

/**
 * Handle typing in country search
 */
function onCountrySearch(event) {
    showCountryDropdown(event.target.value);
}

/**
 * Handle keyboard navigation in dropdown
 */
function onCountryKeydown(event) {
    const dd = elements.countryDropdown;
    if (dd.style.display === 'none') return;

    const items = dd.querySelectorAll('.dropdown-item');
    const active = dd.querySelector('.dropdown-item.active');
    let idx = Array.from(items).indexOf(active);

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (idx < items.length - 1) idx++;
        items.forEach(i => i.classList.remove('active'));
        items[idx].classList.add('active');
        items[idx].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (idx > 0) idx--;
        items.forEach(i => i.classList.remove('active'));
        items[idx].classList.add('active');
        items[idx].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
        event.preventDefault();
        if (active) {
            const code = active.dataset.code;
            const country = state.countries.find(c => c.code === code);
            if (country) selectCountry(country);
        }
    } else if (event.key === 'Escape') {
        dd.style.display = 'none';
    }
}

/**
 * Select a country from dropdown
 */
function selectCountry(country) {
    elements.countryInput.value = `${country.name} (${country.code})`;
    elements.countrySelect.value = country.code;
    elements.countryDropdown.style.display = 'none';

    state.selectedCountry = country.code;
    populateYearButtons(country.years || []);
    elements.loadBtn.disabled = false;
}

/**
 * Populate year radio buttons
 */
function populateYearButtons(years) {
    elements.yearButtons.innerHTML = '';

    if (years.length === 0) return;

    // Sort years descending (most recent first)
    const sortedYears = [...years].sort((a, b) => b - a);

    sortedYears.forEach((year, index) => {
        const wrapper = document.createElement('div');

        const input = document.createElement('input');
        input.type = 'radio';
        input.className = 'btn-check';
        input.name = 'year-select';
        input.id = `year-${year}`;
        input.value = year;
        input.autocomplete = 'off';

        // Select most recent year by default, or current selection if valid
        if (years.includes(state.selectedYear) && year === state.selectedYear) {
            input.checked = true;
        } else if (!years.includes(state.selectedYear) && index === 0) {
            input.checked = true;
            state.selectedYear = year;
        }

        input.addEventListener('change', onYearChange);

        const label = document.createElement('label');
        label.className = 'btn btn-outline-primary btn-sm';
        label.htmlFor = `year-${year}`;
        label.textContent = year;

        wrapper.appendChild(input);
        wrapper.appendChild(label);
        elements.yearButtons.appendChild(wrapper);
    });
}

/**
 * Handle year radio button change
 */
function onYearChange(event) {
    state.selectedYear = parseInt(event.target.value);
}

/**
 * Handle gap share slider change
 */
function onGapShareChange(event) {
    state.gapShare = parseInt(event.target.value) / 100;
    elements.gapShareDisplay.textContent = `${event.target.value}%`;

    // Recalculate if we have data
    if (state.currentDistribution) {
        recalculateAdjustment();
    }
}

/**
 * Handle NAS source change
 */
function onNasSourceChange(event) {
    state.nasSource = event.target.value;

    // Recalculate if we have data
    if (state.currentDistribution) {
        recalculateAdjustment();
    }
}

/**
 * Load distribution data for selected country/year
 */
async function loadDistribution() {
    if (!state.selectedCountry) return;

    showLoading(true);
    hideNoData();
    clearResults();

    try {
        // Load distribution and NAS data
        const [distData, nasData] = await Promise.all([
            getDistribution(state.selectedCountry, state.selectedYear),
            getNasForCountryYear(state.selectedCountry, state.selectedYear)
        ]);

        state.currentDistribution = distData;
        state.currentNasData = nasData;

        // Update selection badge
        elements.selectionBadge.textContent = `${state.selectedCountry} ${state.selectedYear}`;
        elements.selectionBadge.classList.remove('bg-secondary');
        elements.selectionBadge.classList.add('bg-primary');

        // Update data display
        updateDataDisplay();

        // Calculate and display
        recalculateAdjustment();

        // Enable export buttons
        elements.exportDistBtn.disabled = false;
        elements.exportSummaryBtn.disabled = false;
        elements.exportLorenzBtn.disabled = false;

        showLoading(false);
    } catch (error) {
        console.error('Failed to load distribution:', error);
        showLoading(false);
        showError(`Could not load data for ${state.selectedCountry} ${state.selectedYear}`);
    }
}

/**
 * Recalculate adjustment with current parameters
 */
function recalculateAdjustment() {
    if (!state.currentDistribution) return;

    const distribution = state.currentDistribution.distribution;
    const surveyMean = state.currentDistribution.surveyMean;

    // Get NAS value based on selected source
    let nasMean = null;
    if (state.currentNasData) {
        nasMean = state.nasSource === 'hfce'
            ? state.currentNasData.hfce
            : state.currentNasData.gdp;
    }

    // Calculate Chandy-Seidel adjustment
    const result = calculateChandySeidel(
        distribution,
        surveyMean,
        nasMean,
        state.gapShare,
        0.9  // top decile cutoff
    );

    state.adjustmentResult = result;

    // Calculate Gini coefficients
    const surveyLorenz = distribution.map(d => ({ p: d.p, l: d.l }));
    state.surveyGini = calculateGini(surveyLorenz);

    if (result.adjusted) {
        state.adjustedGini = calculateGini(result.adjustedDist);
    } else {
        state.adjustedGini = null;
    }

    // Update chart data
    state.chartData.surveyLorenz = surveyLorenz;

    if (result.adjusted) {
        state.chartData.adjustedLorenz = result.adjustedDist;
        state.chartData.paretoPoints = result.adjustedDist.filter(d => d.isPareto);
    } else {
        state.chartData.adjustedLorenz = null;
        state.chartData.paretoPoints = null;
    }

    // Update displays
    updateResultsDisplay();
    updateChart();
}

/**
 * Update data display (survey mean, NAS values)
 */
function updateDataDisplay() {
    const dist = state.currentDistribution;
    const nas = state.currentNasData;

    // Survey mean
    elements.surveyMean.textContent = dist?.surveyMean
        ? `$${dist.surveyMean.toFixed(2)}/day`
        : '--';

    // NAS values
    elements.nasHfce.textContent = nas?.hfce
        ? `$${nas.hfce.toFixed(2)}/day`
        : 'N/A';

    elements.nasGdp.textContent = nas?.gdp
        ? `$${nas.gdp.toFixed(2)}/day`
        : 'N/A';

    // Gap
    const nasMean = state.nasSource === 'hfce' ? nas?.hfce : nas?.gdp;
    if (dist?.surveyMean && nasMean) {
        const gap = nasMean - dist.surveyMean;
        const gapPct = (gap / dist.surveyMean) * 100;
        elements.nasGap.textContent = `${gapPct > 0 ? '+' : ''}${gapPct.toFixed(1)}%`;
        elements.nasGap.classList.toggle('positive', gapPct > 0);
    } else {
        elements.nasGap.textContent = '--';
    }
}

/**
 * Update results display
 */
function updateResultsDisplay() {
    const result = state.adjustmentResult;
    const dist = state.currentDistribution;

    // Pareto parameters
    if (result?.adjusted) {
        elements.paretoAlpha.textContent = result.alpha.toFixed(3);
        elements.surveyCoverage.textContent = `${(result.surveyPct * 100).toFixed(1)}%`;
        elements.paretoBins.textContent = result.paretoTailBins;
    } else {
        elements.paretoAlpha.textContent = '--';
        elements.surveyCoverage.textContent = '--';
        elements.paretoBins.textContent = '--';
    }

    // Gini coefficients
    elements.giniSurvey.textContent = formatGini(state.surveyGini);
    elements.giniAdjusted.textContent = state.adjustedGini
        ? formatGini(state.adjustedGini)
        : '--';

    // Gini change
    if (state.surveyGini && state.adjustedGini) {
        const change = state.adjustedGini - state.surveyGini;
        const changePct = (change / state.surveyGini) * 100;
        const sign = change > 0 ? '+' : '';

        elements.giniChange.textContent = `${sign}${change.toFixed(4)} (${sign}${changePct.toFixed(1)}%)`;
        elements.giniChange.className = 'gini-change-badge ' + (change > 0 ? 'increase' : 'decrease');
    } else {
        elements.giniChange.textContent = '--';
        elements.giniChange.className = 'gini-change-badge';
    }

    // Mean income display
    const surveyMean = dist?.surveyMean;
    if (elements.meanSurvey) {
        elements.meanSurvey.textContent = surveyMean ? `$${surveyMean.toFixed(1)}` : '--';
    }
    if (elements.meanAdjusted) {
        elements.meanAdjusted.textContent = result?.adjusted
            ? `$${result.adjustedMean.toFixed(1)}`
            : '--';
    }
    if (elements.meanChange && surveyMean && result?.adjusted) {
        const meanChangePct = ((result.adjustedMean - surveyMean) / surveyMean) * 100;
        const sign = meanChangePct > 0 ? '+' : '';
        elements.meanChange.textContent = `${sign}${meanChangePct.toFixed(1)}%`;
        elements.meanChange.className = 'results-change-badge ' + (meanChangePct > 0 ? 'increase' : 'decrease');
    } else if (elements.meanChange) {
        elements.meanChange.textContent = '--';
        elements.meanChange.className = 'results-change-badge';
    }

    // Top 10% income share display
    const surveyTop10 = getTop10Share(state.chartData.surveyLorenz);
    const adjustedTop10 = result?.adjusted ? getTop10Share(result.adjustedDist) : null;

    if (elements.top10Survey) {
        elements.top10Survey.textContent = surveyTop10 !== null ? `${(surveyTop10 * 100).toFixed(1)}%` : '--';
    }
    if (elements.top10Adjusted) {
        elements.top10Adjusted.textContent = adjustedTop10 !== null ? `${(adjustedTop10 * 100).toFixed(1)}%` : '--';
    }
    if (elements.top10Change && surveyTop10 !== null && adjustedTop10 !== null) {
        const top10ChangePct = ((adjustedTop10 - surveyTop10) / surveyTop10) * 100;
        const sign = top10ChangePct > 0 ? '+' : '';
        elements.top10Change.textContent = `${sign}${top10ChangePct.toFixed(1)}%`;
        elements.top10Change.className = 'results-change-badge ' + (top10ChangePct > 0 ? 'increase' : 'decrease');
    } else if (elements.top10Change) {
        elements.top10Change.textContent = '--';
        elements.top10Change.className = 'results-change-badge';
    }

    // Status message
    if (result && !result.adjusted) {
        showStatus(result.reason);
    } else {
        hideStatus();
    }
}

/**
 * Calculate top 10% income share from Lorenz curve
 */
function getTop10Share(lorenz) {
    if (!lorenz || lorenz.length < 2) return null;

    // Find L at p=0.9 (bottom 90%)
    let l90 = null;
    for (let i = 0; i < lorenz.length - 1; i++) {
        if (lorenz[i].p <= 0.9 && lorenz[i + 1].p >= 0.9) {
            // Interpolate
            const t = (0.9 - lorenz[i].p) / (lorenz[i + 1].p - lorenz[i].p);
            l90 = lorenz[i].l + t * (lorenz[i + 1].l - lorenz[i].l);
            break;
        }
    }

    if (l90 === null) {
        // Fallback: find closest point to 0.9
        const closest = lorenz.reduce((prev, curr) =>
            Math.abs(curr.p - 0.9) < Math.abs(prev.p - 0.9) ? curr : prev
        );
        l90 = closest.l;
    }

    // Top 10% share = 1 - L(0.9)
    return 1 - l90;
}

/**
 * Update chart based on active tab
 */
function updateChart() {
    if (!state.chartData.surveyLorenz) return;

    if (state.activeTab === 'lorenz' && chart) {
        chart.update(state.chartData);
    } else if (state.activeTab === 'cdf' && cdfChart) {
        const cdfData = {
            surveyLorenz: state.chartData.surveyLorenz,
            distribution: state.currentDistribution?.distribution || [],
            adjustedDist: state.adjustmentResult?.adjusted
                ? state.adjustmentResult.adjustedDist.map(d => ({
                    p: d.p, l: d.l, w: d.w || d.welfare
                }))
                : null
        };
        cdfChart.update(cdfData);
    }
}

/**
 * Clear results
 */
function clearResults() {
    state.currentDistribution = null;
    state.currentNasData = null;
    state.adjustmentResult = null;
    state.surveyGini = null;
    state.adjustedGini = null;
    state.chartData = { surveyLorenz: null, adjustedLorenz: null, paretoPoints: null };

    // Clear displays
    elements.surveyMean.textContent = '--';
    elements.nasHfce.textContent = '--';
    elements.nasGdp.textContent = '--';
    elements.nasGap.textContent = '--';
    elements.paretoAlpha.textContent = '--';
    elements.surveyCoverage.textContent = '--';
    elements.paretoBins.textContent = '--';
    elements.giniSurvey.textContent = '--';
    elements.giniAdjusted.textContent = '--';
    elements.giniChange.textContent = '--';

    // Disable export buttons
    elements.exportDistBtn.disabled = true;
    elements.exportSummaryBtn.disabled = true;
    elements.exportLorenzBtn.disabled = true;

    // Clear chart
    if (chart) {
        chart.clear();
    }

    hideStatus();
}

/**
 * Show loading overlay
 */
function showLoading(show) {
    elements.loadingOverlay.style.display = show ? 'flex' : 'none';
}

/**
 * Show no data message
 */
function showNoData() {
    elements.noDataMessage.style.display = 'block';
}

/**
 * Hide no data message
 */
function hideNoData() {
    elements.noDataMessage.style.display = 'none';
}

/**
 * Show status message
 */
function showStatus(message) {
    elements.statusText.textContent = message;
    elements.statusMessage.style.display = 'block';
}

/**
 * Hide status message
 */
function hideStatus() {
    elements.statusMessage.style.display = 'none';
}

/**
 * Show error message
 */
function showError(message) {
    const container = document.querySelector('.chart-container');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    container.appendChild(errorDiv);

    // Remove after 5 seconds
    setTimeout(() => errorDiv.remove(), 5000);
}

/**
 * Debounce utility
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
