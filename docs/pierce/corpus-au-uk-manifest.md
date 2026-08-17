# Regulator corpus — AER, Ofgem ED2, Ofgem RIIO-3, CAA H7

The founder's sourcing note, turned into re-fetchable URLs. The files
themselves are not committed (they are public and together run past
150MB); this manifest is how any session rebuilds the corpus in
minutes. Sweep results and hand-review verdicts land in the worklog
and the analytical-checks protocol as they happen.

## Ofgem ED2 Price Control Financial Model — 11 versions, with a changelog

The one the sourcing note said to grab first: Ofgem tracks versions by
filename suffix and publishes the full history next to a written
changelog — ground truth for the diff engine.

Page: https://www.ofgem.gov.uk/guidance/ed2-price-control-financial-model

| Version | Date | What changed (Ofgem's own words) |
|---|---|---|
| V5 | 12 Jun 2026 | New pass-through row for Connections Reform Costs |
| V4 | 28 Jan 2026 | Variable values after the 2025 Annual Iteration Process |
| V4 | 25 Jul 2025 | Inflation variable values |
| V4 | 30 Jan 2025 | Variable values after the 2024 Annual Iteration Process |
| V4 | 26 Jul 2024 | Inflation variable values |
| V3 | 26 Jan 2024 | Variable values after the 2023 Annual Iteration Process |
| V3 | 30 Nov 2023 | Ofgem variable values update |
| V3 | 16 Oct 2023 | Housekeeping |
| V2 | 31 Jul 2023 | Inflation variable values only |
| V2 | 14 Jul 2023 | Housekeeping |
| V1 | 3 Feb 2023 | Original statutory consultation decision |

Direct files (all under `https://www.ofgem.gov.uk/sites/default/files/`):

- `2026-06/ED2-PCFM-V5.xlsx`
- `2026-01/ED2%20PCFM%20V4%20%28published%2028%20January%202026%29.xlsx`
- `2025-07/ED2-PCFM-V4-published-25-July-2025.xlsx`
- `2025-01/ED2_PCFM_V4_30_January_2025.xlsx`
- `2024-07/ED2_PCFM_V4_updated_26_July_2024.xlsx`
- `2024-01/ED2%20PCFM%20V3%20%28published%2026%20January%202024%29.xlsm`
- `2024-01/ED2%20PCFM%20V3%20%28updated%2030%20November%202023%29.xlsx`
- `2023-10/ED2%20PCFM%20V3%20%28published%2016%20October%202023%291697123823926.xlsx`
- `2023-07/ED2%20Price%20Control%20Financial%20Model%20V2%2020230731%20for%20use%20in%20AIP.xlsx`
- `2023-07/ED2%20Price%20Control%20Financial%20Model%20V2%2020230714.xlsx`
- `2023-07/ED2%20PCFM%20V1%2020230203.xlsx`

## Ofgem RIIO-3 — draft (Jun 2025) → final (Dec 2025) pairs

Draft page: https://www.ofgem.gov.uk/consultation/riio-3-draft-determinations-electricity-transmission-gas-distribution-and-gas-transmission-sectors
Final page: https://www.ofgem.gov.uk/decision/riio-3-final-determinations-electricity-transmission-gas-distribution-and-gas-transmission-sectors

Drafts arrive as one zip —
`2025-06/RIIO-3%20Draft%20Determinations%20Business%20Plan%20Financial%20Models.zip`
— holding the ET3/GD3/GT3 BPFMs (13–15MB .xlsm each), draft PCFMs, the
WACC rates model and the return-on-equity summary.

Finals, each under `https://www.ofgem.gov.uk/sites/default/files/2026-02/`:

- `RIIO-3%20Final%20Determinations%20Electricity%20Transmission%20Business%20Plan%20Financial%20Model.xlsm`
- `RIIO-3%20Final%20Determinations%20Gas%20Distribution%20Business%20Plan%20Financial%20Model.xlsm`
- `RIIO-3%20Final%20Determinations%20Gas%20Transmission%20Business%20Plan%20Financial%20Model.xlsm`
- `RIIO-3%20Final%20Determinations%20WACC%20rates%20model.xlsx`

## CAA Heathrow H7 — final proposals → final determination pair

Page: https://www.caa.co.uk/commercial-industry/economic-regulation-and-competition-policy/heathrow-airport/current-price-control-h7-2022-2026/h7-initial-proposals-final-proposals-final-determination-and-price-control-appeals/

- PCM v2.11, final determination: `https://www.caa.co.uk/media/c2vfdpat/caa-h7-pcm-v2-11-7mar-fds.xlsm`
- PCM v2.10, final proposals: `https://www.caa.co.uk/media/ao2j3hsh/caa-h7-pcm-v2-10-mid-pax-profiled-fp-external2.xlsm`
- Cost of New Debt Indexation, FDS: `https://www.caa.co.uk/media/5yzcbsge/cost-of-new-debt-indexation-model_fds-apr-23.xlsx`
- Cost of New Debt Indexation, FP: `https://www.caa.co.uk/media/erydwwue/cost-of-new-debt-indexation-model_for-publication.xlsx`

## AER PTRM / RFM — not fetchable from this environment

aer.gov.au sits behind bot protection that resets non-browser TLS
connections; the pages 403 and the file store times out. The models
are real and public — roughly 20 businesses × proposal → revised →
draft → final, e.g. AusNet's `TRR 2023-27 Roll Forward Model` and
Aurora Energy's revised models with stated reasons for each change —
but they need a human browser. **Founder path:** download from
aer.gov.au and drop them into Check a model, or into a SharePoint
folder a deal watches.
