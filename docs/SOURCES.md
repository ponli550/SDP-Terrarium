# Where the numbers come from

Every figure in Terrarium carries one of three grades.

- **REAL**: public data, cited, used as published.
- **SOURCED**: an assumption that has a published source we read.
- **ILLUSTRATIVE**: a placeholder of ours, to be replaced. It is labelled on screen and never headlined.

This file says, for each figure that is not purely ours, what the source is, what we checked and how, and what we did not. The app's "About the numbers" page is generated from the model's own assumptions, so it cannot drift from what the model uses; this file adds the detail. Last checked: 22 Oct 2026.

## SOURCED

### Grid emission factor: 0.740 kg CO2e per kWh

- **Source:** Suruhanjaya Tenaga (Energy Commission), *Grid Emission Factor (GEF) in Malaysia, 2022-2024 (Provisional)*, published 23 Feb 2026. https://myenergystats.st.gov.my/documents/d/guest/grid-emission-factor-gef-in-malaysia-2022-2024-provisional-
- **Value used:** Peninsular Malaysia, 2024: 0.740 Gg CO2e/GWh, which is the same as 0.740 kg CO2e/kWh. (2023: 0.760. 2022: 0.769.) Elmina is in Selangor, so the Peninsular figure applies.
- **What we checked:** we read the PDF's text, not a summary. Its own totals agree: 110,555 Gg CO2e over 149,301 GWh of net generation is 0.740.
- **Caveats the source gives:** the figures are provisional and subject to final endorsement by the Government of Malaysia; they use Tier 1 emission factors; they include generators that may sell Renewable Energy Certificates, so they may not reflect electricity whose renewable claim was sold separately.
- **Not checked:** whether a later release has replaced it.

### Domestic electricity tariff, Peninsular Malaysia, 1 Jul 2025 to 31 Dec 2027

- **Value used:** energy charge 27.03 sen/kWh (for a month up to 1,500 kWh), capacity charge 4.55 sen/kWh, network charge 12.85 sen/kWh, which add up to 44.43 sen/kWh; plus a retail charge of RM10 a month that is waived for 600 kWh or less. Above 1,500 kWh the energy charge is reported as 37.03 sen/kWh.
- **What we read:**
  - The per-charge figures: one news explainer, read directly (Carz, "New TNB electricity tariff structure from July 1 2025", June 2025, https://carz.com.my/2025/06/new-tnb-electricity-tariff-structure-from-july-1-2025). A second explainer (SoyaCincau, 21 Jun 2025) was reported by a search to give the same numbers, but its page returned an error, so we did not read it.
  - The structure and dates, from the regulator's own announcement as reported by Bernama (https://www.bernama.com/bm/news.php?id=2436367): the Energy Commission announced the schedule, it runs from 1 Jul 2025 to 31 Dec 2027, the average base tariff is 45.40 sen/kWh (down from 45.62 sen/kWh approved in Dec 2024), energy, capacity, network and retail are separate charges, and the Automatic Fuel Adjustment (AFA) replaces the ICPT.
  - A TNB-hosted newspaper clip (Sinar Harian, 22 Jun 2025) repeats the 45.40 average and the energy efficiency incentive.
- **Not checked:** the per-charge figures in TNB's or the Energy Commission's own tariff schedule. The TNB pages we could open do not show the numbers (they load in the app). So this is graded SOURCED from a secondary report, not REAL.
- **Left out of the model:**
  - AFA, which changes every month and can be a surcharge or a rebate.
  - Service tax, reported at 8% above 600 kWh (not confirmed in a primary source).
  - The energy efficiency incentive for homes using 1,000 kWh or less (the amount is not confirmed in a primary source).
  - Time-of-use pricing.
- **Unclear:** whether the 37.03 sen rate above 1,500 kWh applies to all units or only the excess. It does not matter below 1,500 kWh, which covers the homes the model shows.
- **What follows from it:** a bill in RM is graded SOURCED only when the kWh behind it is the owner's own bill. A simulated month stays ILLUSTRATIVE, because the kWh is a guess even when the tariff is real.

### Effect of home energy reports: about 2% (ceiling on how much a nudge can cut)

- **Source:** Allcott, H. (2011), *Social norms and energy conservation*, Journal of Public Economics. About 2.0% average electricity reduction.
- **Not re-checked on 22 Oct 2026.** Carried from the first build of the project.

## REAL

- **0.93 km** from Elmina's township centre to the nearest public transit stop, and **5.4 km** to the nearest rail station: public timetable feeds on data.gov.my (GTFS). The centre is approximate and the distance is a straight line. It is a distance, not a complaint.
- **1,450 trees** along a 500 m stretch of the Elmina Urban Biodiversity Corridor: Sime Darby Property's 2024 sustainability highlights slide.
- **Not re-checked on 22 Oct 2026.** Carried from the first build of the project.

## ILLUSTRATIVE (ours, to be replaced)

The air-con draw and how it falls with the setpoint, peak sun hours, solar performance, the share of daytime use solar can offset, car emissions and running cost, walking pace, short trips per week, the extra cooling load under a roof, how many levels a plot tree can shade, lift time per level, the shade a tree gives, the four pillar score formulas, the weather, the household sizes for each home type, and the **neighbour**: one fixed household (terrace, 8 hours of air-con at 24, no solar, 20% of trips on foot, 2 trees at 20% native). The neighbour is not real data.

## What is not modelled

Soil, water and drainage (the ground layers in the exploded view are a drawing), appliances other than air-con, how many people live in the home, the time of day a household uses electricity, and anything about a real buyer or a real Elmina home.
