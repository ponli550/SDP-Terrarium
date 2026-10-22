## What will living here cost me?

Terrarium · Team SelfDev

See a month in your home before you sign for it. Township of Tomorrow · Elmina.

## Team Information

- **Team Name:** SelfDev
- **Team Leader:** Irfan Ali
- **University:** [University to add]
- **Team Members:** Irfan Ali (software engineer), Imarsya (cyber security), Aimi (data science), Adief (cyber security), Bashirah (forensics)
- **Email:** [Email to add]
- **Contact Number:** [Contact number to add]

## 1. The Problem

- A buyer signs for a home without knowing what it will cost to live in.
- The electricity bill, the daily trips and how the home copes in a hot week are all discovered after handover.
- A showroom shows 3D models of the township, the LRT line, the houses and the apartments. It cannot show how a home behaves, what it costs to run, or whether it floods.
- Every buyer is affected. **We have not yet spoken to one.** [Buyer quote to add]

## 2. Target User

- **Who:** a buyer choosing between a terrace, a semi-D and a condo, and which floor, in Elmina.
- **Their challenge:** price and layout are the only numbers they can compare; running cost and heat are guesses.
- **After handover:** the same person, now an owner, who can check the model against a real electricity bill.
- **Not yet validated:** we have not interviewed a buyer, and a township manager's view is still to be asked.

## 3. Your Solution

- **Terrarium:** a buyer-facing simulation of one month in an Elmina home, in 3D and as a dashboard.
- Pick the home, the floor (up to 35 levels) and the lot, run the month, and each week set air-con, setpoint and walking.
- It scores the home on SDP's four pillars: Energy Low Carbon, Climate Resilience, Community Experience, Urban Biodiversity.
- It shows what to change, with the effect on score, carbon and money.

## 4. Innovation

- **A month lived before you sign,** not a showroom model: one simulation sets the bill, the carbon and the comfort.
- **Honest numbers:** every figure is graded REAL, SOURCED or ILLUSTRATIVE, and only a real one is coloured as a verdict.
- **A checked assistant,** not a language model: every figure it says is recomputed from the model before it is shown. Your own AI assistant can use it through MCP.
- **Different from today's tools:** SDP's own app covers billing, defects and a virtual tour; we found nothing in it on running costs (the source is undated).

## 5. How it Works

- 1. Sign in, set your home, place your lot.
- 2. See your month first: bill, carbon, trips and comfortable nights, each graded.
- 3. Compare another home type, floor or lot.
- 4. Play four weeks and set air-con, setpoint and walking.
- 5. Get scored on the four pillars against an illustrative neighbour.
- 6. After handover, type your real bill: the electricity figure becomes your own.

## 6. Impact

- A buyer compares running cost and heat, not only price and layout.
- A nudge toward less air-con and more walking. Home energy reports cut electricity by about 2% (Allcott 2011): a ceiling, not our result.
- At scale, any home SDP sells could show its month.
- **We have not measured any effect of our tool.**

## 7. Feasibility

- **Runs today** in the browser: 278 automated tests, 360 page checks and 118 checks in a real browser.
- **Public data only, no SDP data:** one real distance (0.93 km), a sourced grid factor and a sourced tariff.
- **Light to run:** a static site and a small account service.
- **Limits:** the air-con and shade maths and the score formulas are placeholders; flooding is not modelled.

## 8. Implementation

- **Now:** ask recent buyers and a township manager what they want to see.
- **Pilot (proposed):** eight weeks, one Elmina phase, new owners; collect only monthly kWh and home type, with consent (PDPA).
- **Measure** uptake and the gap between the simulated month and the real bill. It cannot show savings.
- **Then** replace placeholders with a metered home, add a water layer for flooding, and swap a township's stops, tariff and trees to replicate.
- Nothing is agreed with SDP yet.

## Visual Concept

![The 3D map on the left and the Analysis dashboard on the right, for a condo on level 12](docs/media/visual-concept.png)

## Why Your Team Should Win

We built what a showroom cannot show: a month in the home, before you sign. It runs today, on public data only, and says plainly what is real, what is sourced and what is a placeholder. Most of it is placeholder, and the page says so. We also name what we have not done: no buyer interview yet, and no flooding model. The four pillars are Sime Darby Property's own. Give us a pilot home and a bill, and the placeholders become measurements.

## Thank You

Terrarium · Team SelfDev

## Appendix A. Where the numbers come from

- **REAL:** 0.93 km to the nearest transit stop and 5.4 km to rail (data.gov.my GTFS feeds); 1,450 corridor trees (SDP 2024 slide).
- **SOURCED:** grid factor 0.740 kg CO2e per kWh (Energy Commission, 2024, provisional); July 2025 tariff, 44.43 sen per kWh plus RM 10 a month above 600 kWh (a news report of the schedule); about 2% from home energy reports (Allcott 2011).
- **ILLUSTRATIVE:** everything else: the air-con and shade maths, the score formulas, the neighbour (one made-up household). The About page lists every number with its source.

## Appendix B. What we have not checked

- That buyers want this, or that it changes any behaviour. We have not interviewed a buyer.
- The tariff in the regulator's or TNB's own schedule (we read a news report), and whether a final grid factor replaces the provisional 2024 one.
- Flooding, soil and drainage are not modelled; the ground layers in the exploded view are a drawing.
- Safari, Firefox and a real phone: the browser tests ran on Chrome on one Mac.
- Accounts have no email verification and no deletion; a forgotten password is recovered only with a one-time recovery code.

## Appendix C. Why it fits Sime Darby Property

- SDP's purpose is "Real Estate as a Value Multiplier for People, Businesses, Economies & the Planet". We score a home on its four pillars.
- SDP's 40% target covers its own operations (Scope 1 and 2). A resident's side is outside it; we make one home's side visible. We have not confirmed that mapping.
- Links to SDP's PRIME rewards and to mall visits are hypotheses we have not tested.

## Appendix D. Sources

- data.gov.my GTFS feeds (Prasarana, KTMB); Elmina centre from OpenStreetMap.
- Energy Commission, Grid Emission Factor in Malaysia 2022-2024 (Provisional), 23 Feb 2026.
- July 2025 tariff: Carz explainer; Energy Commission announcement via Bernama. Detail: docs/SOURCES.md.
- SDP app listing, EdgeProp launch article, SDP Sustainability Strategy 2025-2030 slide.
- Allcott (2011), Journal of Public Economics 95; J-PAL, Opower evaluation.
