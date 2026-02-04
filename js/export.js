/**
 * export.js - CSV export functionality for Chandy-Seidel visualization
 *
 * Provides utilities to export adjusted distributions and summary statistics.
 */

/**
 * Export adjusted distribution as CSV
 *
 * @param {Object} result - Chandy-Seidel adjustment result
 * @param {string} countryCode - Country code
 * @param {number} year - Year
 */
export function exportDistributionCSV(result, countryCode, year) {
    if (!result || !result.adjusted) {
        alert('No adjusted distribution to export.');
        return;
    }

    // Build CSV content with comprehensive columns
    const headers = [
        'country',
        'year',
        'quantile',
        'p_survey',
        'l_survey',
        'welfare_survey',
        'p_adjusted',
        'l_adjusted',
        'is_pareto_tail'
    ];

    const rows = [];

    // First, add all original survey distribution points
    result.originalDist.forEach((d, idx) => {
        // Find corresponding adjusted point (rescaled original)
        const adjPoint = result.adjustedDist.find(a =>
            !a.isPareto && a.originalP !== undefined && Math.abs(a.originalP - d.p) < 0.0001
        );

        rows.push([
            countryCode,
            year,
            idx + 1,
            d.p.toFixed(6),
            d.l.toFixed(6),
            d.w !== undefined ? d.w.toFixed(2) : '',
            adjPoint ? adjPoint.p.toFixed(6) : '',
            adjPoint ? adjPoint.l.toFixed(6) : '',
            0
        ]);
    });

    // Then add Pareto tail points (new observations)
    const paretoPoints = result.adjustedDist.filter(d => d.isPareto);
    paretoPoints.forEach((d, idx) => {
        rows.push([
            countryCode,
            year,
            result.originalDist.length + idx + 1,
            '', // No survey p
            '', // No survey l
            '', // No survey welfare
            d.p.toFixed(6),
            d.l.toFixed(6),
            1
        ]);
    });

    // Create CSV string
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.join(',') + '\n';
    });

    // Download
    downloadCSV(csv, `chandy_seidel_${countryCode}_${year}_distribution.csv`);
}

/**
 * Export summary statistics as CSV
 *
 * @param {Object} result - Chandy-Seidel adjustment result
 * @param {Object} ginis - Object with surveyGini and adjustedGini
 * @param {string} countryCode - Country code
 * @param {number} year - Year
 */
export function exportSummaryCSV(result, ginis, countryCode, year) {
    const headers = [
        'country',
        'year',
        'survey_mean',
        'nas_mean',
        'adjusted_mean',
        'gap_percent',
        'gap_share_used',
        'pareto_alpha',
        'survey_pct',
        'pareto_bins_added',
        'gini_survey',
        'gini_adjusted',
        'gini_change',
        'gini_change_percent'
    ];

    const surveyGini = ginis?.surveyGini || null;
    const adjustedGini = ginis?.adjustedGini || null;
    const giniChange = (surveyGini && adjustedGini) ? adjustedGini - surveyGini : null;
    const giniChangePct = (surveyGini && giniChange) ? (giniChange / surveyGini) * 100 : null;

    const row = [
        countryCode,
        year,
        result.surveyMean?.toFixed(4) || '',
        result.nasMean?.toFixed(4) || '',
        result.adjustedMean?.toFixed(4) || '',
        result.gapPercent?.toFixed(2) || '',
        result.gapShare?.toFixed(2) || '',
        result.alpha?.toFixed(4) || '',
        result.surveyPct?.toFixed(4) || '',
        result.paretoTailBins || 0,
        surveyGini?.toFixed(4) || '',
        adjustedGini?.toFixed(4) || '',
        giniChange?.toFixed(4) || '',
        giniChangePct?.toFixed(2) || ''
    ];

    let csv = headers.join(',') + '\n';
    csv += row.join(',') + '\n';

    downloadCSV(csv, `chandy_seidel_${countryCode}_${year}_summary.csv`);
}

/**
 * Export multiple country-years as combined CSV
 *
 * @param {Array} results - Array of {countryCode, year, result, ginis}
 */
export function exportMultipleSummaryCSV(results) {
    const headers = [
        'country',
        'year',
        'survey_mean',
        'nas_mean',
        'adjusted_mean',
        'gap_percent',
        'gap_share_used',
        'pareto_alpha',
        'survey_pct',
        'pareto_bins_added',
        'gini_survey',
        'gini_adjusted',
        'gini_change',
        'gini_change_percent'
    ];

    let csv = headers.join(',') + '\n';

    results.forEach(({ countryCode, year, result, ginis }) => {
        const surveyGini = ginis?.surveyGini || null;
        const adjustedGini = ginis?.adjustedGini || null;
        const giniChange = (surveyGini && adjustedGini) ? adjustedGini - surveyGini : null;
        const giniChangePct = (surveyGini && giniChange) ? (giniChange / surveyGini) * 100 : null;

        const row = [
            countryCode,
            year,
            result.surveyMean?.toFixed(4) || '',
            result.nasMean?.toFixed(4) || '',
            result.adjustedMean?.toFixed(4) || '',
            result.gapPercent?.toFixed(2) || '',
            result.gapShare?.toFixed(2) || '',
            result.alpha?.toFixed(4) || '',
            result.surveyPct?.toFixed(4) || '',
            result.paretoTailBins || 0,
            surveyGini?.toFixed(4) || '',
            adjustedGini?.toFixed(4) || '',
            giniChange?.toFixed(4) || '',
            giniChangePct?.toFixed(2) || ''
        ];

        csv += row.join(',') + '\n';
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `chandy_seidel_summary_${timestamp}.csv`);
}

/**
 * Export Lorenz curve data for plotting in external tools
 *
 * @param {Object} data - Contains surveyLorenz and adjustedLorenz
 * @param {string} countryCode - Country code
 * @param {number} year - Year
 */
export function exportLorenzCSV(data, countryCode, year) {
    const headers = ['p', 'l_survey', 'l_adjusted', 'l_equality'];

    // Create unified p values
    const pValues = new Set();
    data.surveyLorenz?.forEach(d => pValues.add(d.p));
    data.adjustedLorenz?.forEach(d => pValues.add(d.p));

    const sortedP = Array.from(pValues).sort((a, b) => a - b);

    // Interpolation function
    const interpolate = (lorenz, p) => {
        if (!lorenz || lorenz.length < 2) return null;
        if (p <= 0) return 0;
        if (p >= 1) return 1;

        let i = 0;
        while (i < lorenz.length - 1 && lorenz[i + 1].p < p) i++;
        if (i >= lorenz.length - 1) return lorenz[lorenz.length - 1].l;

        const t = (p - lorenz[i].p) / (lorenz[i + 1].p - lorenz[i].p);
        return lorenz[i].l + t * (lorenz[i + 1].l - lorenz[i].l);
    };

    let csv = headers.join(',') + '\n';

    sortedP.forEach(p => {
        const lSurvey = interpolate(data.surveyLorenz, p);
        const lAdjusted = interpolate(data.adjustedLorenz, p);

        csv += [
            p.toFixed(6),
            lSurvey?.toFixed(6) || '',
            lAdjusted?.toFixed(6) || '',
            p.toFixed(6) // equality line
        ].join(',') + '\n';
    });

    downloadCSV(csv, `lorenz_curves_${countryCode}_${year}.csv`);
}

/**
 * Helper function to trigger CSV download
 *
 * @param {string} content - CSV content
 * @param {string} filename - Filename for download
 */
function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    URL.revokeObjectURL(url);
}

/**
 * Format number for CSV (handle null/undefined)
 */
function formatForCSV(value, decimals = 4) {
    if (value === null || value === undefined || !isFinite(value)) {
        return '';
    }
    return value.toFixed(decimals);
}
