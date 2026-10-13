---
id: data-sources
title: Data Sources
---

# Data Sources

Every outside source I read, what I read it for, and when. None of them needs a key from you except OpenRouter.

## The Sources

These are public files, and their owners change them without a word to anyone. I check the ones that matter every day and tell you when one stops answering; see [Alerts and Health](/docs/self-hosting/alerts-and-health).

| Source | Used for | When | Official |
| --- | --- | --- | --- |
| NSE bhavcopy | Closing prices of shares and bonds, by ISIN, and their tickers | Each price run; the last month of days after an import or when history is missing | Yes, NSE |
| BSE bhavcopy | Closing prices of scrips, filling in those NSE does not list, and BSE codes for filings | Each price run; the last month of days after an import or when history is missing | Yes, BSE |
| AMFI NAVs | Mutual fund NAVs, by ISIN, and each fund's category | Each price run | Yes, AMFI |
| AMFI NAV history | Mutual fund NAVs for the last month | After an import, or when history is missing | Yes, AMFI |
| NSE index closes | The benchmark comparison, for every index I offer | Each price run, and back to your first investment when history is missing | Yes, NSE |
| NSE Nifty Total Market list | Each company's industry | Each price run | Yes, NSE |
| Yahoo Finance | Nifty 50 closes from before NSE's own files begin | Only when your money goes back that far | No |
| Bullions India | Gold and silver rates per gram | Each price run, and once at first start | No |
| MMTC-PAMP | Gold rate per gram, when Bullions India fails | Only then; it quotes no silver | No |
| CoinGecko | Coin prices in rupees, matching tickers to coins, and the last month of history | Each price run, and Saturdays and Sundays at the price time | No |
| Google News | Stories about each company you hold, searched by its full name | At each portfolio's news times | No |
| BSE announcements | Each company's filings, and the filing PDFs when you open one | At each portfolio's news times | Yes, BSE |
| OpenRouter | The AI model for my notes, news judging, Ask, the report, reading the spends you tell me, tidying imports and categories, and looking up card terms; also the list of models to pick from | Whenever one of those runs, with your own key | Not a data source; a service you pay for |

The price run is at 18:45 on weekdays unless you change it, and the health check at 09:00 every day. News times are set per portfolio. See [Schedules](/docs/self-hosting/schedules) and [News](/docs/using/news).
