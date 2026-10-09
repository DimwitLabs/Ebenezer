# Changelog

All notable changes to Ebenezer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Portfolios And Sections:** Sign in, create a portfolio, and pick what you hold. Shares, mutual funds, bonds, gold, fixed and recurring deposits, savings, loans and property each become a typed section; anything else is a custom section with its own fields, icon, valuation rule and a description Ebenezer reads.
- **Paste And Match:** Paste any table, match its columns to a section's fields, and save the match as a template.
- **Processing In The Browser:** Raw trade books run through an editable script before saving, in a worker the server forbids from touching the network. The default script folds charges into the price and merges each scrip's trades on one day, as Ebenezer always has.
- **Statement PDFs:** One upload for the whole portfolio. CAMS and KFintech statements add missing mutual fund transactions; NSDL and CDSL statements check every demat holding against Ebenezer on the statement date and offer opening positions or adjustments. Read in the browser, previewed before saving.
- **Evening Prices:** BSE and NSE closing files, AMFI NAVs, NSE index closes and gold and silver rates (Bullions India, with MMTC-PAMP as a fallback, as Dynamo's Midas did), with holdings matched by ISIN and named by their official exchange names.
- **Bullion Where It Belongs:** Gold ETFs, gold funds and SGBs are spotted by name and can be counted under Bullion, taking their value, cost and returns with them. Gold rows carry their karat, and silver is priced as silver.
- **Ask Ebenezer:** Questions answered from the portfolio's own ledger, with a never-sold comparison for questions about holding on, and the ledger itself on show.
- **Daily Report:** An HTML email on the days and time you choose, through your own SMTP server, with a preview and Send now.
- **Personality And Tone:** Ebenezer's persona, tone and standing instructions are per portfolio, and reach the note, the report, news reasons and answers.
- **Holdings From Trades:** Positions are worked out from the rows, first in first out, so a row added by hand is counted at once.
- **Wealth XIRR:** Across every section with dated money, against your chosen index and inflation, shown once money has been in for 90 days. Stocks get their own.
- **The Three Ghosts:** Past, Present and Future views of net worth on the Today screen.
- **Judged News:** Google News by full company name and BSE filings, merged, with routine filings set aside and the rest judged signal or humbug through OpenRouter.
- **Returns By Section:** Every section gets its own XIRR against the benchmark, shown on the Portfolio screen and in the report.
- **Settings:** Per-portfolio benchmark, inflation, XIRR wait, news schedule and judge criteria; instance price time, gold and silver overrides, a model picked from OpenRouter's list with a test before saving, ntfy with token or username and password, and SMTP; people and portfolio sharing; every scheduled job with its last run and a Run now button.
- **Source Health:** A daily check of every outside source, with an ntfy alert after two failures in a row, and a page at `/health` for the owner.
- **Sealed Secrets:** The OpenRouter key, ntfy token and password, and SMTP password saved in Settings are encrypted with `EBENEZER_ENCRYPTION_KEY` before they reach the database.
- **Run It Where You Like:** A Docker image with a bundled Postgres that has no network of its own, or your own Postgres, Supabase included.
