# Changelog

All notable changes to Ebenezer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-13

### Added

- **Portfolios:** Shares, mutual funds, bonds, gold, deposits, savings, loans and property each get a typed section, and anything else a custom one. Paste any table and match its columns once, or upload CAMS, KFintech, NSDL and CDSL statements to fill in transactions and check holdings.
- **Prices And Returns:** BSE, NSE, AMFI, index closes and gold and silver rates are fetched every evening. Positions are worked out first in first out, and every section gets its XIRR against your chosen index and inflation, with Past, Present and Future views of your net worth.
- **Ebenezer Himself:** A short note beside your figures, checked against the ledger before it shows, and answers to your questions from your own data. Pick a personality and tone per portfolio or describe your own, and news about what you hold comes sorted into signal and humbug.
- **Expenses And Cards:** Log spends by chatting, as in `swiggy 450 on regalia`, and see the month against a usual one. Credit cards track what you owe, what is billed and what is left, cycle by cycle.
- **Reports And Alerts:** A daily email on your schedule through your own SMTP server, and an ntfy alert when a price source breaks. Runs missed while the server was down catch up when it is back.
- **Self-Hosted:** One Docker image with a bundled Postgres, or your own, Supabase included. Keys and passwords are encrypted before they reach the database, and everything exports as CSVs that import straight back.
