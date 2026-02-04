# Chandy-Seidel Adjustment Visualization

Interactive web-based tool for exploring the Chandy-Seidel Pareto elongation method for adjusting income distributions.

## Overview

This tool allows you to:
- Select country-year combinations and visualize their income distributions
- Apply the Chandy-Seidel adjustment with customizable parameters
- Compare original (survey) and adjusted Lorenz curves
- View Gini coefficients before and after adjustment
- Download results as CSV files

## Quick Start

### 1. Generate Data (if not already done)

Run the Stata script to prepare data from the main analysis:

```stata
cd /Users/espen/Library/CloudStorage/OneDrive-Personal/Research/NApov/2026
do webviz/prep_data.do
```

This creates JSON files in `webviz/data/` from `data/temp/welfare_adjusted.dta`.

### 2. Start Local Server

Using Python (built-in):

```bash
cd /Users/espen/Library/CloudStorage/OneDrive-Personal/Research/NApov/2026/webviz
python -m http.server 8000
```

Using Node.js:

```bash
npx serve webviz
```

### 3. Open in Browser

Navigate to: http://localhost:8000

## Usage

1. **Select a Country**: Choose from the dropdown (grouped by region)
2. **Select a Year**: Use the slider or enter directly
3. **Click "Load Distribution"**: Fetches and displays the data
4. **Adjust Parameters**:
   - **Gap Share**: Fraction of survey-NAS gap attributed to missing top incomes (default 50%)
   - **NAS Source**: Choose between HFCE (Household Consumption) or GDP
5. **View Results**: Lorenz curves update in real-time
6. **Download**: Export adjusted distribution or summary statistics as CSV

## Methodology

The Chandy-Seidel adjustment (Chandy & Seidel, 2017) addresses underreporting of top incomes in household surveys by:

1. **Identifying the gap**: Comparing survey mean to National Accounts (NAS)
2. **Attributing to top**: Assuming a fraction (default 50%) of the gap is due to missing top incomes
3. **Fitting a Pareto tail**: Calculating a Pareto parameter (alpha) for the missing top distribution
4. **Elongating the distribution**: Adding new bins for the imputed top incomes
5. **Rescaling**: Adjusting the original distribution to account for the new population

### Key Formulas

- **Ratio**: `ratio = 2 / (1 + NAS/survey)` (share of income captured by survey)
- **Pareto alpha**: `alpha = log(1 - ratio2) / log(min_y / max_y) + 1`
- **Pareto Lorenz**: `L(p) = 1 - (1-p)^(1-1/alpha)`
- **Gini**: `Gini = 1 - 2 * (area under Lorenz curve)`

## File Structure

```
webviz/
├── index.html          # Main application
├── css/styles.css      # Styling
├── js/
│   ├── app.js          # Main application logic
│   ├── chandy-seidel.js # Core adjustment calculations
│   ├── lorenz.js       # Gini and Lorenz utilities
│   ├── chart.js        # D3.js visualization
│   ├── data-loader.js  # Data fetching and caching
│   └── export.js       # CSV export
├── data/
│   ├── countries.json  # Country metadata
│   ├── nas_data.json   # NAS values by country-year
│   └── distributions/  # Per-country distribution files
├── prep_data.do        # Stata script to generate data
└── README.md           # This file
```

## Data Format

### distributions/{country}.json

```json
{
  "code": "USA",
  "years": {
    "2019": {
      "bins": [
        {"q": 10, "p": 0.01, "l": 0.0016, "w": 6.77, "new": 0},
        ...
      ],
      "survey_mean": 42.30
    }
  }
}
```

- `q`: Quantile (1-1000, downsampled to ~100)
- `p`: Cumulative population share
- `l`: Cumulative income share (Lorenz)
- `w`: Average welfare ($/day, 2021 PPP)
- `new`: Flag for Pareto tail bins (0 or 1)

### nas_data.json

```json
{
  "USA": {
    "2019": {"survey_mean": 42.30, "hfce": 58.40, "gdp": 76.20}
  }
}
```

## Reference

Chandy, L., & Seidel, B. (2017). *How much do we really know about inequality within countries around the world? Adjusting Gini coefficients for missing top incomes.* Brookings Institution.

## Dependencies

- D3.js v7 (loaded from CDN)
- Bootstrap 5.3 CSS (loaded from CDN)

All dependencies can be loaded locally for offline use by placing them in the `lib/` folder.

## Browser Support

Tested on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
