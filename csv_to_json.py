#!/usr/bin/env python3
"""
Convert distributions CSV exported by Stata into compact columnar JSON files.

Produces two file organizations for fast retrieval:
  - data/dist/{CODE}.json        : Per-country (all years) for interactive use
  - data/dist-by-year/{YEAR}.json : Per-year (all countries) for batch operations

Columnar format stores arrays of values instead of repeating keys per row:
  {"p":[0.001,0.002,...], "l":[...], "w":[...], "n":[0,0,...]}
"""

import csv
import json
import os
import sys
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(SCRIPT_DIR, "data", "_temp_distributions.csv")
DIST_DIR = os.path.join(SCRIPT_DIR, "data", "dist")
YEAR_DIR = os.path.join(SCRIPT_DIR, "data", "dist-by-year")

# ISO3 -> Country name mapping (covers ~200 countries)
COUNTRY_NAMES = {
    "ABW": "Aruba", "AFG": "Afghanistan", "AGO": "Angola", "ALB": "Albania",
    "AND": "Andorra", "ARE": "United Arab Emirates", "ARG": "Argentina",
    "ARM": "Armenia", "ASM": "American Samoa", "ATG": "Antigua and Barbuda",
    "AUS": "Australia", "AUT": "Austria", "AZE": "Azerbaijan", "BDI": "Burundi",
    "BEL": "Belgium", "BEN": "Benin", "BFA": "Burkina Faso", "BGD": "Bangladesh",
    "BGR": "Bulgaria", "BHR": "Bahrain", "BHS": "Bahamas", "BIH": "Bosnia and Herzegovina",
    "BLR": "Belarus", "BLZ": "Belize", "BMU": "Bermuda", "BOL": "Bolivia",
    "BRA": "Brazil", "BRB": "Barbados", "BTN": "Bhutan", "BWA": "Botswana",
    "CAF": "Central African Republic", "CAN": "Canada", "CHE": "Switzerland",
    "CHI": "Channel Islands", "CHL": "Chile", "CHN": "China",
    "CIV": "Cote d'Ivoire", "CMR": "Cameroon", "COD": "Congo, Dem. Rep.",
    "COG": "Congo, Rep.", "COL": "Colombia", "COM": "Comoros",
    "CPV": "Cabo Verde", "CRI": "Costa Rica", "CUB": "Cuba", "CUW": "Curacao",
    "CYM": "Cayman Islands", "CYP": "Cyprus", "CZE": "Czech Republic",
    "DEU": "Germany", "DJI": "Djibouti", "DMA": "Dominica", "DNK": "Denmark",
    "DOM": "Dominican Republic", "DZA": "Algeria", "ECU": "Ecuador",
    "EGY": "Egypt", "ERI": "Eritrea", "ESP": "Spain", "EST": "Estonia",
    "ETH": "Ethiopia", "FIN": "Finland", "FJI": "Fiji", "FRA": "France",
    "FRO": "Faroe Islands", "FSM": "Micronesia", "GAB": "Gabon",
    "GBR": "United Kingdom", "GHA": "Ghana", "GIB": "Gibraltar",
    "GIN": "Guinea", "GMB": "Gambia", "GNB": "Guinea-Bissau", "GRC": "Greece",
    "GRD": "Grenada", "GRL": "Greenland", "GTM": "Guatemala", "GUM": "Guam",
    "GUY": "Guyana", "HKG": "Hong Kong SAR, China", "HND": "Honduras",
    "HRV": "Croatia", "HTI": "Haiti", "HUN": "Hungary", "IDN": "Indonesia",
    "IMN": "Isle of Man", "IND": "India", "IRL": "Ireland", "IRN": "Iran",
    "IRQ": "Iraq", "ISL": "Iceland", "ISR": "Israel", "ITA": "Italy",
    "JAM": "Jamaica", "JOR": "Jordan", "JPN": "Japan", "KAZ": "Kazakhstan",
    "KEN": "Kenya", "KGZ": "Kyrgyz Republic", "KHM": "Cambodia",
    "KIR": "Kiribati", "KNA": "St. Kitts and Nevis", "KOR": "Korea, Rep.",
    "KWT": "Kuwait", "LAO": "Lao PDR", "LBR": "Liberia", "LBY": "Libya",
    "LCA": "St. Lucia", "LIE": "Liechtenstein", "LKA": "Sri Lanka",
    "LTU": "Lithuania", "LUX": "Luxembourg", "LVA": "Latvia",
    "MAF": "St. Martin", "MAR": "Morocco", "MCO": "Monaco", "MDA": "Moldova",
    "MDG": "Madagascar", "MDV": "Maldives", "MEX": "Mexico",
    "MHL": "Marshall Islands", "MKD": "North Macedonia", "MLI": "Mali",
    "MLT": "Malta", "MMR": "Myanmar", "MNE": "Montenegro", "MNG": "Mongolia",
    "MOZ": "Mozambique", "MRT": "Mauritania", "MUS": "Mauritius",
    "MWI": "Malawi", "MYS": "Malaysia", "NAM": "Namibia",
    "NCL": "New Caledonia", "NER": "Niger", "NGA": "Nigeria",
    "NIC": "Nicaragua", "NLD": "Netherlands", "NOR": "Norway", "NPL": "Nepal",
    "NRU": "Nauru", "NZL": "New Zealand", "OMN": "Oman", "PAK": "Pakistan",
    "PAN": "Panama", "PER": "Peru", "PHL": "Philippines", "PLW": "Palau",
    "PNG": "Papua New Guinea", "POL": "Poland", "PRI": "Puerto Rico",
    "PRK": "Korea, Dem. People's Rep.", "PRT": "Portugal", "PRY": "Paraguay",
    "PSE": "West Bank and Gaza", "PYF": "French Polynesia", "QAT": "Qatar",
    "ROU": "Romania", "RUS": "Russian Federation", "RWA": "Rwanda",
    "SAU": "Saudi Arabia", "SDN": "Sudan", "SEN": "Senegal", "SGP": "Singapore",
    "SLB": "Solomon Islands", "SLE": "Sierra Leone", "SLV": "El Salvador",
    "SMR": "San Marino", "SOM": "Somalia", "SRB": "Serbia",
    "SSD": "South Sudan", "STP": "Sao Tome and Principe", "SUR": "Suriname",
    "SVK": "Slovak Republic", "SVN": "Slovenia", "SWE": "Sweden",
    "SWZ": "Eswatini", "SXM": "Sint Maarten", "SYC": "Seychelles",
    "SYR": "Syria", "TCA": "Turks and Caicos Islands", "TCD": "Chad",
    "TGO": "Togo", "THA": "Thailand", "TJK": "Tajikistan",
    "TKM": "Turkmenistan", "TLS": "Timor-Leste", "TTO": "Trinidad and Tobago",
    "TUN": "Tunisia", "TUR": "Turkiye", "TUV": "Tuvalu",
    "TWN": "Taiwan, China", "TZA": "Tanzania", "UGA": "Uganda",
    "UKR": "Ukraine", "URY": "Uruguay", "USA": "United States",
    "VCT": "St. Vincent and the Grenadines", "VEN": "Venezuela",
    "VGB": "British Virgin Islands", "VIR": "Virgin Islands (U.S.)",
    "VNM": "Vietnam", "VUT": "Vanuatu", "WSM": "Samoa", "XKX": "Kosovo",
    "YEM": "Yemen", "ZAF": "South Africa", "ZMB": "Zambia", "ZWE": "Zimbabwe",
}


def main():
    if not os.path.exists(CSV_FILE):
        print(f"ERROR: CSV file not found: {CSV_FILE}")
        print("Run prep_data.do in Stata first.")
        sys.exit(1)

    os.makedirs(DIST_DIR, exist_ok=True)
    os.makedirs(YEAR_DIR, exist_ok=True)

    # Pass 1: Read CSV into memory, organized by country -> year -> sorted bins
    print(f"Reading {CSV_FILE}...")
    # data[country][year] = list of (quantile, p, l, w, new) tuples
    data = defaultdict(lambda: defaultdict(list))

    with open(CSV_FILE, 'r') as f:
        reader = csv.DictReader(f)
        row_count = 0
        for row in reader:
            cc = row['country_code']
            yr = row['year']

            p = float(row['p']) if row['p'] else None
            l = float(row['l']) if row['l'] else None
            w = float(row['y_survey']) if row['y_survey'] else None
            n = int(float(row['new'])) if row['new'] else 0

            # Skip empty placeholder bins (new=1 with null values)
            if p is None and l is None:
                continue

            data[cc][yr].append((p, l, w, n))
            row_count += 1

            if row_count % 1000000 == 0:
                print(f"  Read {row_count:,} rows...")

    n_countries = len(data)
    print(f"  Total: {row_count:,} rows, {n_countries} countries")

    # Sort bins within each country-year by p (cumulative population share)
    for cc in data:
        for yr in data[cc]:
            data[cc][yr].sort(key=lambda x: (x[0] or 0))

    # Pass 2: Write per-country files (columnar format)
    print(f"\nWriting per-country files to {DIST_DIR}/...")
    for i, cc in enumerate(sorted(data.keys()), 1):
        country_obj = {}
        for yr in sorted(data[cc].keys()):
            bins = data[cc][yr]
            country_obj[yr] = _bins_to_columnar(bins)

        filepath = os.path.join(DIST_DIR, f"{cc}.json")
        with open(filepath, 'w') as f:
            json.dump(country_obj, f, separators=(',', ':'))

        if i % 50 == 0:
            print(f"  {i}/{n_countries} countries...")

    print(f"  Done: {n_countries} files")

    # Pass 3: Write per-year files (columnar format)
    # Collect all years
    all_years = set()
    for cc in data:
        all_years.update(data[cc].keys())

    print(f"\nWriting per-year files to {YEAR_DIR}/...")
    for i, yr in enumerate(sorted(all_years), 1):
        year_obj = {}
        for cc in sorted(data.keys()):
            if yr in data[cc]:
                bins = data[cc][yr]
                year_obj[cc] = _bins_to_columnar(bins)

        filepath = os.path.join(YEAR_DIR, f"{yr}.json")
        with open(filepath, 'w') as f:
            json.dump(year_obj, f, separators=(',', ':'))

        if i % 10 == 0:
            print(f"  {i}/{len(all_years)} years...")

    print(f"  Done: {len(all_years)} files")

    # Pass 4: Generate countries.json from the data we have
    # (Stata batch mode has trouble writing this file reliably)
    print(f"\nGenerating countries.json...")
    countries_list = []
    for cc in sorted(data.keys()):
        years = sorted(int(y) for y in data[cc].keys())
        countries_list.append({
            "code": cc,
            "name": COUNTRY_NAMES.get(cc, cc),
            "region": "",
            "years": years
        })

    countries_path = os.path.join(SCRIPT_DIR, "data", "countries.json")
    with open(countries_path, 'w') as f:
        json.dump(countries_list, f, separators=(',', ':'))
    print(f"  Done: {len(countries_list)} countries")

    # Summary
    dist_size = sum(
        os.path.getsize(os.path.join(DIST_DIR, f))
        for f in os.listdir(DIST_DIR) if f.endswith('.json')
    )
    year_size = sum(
        os.path.getsize(os.path.join(YEAR_DIR, f))
        for f in os.listdir(YEAR_DIR) if f.endswith('.json')
    )
    print(f"\nSummary:")
    print(f"  Per-country files: {n_countries} files, {dist_size/1e6:.1f} MB")
    print(f"  Per-year files:    {len(all_years)} files, {year_size/1e6:.1f} MB")
    print(f"  Total:             {(dist_size+year_size)/1e6:.1f} MB")


def _bins_to_columnar(bins):
    """Convert list of (p, l, w, n) tuples to columnar dict."""
    p_arr = []
    l_arr = []
    w_arr = []
    n_arr = []

    for p, l, w, n in bins:
        p_arr.append(round(p, 6) if p is not None else None)
        l_arr.append(round(l, 6) if l is not None else None)
        w_arr.append(round(w, 4) if w is not None else None)
        n_arr.append(n)

    result = {"p": p_arr, "l": l_arr, "w": w_arr}

    # Only include n array if there are any new=1 bins (saves space for most country-years)
    if any(v == 1 for v in n_arr):
        result["n"] = n_arr

    return result


if __name__ == "__main__":
    main()
