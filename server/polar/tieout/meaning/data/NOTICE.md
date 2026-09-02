# Data notice

`concepts.json.gz` is distilled from two published taxonomies:

- **US GAAP Financial Reporting Taxonomy 2026**, (c) 2010-2026
  Financial Accounting Foundation; (c) 2007-2010 XBRL US, Inc. All
  Rights Reserved. Notice: Authorized Uses are Set Forth at
  https://xbrl.fasb.org/terms/TaxonomiesTermsConditions.html — which
  permits the taxonomy to be incorporated, in whole or in part, in
  works that assist in its use or implementation, provided this
  notice is included.
- **FRC Taxonomies, core 2025-01-01**, published by the Financial
  Reporting Council (https://xbrl.frc.org.uk/). The FRC's licence
  page could not be fetched from the build container; read it before
  shipping this file in a product.

Each row is `[source, concept, balance, period type, standard label,
total label, terse or verbose label]`. Only money concepts are kept.

`filer_labels.json.gz` is distilled from the SEC Financial Statement
Data Sets, 2026 Q2 (`pre.txt`), public data of the U.S. Securities
and Exchange Commission: each normalised filer label maps to the
concepts it was tagged as, with the number of statement lines and
how many of them were printed with the sign flipped. Pairs seen on
fewer than three lines are dropped.

Fetched and counted 2 September 2026; the record is
`docs/pierce/materials-intake.md`.

`uk_filer_labels.json.gz` is distilled from three days of the
Companies House **Accounts Data Product** (the daily bulk zips of
2026-08-29, 2026-09-01 and 2026-09-02; 61,486 accounts, 1.7 million
tagged numbers): « The Accounts Data Product is a free downloadable
ZIP file, which contains the individual data files (instance
documents) of company accounts filed electronically. » « Each data
file is provided free of charge and is not supported. » Each
normalised printed row label maps to the FRC concepts it was tagged
as, with line counts and sign flips; pairs seen on fewer than three
lines are dropped. Built 2 September 2026 by
`scripts/uk_filer_labels.py`; the record is
`docs/pierce/uk-filer-labels.md`.
