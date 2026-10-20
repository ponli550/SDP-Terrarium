## What will living here cost me?

See a month in your home before you sign for it

Township of Tomorrow · Elmina

**Team:** Irfan Ali (software engineer) · Imarsya (cyber security) · Aimi (data science) · Adief (cyber security) · Bashirah (forensics)

## The problem

A buyer signs for a home without knowing what it will cost to live in. **The electricity bill, the daily trips, and how the house copes with a hot week are all discovered after handover.**

Today the price and the layout are the only things a buyer can see.

**We have not yet spoken to a buyer. That conversation is our first next step.** [Buyer quote to add]

## What exists today

Sime Darby Property's own app helps owners with billing, documents, vacant-possession preparation and defect reports, and shows a virtual tour of selected properties.

**We found nothing in it about running costs, energy or travel.** The launch article is undated, so the feature list may have grown.

## What we measured

Elmina's nearest public transit stop is **0.93 km** from the township centre, and the nearest rail station is 5.4 km away. These come from public timetable feeds (data.gov.my), with an approximate centre and straight-line distance.

**That is a distance, not a complaint.** Whether residents find it a problem is exactly what we have not yet asked.

## What we built

![Elmina in 3D: a condo among its neighbours, the bus stop 0.93 km away, and the biodiversity corridor](docs/media/lab.png)
You pick a home, then run it for a month. **Everything that moves is illustrative.**

## How it works

1. **Sign in, set your home, place your lot.** Edit any of it later.
2. **See your month first,** with every figure checked.
3. **Compare** another home type, floor or lot side by side.
4. **Each week,** set air-con, setpoint and walking.
5. **Watch the week** play out in the township.
6. **Get scored** on SDP's four pillars against a neighbour.
7. **Learn the one change** that cuts the most carbon without costing comfort.

## The same model drives everything

![At night the windows light and the air-con glows on your home; a tall block and more trees show another choice](docs/media/night.png)
One simulation sets the bill, the carbon and the comfort, so what you see is what is scored.

## Pull your home apart

![Your home lifted floor by floor over the ground beneath it, your floor marked](docs/media/exploded.png)
Exploded view: your floors lift apart and your unit is marked. Studio view shows your home alone on a turntable. **The ground layers below (topsoil, subsoil, rock, groundwater) are a drawing; the model has no soil or water.**

## Why it fits Sime Darby Property

SDP's purpose is **"Real Estate as a Value Multiplier for People, Businesses, Economies & the Planet"**, and its strategy has four pillars. We score a home on all four: **Energy Low Carbon, Climate Resilience, Community Experience, Urban Biodiversity.**

SDP's 40% target covers its own operations (Scope 1 and 2). It says it is baselining Scope 3. **A resident's side is outside that target; we make one home's side visible. We have not confirmed that scope mapping.**

## Impact

Nudges work, modestly. Home energy reports cut electricity use by **about 2% on average** (Allcott 2011, roughly 600,000 US households; utilities ranged from 1.4% to 3.3%).

Per household that is small. The case is better buying decisions, and scale across a township. **We have not measured any effect of our tool, and every figure on screen is a placeholder until a real home replaces it.**

## Feasibility

A working prototype in the browser: a tested model (187 automated tests), the 3D township with an exploded view, the weekly game, 228 page checks and 75 checks in a real browser. It also runs as a local MCP server, so your own AI assistant can ask about your home, and every answer is checked first. Public data only; no SDP data.

**Limits:** the tariff, the carbon factor, the air-con and shade maths and the scoring formulas are our placeholders. The figures from public data (the 0.93 km stop distance, the 5.4 km rail distance, the corridor's trees) are real; everything else is a placeholder until an owner enters a bill.

A pilot is proposed on a later slide. Nothing is agreed with SDP yet.

## Value for SDP

A buyer who sees their running cost can decide with confidence. After handover the same model takes the owner's own bill: they type the kWh, and the electricity figure becomes real.

It replicates by swapping a township's stops, tariff and trees. **Links to SDP's PRIME rewards and to mall visits are hypotheses we have not tested.**

## After handover: your real bill

Once an owner lives in the home, they enter the kWh on their bill. The model shows how far its estimate was, matches itself to that month, and **the electricity figure is graded real. Everything else stays illustrative.**

**Proposed pilot:** eight weeks, one Elmina phase, new owners, measuring uptake and model error. **It cannot show savings:** a 2% nudge is far below the month-to-month swing in a few dozen bills. Cost, partners and consent wording are not agreed.

## What we have, what we do not

**Checked:** the 0.93 km distance, what SDP's app covers, the roughly 2% nudge ceiling, and the model's behaviour in tests.

**Not checked:** that buyers want this, that it changes any behaviour, the tariff and carbon figures, and whether managers would use it.

**Next:** talk to recent buyers and a township manager, then replace the placeholders with the real tariff and one metered home.

## Sources

data.gov.my GTFS static feeds (Prasarana, KTMB), Elmina centre from OpenStreetMap · Sime Darby Property app listing and EdgeProp launch article · SDP Sustainability Strategy 2025-2030 slide · Allcott (2011), *Social norms and energy conservation*, Journal of Public Economics 95 · J-PAL, Opower home energy reports evaluation
