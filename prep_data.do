/*******************************************************************************
* prep_data.do - Prepare data for Chandy-Seidel web visualization
*
* PURPOSE:
*   Export welfare_adjusted.dta and dist_gaps.dta to JSON format for the
*   interactive web visualization tool.
*
* OUTPUT:
*   - data/countries.json        : Country metadata
*   - data/nas_data.json         : NAS means (HFCE, GDP) by country-year
*   - data/distributions/*.json  : Per-country distribution files
*
* USAGE:
*   1. Run main analysis pipeline first (to create welfare_adjusted.dta)
*   2. Run this script: do webviz/prep_data.do
*
*******************************************************************************/

// ============================================================================
// SETUP
// ============================================================================

clear all
set more off

// Auto-detect paths
local os = c(os)
if "`os'" == "MacOSX" | "`os'" == "Unix" {
    global project "/Users/espen/Library/CloudStorage/OneDrive-Personal/Research/NApov/2026"
}
else {
    global project "C:/Users/espen/OneDrive/Research/NApov/2026"
}

global webviz "$project/webviz"
global temp   "$project/data/temp"

// Create output directories
cap mkdir "$webviz/data"
cap mkdir "$webviz/data/distributions"

di _n "{hline 70}"
di "{bf:Preparing Data for Web Visualization}"
di "{hline 70}" _n

// ============================================================================
// 1. CREATE COUNTRIES.JSON - Country metadata
// ============================================================================

di "{bf:Creating countries.json...}"

use "$temp/welfare_adjusted.dta", clear

// Get unique countries and their available years
collapse (first) region_code, by(country_code year)

// Get list of years per country
bysort country_code (year): gen year_list = string(year) if _n == 1
bysort country_code (year): replace year_list = year_list[_n-1] + "," + string(year) if _n > 1
bysort country_code: egen years_str = max(year_list)

// Collapse to one row per country
collapse (first) region_code years_str, by(country_code)

// Add country names (basic mapping for major countries)
gen country_name = ""
replace country_name = "United States" if country_code == "USA"
replace country_name = "China" if country_code == "CHN"
replace country_name = "India" if country_code == "IND"
replace country_name = "Brazil" if country_code == "BRA"
replace country_name = "Nigeria" if country_code == "NGA"
replace country_name = "Indonesia" if country_code == "IDN"
replace country_name = "Germany" if country_code == "DEU"
replace country_name = "United Kingdom" if country_code == "GBR"
replace country_name = "France" if country_code == "FRA"
replace country_name = "Mexico" if country_code == "MEX"
replace country_name = "Japan" if country_code == "JPN"
replace country_name = "South Africa" if country_code == "ZAF"
replace country_name = "Russia" if country_code == "RUS"
replace country_name = "Canada" if country_code == "CAN"
replace country_name = "Australia" if country_code == "AUS"
replace country_name = "Argentina" if country_code == "ARG"
replace country_name = "Colombia" if country_code == "COL"
replace country_name = "Thailand" if country_code == "THA"
replace country_name = "Vietnam" if country_code == "VNM"
replace country_name = "Philippines" if country_code == "PHL"
replace country_name = "Egypt" if country_code == "EGY"
replace country_name = "Turkey" if country_code == "TUR"
replace country_name = "Poland" if country_code == "POL"
replace country_name = "Italy" if country_code == "ITA"
replace country_name = "Spain" if country_code == "ESP"
replace country_name = "South Korea" if country_code == "KOR"
replace country_name = "Bangladesh" if country_code == "BGD"
replace country_name = "Pakistan" if country_code == "PAK"
replace country_name = "Kenya" if country_code == "KEN"
replace country_name = "Ethiopia" if country_code == "ETH"
// Default: use country code as name
replace country_name = country_code if country_name == ""

// Write JSON
local n = _N
file open jsonfile using "$webviz/data/countries.json", write replace
file write jsonfile "["

forval i = 1/`n' {
    local cc = country_code[`i']
    local cn = country_name[`i']
    local rc = region_code[`i']
    local yrs = years_str[`i']

    if `i' > 1 {
        file write jsonfile ","
    }
    file write jsonfile _n `"  {"code": "`cc'", "name": "`cn'", "region": "`rc'", "years": [`yrs']}"'
}

file write jsonfile _n "]" _n
file close jsonfile

di "  Created: $webviz/data/countries.json"
di "  Countries: `n'"

// ============================================================================
// 2. CREATE NAS_DATA.JSON - National accounts data by country-year
// ============================================================================

di _n "{bf:Creating nas_data.json...}"

use "$temp/dist_gaps.dta", clear

// Keep relevant variables
keep country_code year dist_mean hfce_pc_ppp_daily gdp_pc_ppp_daily

// Drop missing
drop if missing(hfce_pc_ppp_daily) & missing(gdp_pc_ppp_daily)

// Sort
sort country_code year

// Get unique countries
levelsof country_code, local(countries)
local n_countries : word count `countries'

// Write JSON
file open jsonfile using "$webviz/data/nas_data.json", write replace
file write jsonfile "{"

local first_country = 1
foreach cc of local countries {
    preserve
    keep if country_code == "`cc'"
    local n_years = _N

    if `first_country' == 0 {
        file write jsonfile ","
    }
    local first_country = 0

    file write jsonfile _n `"  "`cc'": {"'

    forval i = 1/`n_years' {
        local yr = year[`i']
        local sm = dist_mean[`i']
        local hf = hfce_pc_ppp_daily[`i']
        local gd = gdp_pc_ppp_daily[`i']

        // Handle missing values
        if missing(`sm') local sm = "null"
        else local sm : di %9.4f `sm'
        if missing(`hf') local hf = "null"
        else local hf : di %9.4f `hf'
        if missing(`gd') local gd = "null"
        else local gd : di %9.4f `gd'

        if `i' > 1 {
            file write jsonfile ", "
        }
        file write jsonfile _n `"    "`yr'": {"survey_mean": `sm', "hfce": `hf', "gdp": `gd'}"'
    }

    file write jsonfile _n "  }"
    restore
}

file write jsonfile _n "}" _n
file close jsonfile

di "  Created: $webviz/data/nas_data.json"
di "  Countries: `n_countries'"

// ============================================================================
// 3. CREATE PER-COUNTRY DISTRIBUTION FILES
// ============================================================================

di _n "{bf:Creating per-country distribution files...}"

use "$temp/welfare_adjusted.dta", clear

// Keep essential variables only
keep country_code year quantile new p l y_survey pop

// Downsample: keep every 10th bin (plus all Pareto tail bins)
keep if mod(quantile, 10) == 0 | new == 1

// Sort
sort country_code year p

// Get unique countries
levelsof country_code, local(countries)
local n_countries : word count `countries'
local counter = 0

foreach cc of local countries {
    local counter = `counter' + 1

    preserve
    keep if country_code == "`cc'"

    // Get years for this country
    levelsof year, local(years)

    // Write JSON for this country
    file open jsonfile using "$webviz/data/distributions/`cc'.json", write replace
    file write jsonfile `"{"code": "`cc'", "years": {"'

    local first_year = 1
    foreach yr of local years {
        preserve
        keep if year == `yr'
        local n_bins = _N

        if `first_year' == 0 {
            file write jsonfile ","
        }
        local first_year = 0

        file write jsonfile _n `"  "`yr'": {"bins": ["'

        forval i = 1/`n_bins' {
            local q = quantile[`i']
            local pp = p[`i']
            local ll = l[`i']
            local ww = y_survey[`i']
            local isnew = new[`i']

            // Handle missing/null
            if missing(`pp') local pp = "null"
            else local pp : di %9.6f `pp'
            if missing(`ll') local ll = "null"
            else local ll : di %9.6f `ll'
            if missing(`ww') local ww = "null"
            else local ww : di %9.4f `ww'
            if missing(`isnew') local isnew = 0

            if `i' > 1 {
                file write jsonfile ","
            }
            file write jsonfile _n `"    {"q": `q', "p": `pp', "l": `ll', "w": `ww', "new": `isnew'}"'
        }

        file write jsonfile _n "  ]}"
        restore
    }

    file write jsonfile _n "}}" _n
    file close jsonfile

    // Progress
    if mod(`counter', 20) == 0 {
        di "  Processed `counter' / `n_countries' countries..."
    }

    restore
}

di "  Created `n_countries' distribution files in $webviz/data/distributions/"

// ============================================================================
// SUMMARY
// ============================================================================

di _n "{hline 70}"
di "{bf:DATA PREPARATION COMPLETE}"
di "{hline 70}"
di ""
di "Output files:"
di "  $webviz/data/countries.json"
di "  $webviz/data/nas_data.json"
di "  $webviz/data/distributions/*.json (`n_countries' files)"
di ""
di "To use the web tool:"
di "  1. cd $webviz"
di "  2. python -m http.server 8000"
di "  3. Open http://localhost:8000"
di "{hline 70}" _n
