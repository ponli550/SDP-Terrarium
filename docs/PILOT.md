# Pilot proposal: eight weeks, one township

**Status: a proposal. Nothing is agreed with SDP. Cost, partners and consent wording are open.**

## The question
Does a buyer or new owner use the Terrarium, and how far is its simulated month from a real one? It does **not** try to prove savings. A nudge of about 2% (Allcott 2011) is far below the month-to-month swing in a household bill, and a few dozen homes cannot detect it. Claiming savings from this pilot would be wrong.

## Who, and how they are reached
New owners in one Elmina phase. SDP's own app already reaches owners (billing, documents, defect reports), so it is the natural channel. Whether SDP would use it for this is unasked.

## What a participant does
1. **Week 0.** Sign in, set the home's condition, place the lot, and enter the kWh from last month's bill. The model shows how far its own estimate was from that bill, then matches its base load to it. This is built.
2. **Weeks 1 to 8.** Play the four-week month, choose habits, read the answers. Report short trips on foot each week.
3. **Week 8.** Enter the latest bill and answer three questions, including whether the tool changed a decision.

Bill data route: the owner types their own monthly kWh. TNB's pages say smart-meter customers can see half-hourly use and bills in myTNB, and an older report says customers without one see monthly figures. An automatic link would need TNB's cooperation, which nobody has asked for.

## What it measures
- **Uptake:** how many invited homes open it, and how many reach week 4 and week 8.
- **Model error:** the gap between the simulated month and the real bill, per home. This says which placeholder to replace first (tariff, base load, air-con).
- **Stated change:** the share who say it changed a decision.

## Proposed thresholds (to be agreed, not findings)
Continue only if at least half of those who start reach week 4, and at least a third say it changed a decision. Stop if fewer than about ten homes can be recruited.

## Data
A bill figure is personal data. Under Malaysia's PDPA, collecting it counts as processing, so notice and consent apply. Keep only monthly kWh and home type, with no names or addresses. The prototype today stores nothing on a server: the demo sign-in keeps a home in the browser's own storage, with no password, so it is not secure and a real pilot would need real authentication. This is not legal advice: check the official text, including the 2024 amendment, which this proposal has only seen in secondary sources.

## Cost lines (none estimated)
Build and upkeep time, hosting (none today), survey, any participant incentive, SDP staff time, and TNB permissions if the pilot goes beyond owners typing their bill.

## Main risks
Low uptake. Wrongly typed numbers. Placeholders presented as facts before they are replaced. The briefing's IP clause on code written for a submission.

## Sources
- TNB, [customer empowerment (smart meter data)](https://www.tnb.com.my/smart-grid/customer-empowerment/) and [AMI customer insights](https://www.tnb.com.my/sustainability/esg-stories-tnb-ami-customer-energy-insights)
- Bernama reports on [smart meter use](https://www.bernama.com/en/news.php?id=1944047) and [the 2025 rollout](https://www.bernama.com/en/news.php?id=2455042)
- Future of Privacy Forum, [consent in Malaysia's data protection law](https://fpf.org/blog/new-report-on-limits-of-consent-in-malaysias-data-protection-law/)
- Allcott (2011), Social norms and energy conservation, Journal of Public Economics 95
