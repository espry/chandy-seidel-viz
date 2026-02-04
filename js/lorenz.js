/**
 * lorenz.js - Lorenz curve and Gini coefficient calculations
 *
 * Provides utilities for working with income distributions represented
 * as Lorenz curves (cumulative population share vs cumulative income share).
 */

/**
 * Calculate Gini coefficient from Lorenz curve using trapezoidal rule
 *
 * The Gini coefficient is calculated as:
 *   Gini = 1 - 2 * B
 * where B is the area under the Lorenz curve.
 *
 * @param {Array} lorenz - Array of {p, l} objects, sorted by p
 *                         p = cumulative population share (0 to 1)
 *                         l = cumulative income share (0 to 1)
 * @returns {number} Gini coefficient (0 to 1)
 */
export function calculateGini(lorenz) {
    if (!lorenz || lorenz.length < 2) {
        return null;
    }

    // Ensure we have origin point
    let data = [...lorenz];
    if (data[0].p > 0.001 || data[0].l > 0.001) {
        data.unshift({ p: 0, l: 0 });
    }

    // Sort by p
    data.sort((a, b) => a.p - b.p);

    // Calculate area under Lorenz curve using trapezoidal rule
    let areaUnderLorenz = 0;

    for (let i = 1; i < data.length; i++) {
        const width = data[i].p - data[i-1].p;
        const avgHeight = (data[i].l + data[i-1].l) / 2;
        areaUnderLorenz += width * avgHeight;
    }

    // Gini = 1 - 2 * B (area under Lorenz curve)
    // The area under the perfect equality line (45 degree) is 0.5
    // Gini = (0.5 - B) / 0.5 = 1 - 2B
    const gini = 1 - 2 * areaUnderLorenz;

    // Clamp to valid range [0, 1]
    return Math.max(0, Math.min(1, gini));
}

/**
 * Calculate mean welfare from distribution
 *
 * @param {Array} distribution - Array of {p, l, w} or {p, l, pop, welfare}
 * @returns {number} Weighted mean welfare
 */
export function calculateMean(distribution) {
    if (!distribution || distribution.length < 2) {
        return null;
    }

    let totalIncome = 0;
    let totalPop = 0;

    for (let i = 1; i < distribution.length; i++) {
        const curr = distribution[i];
        const prev = distribution[i-1];

        const popShare = curr.p - prev.p;
        const welfare = curr.w || curr.welfare || 0;

        if (popShare > 0 && welfare > 0) {
            totalIncome += welfare * popShare;
            totalPop += popShare;
        }
    }

    return totalPop > 0 ? totalIncome / totalPop : null;
}

/**
 * Calculate income shares by decile/quintile
 *
 * @param {Array} lorenz - Array of {p, l} objects
 * @param {number} numGroups - Number of groups (10 for deciles, 5 for quintiles)
 * @returns {Array} Income share for each group
 */
export function calculateIncomeShares(lorenz, numGroups = 10) {
    if (!lorenz || lorenz.length < 2) {
        return null;
    }

    // Ensure sorted
    const data = [...lorenz].sort((a, b) => a.p - b.p);

    const shares = [];
    const groupSize = 1 / numGroups;

    for (let i = 0; i < numGroups; i++) {
        const pLow = i * groupSize;
        const pHigh = (i + 1) * groupSize;

        // Interpolate L values at boundaries
        const lLow = interpolateLorenz(data, pLow);
        const lHigh = interpolateLorenz(data, pHigh);

        shares.push({
            group: i + 1,
            pLow,
            pHigh,
            share: lHigh - lLow
        });
    }

    return shares;
}

/**
 * Interpolate L value at a given p using linear interpolation
 */
function interpolateLorenz(lorenz, p) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;

    // Find surrounding points
    let i = 0;
    while (i < lorenz.length - 1 && lorenz[i + 1].p < p) {
        i++;
    }

    if (i >= lorenz.length - 1) {
        return lorenz[lorenz.length - 1].l;
    }

    const p1 = lorenz[i].p;
    const p2 = lorenz[i + 1].p;
    const l1 = lorenz[i].l;
    const l2 = lorenz[i + 1].l;

    // Linear interpolation
    const t = (p - p1) / (p2 - p1);
    return l1 + t * (l2 - l1);
}

/**
 * Calculate key inequality statistics
 *
 * @param {Array} lorenz - Lorenz curve data
 * @returns {Object} Statistics including Gini, top/bottom shares
 */
export function calculateStatistics(lorenz) {
    if (!lorenz || lorenz.length < 2) {
        return null;
    }

    const gini = calculateGini(lorenz);
    const deciles = calculateIncomeShares(lorenz, 10);
    const quintiles = calculateIncomeShares(lorenz, 5);

    // Calculate specific shares
    const bottom10 = deciles ? deciles[0].share : null;
    const bottom50 = quintiles ? quintiles.slice(0, 5).reduce((sum, q) => sum + q.share, 0) : null;
    const top10 = deciles ? deciles[9].share : null;
    const top1 = interpolateLorenz(lorenz, 1) - interpolateLorenz(lorenz, 0.99);

    // Palma ratio: top 10% / bottom 40%
    const bottom40 = deciles ? deciles.slice(0, 4).reduce((sum, d) => sum + d.share, 0) : null;
    const palma = (top10 && bottom40 && bottom40 > 0) ? top10 / bottom40 : null;

    // 90/10 ratio: income at 90th percentile / income at 10th percentile
    // (approximated from Lorenz curve)

    return {
        gini,
        bottom10,
        bottom50,
        top10,
        top1,
        palma,
        deciles,
        quintiles
    };
}

/**
 * Generate perfect equality line (45-degree line)
 */
export function getEqualityLine(numPoints = 100) {
    const line = [];
    for (let i = 0; i <= numPoints; i++) {
        const p = i / numPoints;
        line.push({ p, l: p });
    }
    return line;
}

/**
 * Calculate the area between two Lorenz curves (measure of redistribution)
 *
 * @param {Array} lorenz1 - First Lorenz curve (typically survey)
 * @param {Array} lorenz2 - Second Lorenz curve (typically adjusted)
 * @returns {number} Area between curves (positive if lorenz2 is more unequal)
 */
export function calculateAreaBetweenCurves(lorenz1, lorenz2) {
    // Sample at common points
    const numPoints = 100;
    let area = 0;

    for (let i = 1; i <= numPoints; i++) {
        const p = i / numPoints;
        const pPrev = (i - 1) / numPoints;

        const l1 = interpolateLorenz(lorenz1, p);
        const l1Prev = interpolateLorenz(lorenz1, pPrev);
        const l2 = interpolateLorenz(lorenz2, p);
        const l2Prev = interpolateLorenz(lorenz2, pPrev);

        // Trapezoidal integration of difference
        const width = p - pPrev;
        const avgDiff = ((l1 - l2) + (l1Prev - l2Prev)) / 2;
        area += width * avgDiff;
    }

    return area;
}

/**
 * Format Gini for display
 */
export function formatGini(gini, decimals = 3) {
    if (gini === null || gini === undefined || !isFinite(gini)) {
        return 'N/A';
    }
    return gini.toFixed(decimals);
}

/**
 * Format percentage for display
 */
export function formatPercent(value, decimals = 1) {
    if (value === null || value === undefined || !isFinite(value)) {
        return 'N/A';
    }
    return (value * 100).toFixed(decimals) + '%';
}
