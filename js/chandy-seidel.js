/**
 * chandy-seidel.js - Core Chandy-Seidel Pareto elongation calculations
 *
 * Implements the methodology from:
 * Chandy & Seidel (2017) "How much do we really know about inequality within
 * countries around the world? Adjusting Gini coefficients for missing top incomes"
 *
 * Reference implementation: NApov/2026/code/06_apply_adjustment.do
 */

/**
 * Calculate the Chandy-Seidel adjustment for a distribution
 *
 * @param {Array} distribution - Array of {p, l, w} objects (cumulative pop share, income share, welfare)
 * @param {number} surveyMean - Mean welfare from survey
 * @param {number} nasMean - National accounts mean (HFCE or GDP per capita)
 * @param {number} gapShare - Fraction of gap attributed to missing top incomes (default 0.5)
 * @param {number} topDecileCutoff - Percentile cutoff for top tail (default 0.9)
 * @returns {Object} Adjustment results including parameters and adjusted distribution
 */
export function calculateChandySeidel(distribution, surveyMean, nasMean, gapShare = 0.5, topDecileCutoff = 0.9) {
    // Validate inputs
    if (!distribution || distribution.length < 10) {
        return { adjusted: false, reason: 'Invalid distribution data' };
    }

    if (!surveyMean || surveyMean <= 0) {
        return { adjusted: false, reason: 'Invalid survey mean' };
    }

    if (!nasMean || nasMean <= 0) {
        return { adjusted: false, reason: 'No NAS data available' };
    }

    // Check if adjustment needed (NAS must be greater than survey)
    if (nasMean <= surveyMean) {
        return {
            adjusted: false,
            reason: 'NAS <= Survey mean (no adjustment needed)',
            surveyMean,
            nasMean,
            gap: 0,
            gapPercent: 0
        };
    }

    // Calculate gap
    const gap = nasMean - surveyMean;
    const gapPercent = (gap / surveyMean) * 100;

    // 1. Find top decile - find first bin where p >= cutoff
    const topDecileIdx = distribution.findIndex(d => d.p >= topDecileCutoff);
    if (topDecileIdx < 0) {
        return { adjusted: false, reason: 'Could not identify top decile' };
    }

    const topDecileP = distribution[topDecileIdx].p;
    const topDecileL = distribution[topDecileIdx].l;

    // 2. Calculate relative income (income share / pop share) for top decile bins
    const topDecileBins = distribution.slice(topDecileIdx);

    // Calculate non-cumulative shares and relative income for each bin
    const relativeIncomes = [];
    for (let i = 0; i < topDecileBins.length; i++) {
        const curr = topDecileBins[i];
        const prev = i > 0 ? topDecileBins[i - 1] : distribution[topDecileIdx - 1] || { p: topDecileP, l: topDecileL };

        const pDiff = curr.p - (i > 0 ? topDecileBins[i - 1].p : topDecileP);
        const lDiff = curr.l - (i > 0 ? topDecileBins[i - 1].l : topDecileL);

        if (pDiff > 0) {
            relativeIncomes.push(lDiff / pDiff);
        }
    }

    if (relativeIncomes.length < 2) {
        return { adjusted: false, reason: 'Not enough bins in top decile' };
    }

    // Get min and max relative income in top decile
    const minY = Math.min(...relativeIncomes);
    const maxY = Math.max(...relativeIncomes);

    if (minY <= 0 || maxY <= 0 || minY >= maxY) {
        return { adjusted: false, reason: 'Invalid income distribution in top decile' };
    }

    // 3. Calculate ratio: share of income in adjusted distribution captured by survey
    const naRatio = nasMean / surveyMean;
    const ratio = 1 / (1 + gapShare * (naRatio - 1));

    // 4. Calculate ratio2 for top decile specifically
    const topDecileShare = 1 - topDecileL;
    const ratio2 = topDecileShare / (topDecileShare + gapShare * (naRatio - 1));

    // 5. Calculate Pareto parameter alpha
    const logRatio = Math.log(minY / maxY);
    if (logRatio === 0) {
        return { adjusted: false, reason: 'Cannot calculate alpha (identical incomes in top decile)' };
    }

    const alpha = Math.log(1 - ratio2) / logRatio + 1;

    if (alpha <= 1 || !isFinite(alpha)) {
        return {
            adjusted: false,
            reason: `Invalid Pareto alpha (${alpha.toFixed(3)} <= 1)`,
            surveyMean,
            nasMean,
            gap,
            gapPercent
        };
    }

    // 6. Calculate survey share of top section (using Pareto CDF)
    const surveyPctTop = 1 - Math.pow(minY / maxY, alpha);

    // 7. Calculate survey share of total adjusted population
    const surveyPct = 1 / (1 + (1 - topDecileP) * (1 - surveyPctTop));

    // 8. Rescale ALL original distribution points
    // From Stata: p_adj = p * survey_pct, l_adj = l * ratio
    const rescaledOriginal = distribution.map(d => ({
        p: d.p * surveyPct,
        l: d.l * ratio,
        w: d.w,
        isPareto: false,
        originalP: d.p,
        originalL: d.l
    }));

    // 9. Generate Pareto tail bins (NEW observations beyond survey)
    const paretoTail = generateParetoTail(
        alpha,
        surveyPctTop,
        ratio,
        topDecileL,
        topDecileP,
        surveyPct
    );

    // 10. Combine: rescaled original + Pareto tail
    const adjustedDist = combineDistributions(rescaledOriginal, paretoTail);

    // 11. Calculate adjusted mean
    const adjustedMean = surveyMean / ratio;

    return {
        adjusted: true,
        surveyMean,
        nasMean,
        adjustedMean,
        gap,
        gapPercent,
        gapShare,
        topDecileCutoff,

        // Pareto parameters
        alpha,
        ratio,
        ratio2,
        surveyPct,
        surveyPctTop,
        topDecileP,
        topDecileL,
        minY,
        maxY,

        // Distributions
        originalDist: distribution,
        adjustedDist,
        paretoTailBins: paretoTail.length
    };
}

/**
 * Generate Pareto tail bins for the elongated distribution
 *
 * These are NEW observations representing the missing top incomes.
 * From Stata code (06_apply_adjustment.do lines 354-361):
 * - p_pareto spans from surveyPctTop to 1.0 within the top section
 * - l_pareto = 1 - (1 - p_pareto)^(1 - 1/alpha)
 * - p_adj = p_pareto * (1 - top_decile_p) * survey_pct + (1 - survey_pct_top * (1 - top_decile_p)) * survey_pct
 * - l_adj = ratio * top_decile_l + l_pareto * (1 - ratio * top_decile_l)
 */
function generateParetoTail(alpha, surveyPctTop, ratio, topDecileL, topDecileP, surveyPct) {
    // Number of new bins
    const numBins = Math.max(1, Math.floor(100 * (1 - surveyPctTop)) + 1);
    const tail = [];

    for (let i = 1; i <= numBins; i++) {
        // p_pareto spans from surveyPctTop to 1.0 within the Pareto section
        const pPareto = surveyPctTop + (1 - surveyPctTop) * (i / numBins);

        // Pareto Lorenz formula: l_pareto = 1 - (1 - p_pareto)^(1 - 1/alpha)
        const lPareto = 1 - Math.pow(1 - pPareto, 1 - 1/alpha);

        // Rescale to total distribution (CORRECT formula from Stata line 354-356)
        // p_adj = p_pareto * (1 - top_decile_p) * survey_pct + (1 - survey_pct_top * (1 - top_decile_p)) * survey_pct
        const pAdj = pPareto * (1 - topDecileP) * surveyPct +
                     (1 - surveyPctTop * (1 - topDecileP)) * surveyPct;

        // l_adj = ratio * top_decile_l + l_pareto * (1 - ratio * top_decile_l)
        const lAdj = ratio * topDecileL + lPareto * (1 - ratio * topDecileL);

        tail.push({
            p: pAdj,
            l: lAdj,
            isPareto: true,
            pPareto,
            lPareto
        });
    }

    return tail;
}

/**
 * Combine rescaled original distribution with Pareto tail
 */
function combineDistributions(rescaled, paretoTail) {
    // Combine both arrays
    const combined = [...rescaled, ...paretoTail];

    // Sort by p
    combined.sort((a, b) => a.p - b.p);

    // Ensure we have origin point (0, 0)
    if (combined.length === 0 || combined[0].p > 0.001) {
        combined.unshift({ p: 0, l: 0, isPareto: false });
    }

    // Force the last point to exactly (1, 1)
    const last = combined[combined.length - 1];
    last.p = 1;
    last.l = 1;

    return combined;
}

/**
 * Get human-readable description of adjustment result
 */
export function getAdjustmentSummary(result) {
    if (!result.adjusted) {
        return `No adjustment: ${result.reason}`;
    }

    return `Adjustment applied:
- Survey mean: $${result.surveyMean.toFixed(2)}/day
- NAS mean: $${result.nasMean.toFixed(2)}/day
- Gap: ${result.gapPercent.toFixed(1)}%
- Gap share used: ${(result.gapShare * 100).toFixed(0)}%
- Pareto alpha: ${result.alpha.toFixed(3)}
- Survey coverage: ${(result.surveyPct * 100).toFixed(1)}% of adjusted population
- New Pareto bins: ${result.paretoTailBins}`;
}
