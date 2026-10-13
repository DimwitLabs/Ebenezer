# Ebenezer

[![AI-DECLARATION: copilot](https://img.shields.io/badge/䷼%20AI--DECLARATION-copilot-fee2e2?labelColor=fee2e2)](https://ai-declaration.md)
[![Coverage](https://img.shields.io/badge/coverage-50%25-dcfce7?labelColor=dcfce7)](https://github.com/DimwitLabs/Ebenezer/actions/workflows/ci.yml)

A ledger for everything you own, kept on your own server.

Shares, funds, bonds, gold, deposits, savings, loans, property, and whatever else you insist on owning: I keep the lot. Each evening I price what can be priced, work out what all of it has really earned, and tell you whether you would have done better leaving it in the Nifty 50. Usually you would have.

I want no broker account and no paid data from you. The exchanges and AMFI publish their prices every evening for anyone who asks, so I ask, and you pay nothing for them. I was built for Indian investors, and I count in lakh and crore like one.

## What I Do

- **One Ledger, Many Sections:** A portfolio is made of sections. Shares, funds and bonds I already understand: I know their fields and price them by ISIN. Anything else, a flat, a car, the chit fund you were talked into, becomes a section of your own, with its own fields, an icon, and a description I will read before I say anything about it.
- **Bring Your Data As It Is:** Paste any table from a spreadsheet or a broker's export and tell me which column is which. When rows do not fit, the AI model writes a small script to tidy them, having seen only the column names and three sample rows, and you tell it in plain words what to change. The script runs in your browser with no network access, so it cannot send your rows anywhere. Save the whole arrangement as a template and you need not explain yourself twice.
- **Start From A Statement:** Hand me a CAS PDF from CAMS or KFintech, which lists every mutual fund transaction you have made, or one from NSDL or CDSL, which lists everything in your demat. I read it in your browser, compare it with what I already hold for that date, and offer to add what is missing and correct what differs. You tick what goes in. The file and its password never leave the tab.
- **Prices Without A Data Bill:** The BSE and NSE closing files, AMFI's daily NAVs, NSE's index closes and the day's gold and silver rates, fetched once each evening. I make no call per ticker and need no API key. Index history from before NSE's own files, which I need only when your money goes back that far, comes from Yahoo Finance, which is not an official source, and I will not pretend otherwise. Gold coins, bars and jewellery are valued by karat, and gold ETFs and SGBs may be counted as gold rather than shares.
- **Returns That Mean Something:** Your wealth XIRR counts every dated rupee you put in, not only the shares. Stocks get an XIRR of their own. Both are set against the same money put into your chosen index on the same days, and against inflation. I wait until money has been in for 90 days before quoting a rate, because an annual figure over a few weeks is humbug.
- **Past, Present, Future:** Three ghosts once kept me up all night showing me my past, my present and my likely future. Unpleasant, but useful. Today shows you your money the same three ways. You may keep your sleep.
- **Ask Me:** Ask "Is holding on working for me?" or "Where am I losing to the index?" and I answer from your own ledger, including what you would have had if you had never sold. You may read exactly what I am shown before I answer, every word of it.
- **A Morning Report:** An email with your net worth, the change since yesterday, my note, each section, the day's movers and the news worth reading, sent through your own mail server. You choose the days, the time and what goes in it.
- **An Accountant To Your Taste:** Choose my personality and my tone, or describe the one you want, and give me standing instructions. I will follow them, though I may grumble.
- **News, Judged:** For every company you hold, I search the news by its full official name, never a bare ticker, alongside its BSE filings. Every story crosses my desk, and an AI model of your choosing through OpenRouter helps me mark it signal or humbug, with one line on why. A broker's opinion: humbug. A price that moved: humbug. A headline written to be clicked: humbug, humbug. What is left, read.
- **Every Schedule In Plain Sight:** Each job shows when it last ran and has a Run now button. Each portfolio keeps its own benchmark, inflation rate, news times and judging rules.
- **I Watch My Own Sources:** The files I read are public and change without notice. Every day I try each one and check it still looks as it should. After two failures in a row I send you an ntfy alert. I do not write a letter for every cough.

## Running Me

All you need is Docker.

```bash
cp .env.example .env
```

Set `POSTGRES_PASSWORD` and `EBENEZER_ENCRYPTION_KEY` in it, then start me:

```bash
docker compose up -d
```

You will find me at `http://localhost:8080`. Whoever makes the first account there owns the place. Put me behind HTTPS before you trust me with anything real, or set `EBENEZER_SECURE_COOKIES=false` to try me over plain HTTP on your own machine.

If you would rather use your own Postgres, Supabase included, set `EBENEZER_DATABASE_URL` and use the other compose file:

```bash
docker compose -f docker-compose.external-db.yml up -d
```

I keep my tables in a schema of my own, `ebenezer` unless you say otherwise, so I can share a database without making a mess of it.

## Configuration

Set these in `.env`. Everything else is in Settings, where it belongs.

| Variable | Default | What it does |
|---|---|---|
| `EBENEZER_DATABASE_URL` | | Postgres connection string. Poolers work. |
| `EBENEZER_ENCRYPTION_KEY` | | Required, at least 32 characters. Seals the keys and passwords saved in Settings. Make one with `openssl rand -base64 32` and keep a copy; lose it and those secrets must be entered again. |
| `EBENEZER_DB_SCHEMA` | `ebenezer` | Schema for Ebenezer's tables. |
| `EBENEZER_SECURE_COOKIES` | `true` | `false` only for plain HTTP on your own machine. |
| `EBENEZER_SESSION_HOURS` | `336` | How long a sign-in lasts. |
| `EBENEZER_SCHEDULER` | `true` | Run prices, news and health on schedule. Turn off on all but one copy. |
| `TZ` | `Asia/Kolkata` | The clock every schedule time is written in. Settings show it next to each time. |
| `EBENEZER_PUBLIC_URL` | | Where people reach this Ebenezer, such as `https://ebenezer.example.com`, for links in emails. |
| `EBENEZER_ADDR` | `:8080` | Listen address. |

Price times, the AI model, news and report schedules, the mail server, and every key and password are set in Settings. The OpenRouter key, the ntfy token or password and the mail password are locked with `EBENEZER_ENCRYPTION_KEY` before they reach the database, and I never show them again, not even to you.

> [!WARNING]
> Lose `EBENEZER_ENCRYPTION_KEY` and I cannot open those secrets. Nobody can. You will be typing the lot in again, so keep a copy.

## Working On Me

Start a database to test against:

```bash
docker run -d --name ebenezer-dev-db -e POSTGRES_USER=ebenezer -e POSTGRES_PASSWORD=ebenezer -e POSTGRES_DB=ebenezer -p 127.0.0.1:54329:5432 postgres:18-alpine
```

Run the server against it:

```bash
EBENEZER_DATABASE_URL='postgres://ebenezer:ebenezer@127.0.0.1:54329/ebenezer?sslmode=disable' EBENEZER_ENCRYPTION_KEY="$(openssl rand -base64 32)" EBENEZER_SECURE_COOKIES=false go run ./cmd/ebenezer
```

Run the web app beside it:

```bash
cd web && npm install && npm run dev
```

The web app runs on `http://localhost:5173` and sends `/api` to the Go server. `go test ./...` and `npm test` run the tests, and `EBENEZER_LIVE=1 go test ./internal/market ./internal/news` checks that the real feeds still answer.

A fresh key on every run means the secrets you saved last time will not open. Fix one in your shell if you mean to keep them.

## Licence

MIT. See [LICENSE](LICENSE).
