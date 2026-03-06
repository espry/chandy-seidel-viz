# Chandy-Seidel Adjustment Visualization

Interactive web tool for adjusting income distributions to account for missing top incomes in household surveys, using the Chandy-Seidel Pareto elongation method (Chandy & Seidel, 2017).

Select a country-year, adjust gap share and NAS source, and compare survey vs. adjusted Lorenz curves, Gini coefficients, mean income, and top 10% shares in real time. Export results as CSV.

## Quick Start

```bash
# 1. Generate data (from the project root, in Stata)
do webviz/prep_data.do

# 2. Serve locally
cd webviz && python -m http.server 8000

# 3. Open http://localhost:8000
```

## File Structure

```
webviz/
├── index.html                # Main page
├── css/styles.css
├── js/
│   ├── app.js                # UI coordination
│   ├── chandy-seidel.js      # Core adjustment math
│   ├── lorenz.js             # Gini / Lorenz utilities
│   ├── chart.js              # D3.js visualization
│   ├── data-loader.js        # Fetch, cache, columnar→row conversion
│   └── export.js             # CSV export
├── data/
│   ├── countries.json        # [{code, name, region, years}]
│   ├── nas_data.json         # {CODE: {YEAR: {survey_mean, hfce, gdp}}}
│   ├── dist/{CODE}.json      # Per-country, compact columnar (used by app)
│   └── dist-by-year/{YEAR}.json  # Per-year, same format
├── prep_data.do              # Stata script to generate data/
└── README.md
```

### Columnar format (`dist/{CODE}.json`)

```json
{"2019": {"p": [0.001, ...], "l": [0.00001, ...], "w": [0.57, ...], "n": [0, ...]}}
```

`p` = cumulative population share, `l` = Lorenz ordinate, `w` = welfare ($/day 2021 PPP), `n` = Pareto flag (0/1).

## Methodology

1. Compare survey mean to NAS (HFCE or GDP)
2. Attribute a share of the gap to missing top incomes (default 50%)
3. Fit Pareto tail from relative income range in top decile
4. Append imputed bins, rescale original distribution

Key formulas:
- `ratio = 1 / (1 + gap_share * (NAS/survey - 1))`
- `alpha = log(1 - ratio2) / log(min_y / max_y) + 1`
- Pareto Lorenz: `L(p) = 1 - (1-p)^(1 - 1/alpha)`

Dependencies: D3.js v7, Bootstrap 5.3 (both CDN, no build step).

## Reference

Chandy, L., & Seidel, B. (2017). *How much do we really know about inequality within countries around the world?* Brookings Institution.
