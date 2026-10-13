---
id: prices-and-returns
title: Prices And Returns
---

# Prices And Returns

Each weekday evening I fetch the day's closing prices and value what you hold. Then I work out what your money has really earned, as a yearly rate, and set it beside what the same money would have done in an index and what inflation has taken from it. A gain with no date attached tells you very little, so I count the dates too.

## When I Fetch Prices

I fetch exchange and fund prices, coin prices and index history on weekdays at 18:45, and coin prices alone at the same time on Saturdays and Sundays. After each run I take a net worth snapshot and write my notes again. The owner can change the time under **Prices and data** on the Admin screen; see [Schedules](/docs/self-hosting/schedules).

Weekends and exchange holidays need no calendar: I take the latest trading day's closes. If one source fails, the others still count, and the run says which one failed. After every import I also fetch the history a new holding needs, so a scrip you imported today already has a chart.

## How Holdings Are Priced

| Holding | Priced by | From |
| --- | --- | --- |
| Shares and bonds, SGBs included | ISIN | The NSE and BSE closing files |
| Mutual funds | ISIN | AMFI's daily NAVs |
| Coins | Ticker, in rupees | CoinGecko |
| Gold and silver | Grams, by metal and karat | The day's bullion rate |

A row with a symbol and no ISIN is matched to the exchange's list by its ticker. A coin's ticker is matched to the largest coin on CoinGecko that uses it, since small coins borrow the tickers of large ones. Holdings are worked out from your rows, first in first out, the way Indian tax counts them.

:::warning[No Price Means Cost]
A holding I cannot price is counted at what it cost you and marked **no price**. The usual cause is a missing or wrong ISIN; check the row in [Data](/docs/using/importing).
:::

## Gold And Silver

Bullion rows are valued at their grams times the day's rate for their metal. 22 and 18 karat gold are worked out from the 24 karat rate, and gold with no karat marked counts as 24. I take both rates from Bullions India, and the gold rate from MMTC-PAMP if that fails.

If your jeweller quotes differently, the owner can turn on **Use my own gold and silver rates** under **Prices and data** and enter a 24 karat gold rate per gram, and a silver rate if wanted.

A gold ETF, a gold fund or an SGB is a share, a fund or a bond on paper, but it is gold in your pocket. I mark such holdings **looks like gold**, and you can count them under Bullion instead; see [Moving Holdings Between Sections](/docs/using/portfolios-and-sections#moving-holdings-between-sections). They keep their exchange price either way.

## Wealth And Stocks XIRR

XIRR is the yearly rate that every dated rupee you put in and took out implies, given what it is all worth today. My wealth XIRR counts every section that counts toward your net worth, not only the shares: trades, deposits and their instalments, gold, property with a date and a cost, anything with a date and an amount. What you owe is left out, as is any section you have told me not to count.

Stocks get an XIRR of their own, from the Stocks section's trades alone. A holding moved under Bullion takes its trades with it. Every other section with dated money, loans aside, gets its own XIRR too, and so does each holding. Savings balances earn only the interest you entered for them, which I do not count as a gain.

## Against The Index

Beside each XIRR I put the same money into your chosen index on the same days. Every rupee you put in buys index units at that day's close, every rupee you take out sells them, and what is left is valued at the latest close. The XIRR of that is the benchmark figure, shown as **Same money in** the index. The index is the Nifty 50 unless you choose another in [Portfolio Settings](/docs/using/portfolios-and-sections#portfolio-settings).

Index closes come from NSE's own daily files. Where your money goes back further than those, I fill the Nifty 50's older closes from Yahoo Finance, which is not an official source. For the other indices, a comparison can go back only as far as NSE's files do. If your money goes back before the first close I hold, I give no benchmark figure at all rather than a wrong one.

## Inflation And The Wait

Beside each XIRR I show what is left after inflation, as a yearly rate in today's rupees, at the rate in the portfolio's Settings: 5.5% unless you change it.

An annual rate over a few weeks swings wildly. A fortnight's luck becomes a 60% a year return, which is humbug. So I wait until money has been in for 90 days, counted from the first dated rupee, before quoting any rate, whether for wealth, stocks, a section or a holding. Change the wait in the portfolio's Settings.

## Had You Never Sold

For the Stocks section, once anything has been sold, I also work out what would have happened had you never sold anything: every buy still held, valued at today's prices, with its own XIRR. Scrips I cannot price are left out of it.

It is not shown on a tile. It sits in the ledger I read before I answer in [Ask](/docs/using/ask) and before I write my notes, so a question like "Is holding on working for me?" gets an answer from your own numbers.
