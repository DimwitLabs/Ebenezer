# Changelog

All notable changes to Ebenezer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Portfolios And Sections:** Sign in, create a portfolio, and pick what you hold. Shares, mutual funds, bonds, gold, fixed and recurring deposits, savings, loans and property each become a typed section; anything else is a custom section with its own fields, icon, valuation rule and a description Ebenezer reads.
- **Paste, Match And Tidy:** Paste any table, match its columns to a section's fields, and save the match as a template. Rows that fail checks can be tidied by a script the portfolio's AI model writes from the column names and three sample rows, changed by asking in plain words, and run in a worker the server forbids from touching the network. Without a model, rows are fixed by hand.
- **Statement PDFs:** One upload for the whole portfolio. CAMS and KFintech statements add missing mutual fund transactions; NSDL and CDSL statements check every demat holding against Ebenezer on the statement date and offer opening positions or adjustments. Read in the browser, previewed before saving.
- **Evening Prices:** BSE and NSE closing files, AMFI NAVs, NSE index closes and gold and silver rates (Bullions India, with MMTC-PAMP as a fallback, as Dynamo's Midas did), with holdings matched by ISIN and named by their official exchange names.
- **Bullion Where It Belongs:** Gold ETFs, gold funds and SGBs are spotted by name and can be counted under Bullion, taking their value, cost and returns with them. Gold rows carry their karat, and silver is priced as silver.
- **Ebenezer's Note:** A one-line verdict and a few points beside the figures on Today, the Portfolio screen and Expenses, written again only when something it reads has changed. A line with a figure that is not in the ledger is thrown out, and without a model the note comes from a phrasebook in the chosen tone. The eye button shows what Ebenezer was given to write it.
- **Ask Ebenezer:** Questions answered from the portfolio's own ledger, with a never-sold comparison for questions about holding on, and the ledger itself on show. After each answer, Ask offers two or three questions to ask next, all ones the ledger can answer and none asking whether to buy or sell.
- **Expenses:** Say what you spent in the chat, as in `swiggy 450 on regalia`, and Ebenezer files the item, amount, day, category and how it was paid, asks when that is unclear, and lets every save be undone. The month so far against a usual month, a ledger with search and filters, Tidy to join and rename categories, Trends sorting categories by how often and how much, and CSV import from the app you used before. Spends from a savings account come off its balance.
- **Credit Cards:** What you owe, what is billed and unpaid, this cycle's spends and the limit left, kept from each card's statement day and due days. Statements roll over as a bank's would, bills are marked paid by hand, and Look them up finds a card's published terms on the bank's own site.
- **Motion:** Ebenezer's replies type themselves out in every chat; on Today the net worth counts up, the allocation bar grows and the ghosts fade between each other; cards fade in as they scroll into view. All of it stays still when the system asks for reduced motion.
- **Daily Report:** An HTML email on the days and time you choose, through your own SMTP server, with a preview and Send now.
- **Voice:** Ebenezer's personality, tone, AI model and standing instructions are set per portfolio, and reach every note, the report, news reasons and answers in Ask and the spend chat. A sample line shows how each tone sounds, and a personality can be described in your own words.
- **Holdings And Returns:** Positions are worked out from the rows, first in first out, so a row added by hand is counted at once. Wealth XIRR runs across every section with dated money, against your chosen index and inflation, once money has been in for 90 days, and every section gets its own XIRR against the benchmark, on the Portfolio screen and in the report.
- **The Three Ghosts:** Past, Present and Future views of net worth on the Today screen.
- **Judged News:** Google News by full company name and BSE filings, merged, with routine filings set aside and the rest judged signal or humbug through OpenRouter.
- **Export:** Every row in every portfolio you can see, as CSV files in one zip from the Admin screen, with expenses and cards alongside. Each file comes back in through Import with nothing to match. Keys and passwords never leave.
- **Settings:** Per-portfolio benchmark, inflation, XIRR wait, news schedule and judge criteria; instance price time, gold and silver overrides, a model picked from OpenRouter's list with a test before saving, ntfy with token or username and password, and SMTP; people and portfolio sharing, where a portfolio belongs to whoever made it and only they can delete it; every scheduled job with its last run and a Run now button.
- **Source Health And Missed Runs:** A daily check of every outside source, with an ntfy alert after two failures in a row, a reminder each day it stays broken, and word when it is back, and a page at `/health` for the owner. The ntfy address is set under Admin only. A schedule whose time passed while the server was down runs once when it is back, and shows as caught up wherever its last run is shown.
- **Sealed Secrets:** The OpenRouter key, ntfy token and password, and SMTP password saved in Settings are encrypted with `EBENEZER_ENCRYPTION_KEY` before they reach the database.
- **Run It Where You Like:** A Docker image with a bundled Postgres that has no network of its own, or your own Postgres, Supabase included. `schema.sql` runs on every start, so new tables and columns reach existing databases without migrations.
