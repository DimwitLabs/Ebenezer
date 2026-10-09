# Ebenezer

A sceptical accountant for your money, run on your own server.

Ebenezer keeps every kind of thing you own in one ledger: shares, mutual funds, bonds, gold, fixed and recurring deposits, savings, loans, property, and anything else you define yourself. It prices what can be priced every evening from the exchanges and AMFI, works out your wealth XIRR across all of it, and tells you plainly whether you would have done better in the Nifty 50.

It is built for Indian investors and needs no broker account and no paid data.

## What It Does

- **One Ledger, Many Sections:** A portfolio holds sections. Shares, funds and bonds are typed: Ebenezer knows their fields and prices them by ISIN. Anything else, a flat, a car, a chit fund, is a custom section with your own fields, an icon, and a description Ebenezer reads.
- **Bring Your Data As It Is:** Paste any table from a spreadsheet or broker export and match its columns. Raw trade books run through a small script in your browser first; the default one is how Ebenezer has always read a trade book, and you can change it. It runs with no network access. Save the settings as a template for next time.
- **Start From A Statement:** Upload a CAS PDF from CAMS or KFintech (every mutual fund transaction) or from NSDL or CDSL (everything in your demat). Ebenezer reads it in your browser, compares it with what it already has on the statement date, and offers to add what is missing or adjust what differs. You tick what goes in. The file and its password never leave the tab.
- **Prices Without A Data Bill:** The BSE and NSE closing files, AMFI's daily NAVs, NSE's index closes and the day's gold and silver rates, fetched once each evening. No per-ticker calls, no API keys. Index history older than NSE's files, needed only when your money goes back that far, comes from Yahoo Finance, which is not an official source. Gold coins, bars and jewellery are valued by karat; gold ETFs and SGBs can be counted under gold instead of shares.
- **Returns That Mean Something:** Wealth XIRR counts every dated rupee in, not just shares. Stocks get their own XIRR. Both are set against the same money put into your chosen index on the same days, and against inflation. XIRR waits until money has been in for 90 days, because annual rates over a few weeks are noise.
- **The Three Ghosts:** Today's screen looks at your money as it was, as it is, and as it may be.
- **Ask Ebenezer:** Ask "Is HODL working for me?" or "Where am I losing to the index?" and get an answer from your own ledger, including what you would have if you had never sold. You can see exactly what Ebenezer is told.
- **A Daily Report:** A morning email with net worth, the change since yesterday, Ebenezer's note, each section, the day's movers and the news worth reading, through your own SMTP server. Pick the days, the time and what it holds.
- **Your Kind Of Accountant:** Choose Ebenezer's personality and tone, or describe your own, and give him standing instructions.
- **News, Judged:** For every company you hold, news is searched by its full official name, never a bare ticker, alongside its BSE filings. An AI of your choosing through OpenRouter marks each story signal or humbug, with a one-line reason. When and how often is up to each portfolio, and Fetch now always works.
- **Settings For Everything:** Every schedule shows when it last ran and has a Run now button. Each portfolio keeps its own benchmark, inflation, news times and judge criteria.
- **It Watches Its Own Sources:** The feeds Ebenezer uses are public files that can change without notice. A daily check tries each one, asserts the shape it expects, and sends you an ntfy alert after two failures in a row.

## Run It

You need Docker.

```bash
cp .env.example .env
```

Set `POSTGRES_PASSWORD` and `EBENEZER_ENCRYPTION_KEY` in `.env`, then:

```bash
docker compose up -d
```

Open http://localhost:8080 and create the first account; it owns the instance. Put it behind HTTPS before you use it for real, or set `EBENEZER_SECURE_COOKIES=false` to try it over plain HTTP on your own machine.

To use your own Postgres, Supabase included, set `EBENEZER_DATABASE_URL` and use the other compose file:

```bash
docker compose -f docker-compose.external-db.yml up -d
```

Ebenezer keeps its tables in their own schema, `ebenezer` by default, so it can share a database.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `EBENEZER_DATABASE_URL` | | Postgres connection string. Poolers work. |
| `EBENEZER_ENCRYPTION_KEY` | | Required, at least 32 characters. Seals the keys and passwords saved in Settings. Make one with `openssl rand -base64 32` and keep a copy; lose it and those secrets must be entered again. |
| `EBENEZER_DB_SCHEMA` | `ebenezer` | Schema for Ebenezer's tables. |
| `EBENEZER_SECURE_COOKIES` | `true` | `false` only for plain HTTP on your own machine. |
| `EBENEZER_SESSION_HOURS` | `336` | How long a sign-in lasts. |
| `EBENEZER_SCHEDULER` | `true` | Run prices, news and health on schedule. Turn off on all but one copy. |
| `TZ` | `Asia/Kolkata` | The clock every schedule time is written in. Settings show it next to each time. |
| `EBENEZER_OPENROUTER_KEY` | | Keeps the key out of the database. Otherwise the owner sets it in Settings. |
| `EBENEZER_NTFY_URL` | | Where source alerts go. Also settable in Settings. |
| `EBENEZER_PUBLIC_URL` | | Where people reach this Ebenezer, such as `https://ebenezer.example.com`, for links in emails. |
| `EBENEZER_NTFY_TOKEN` | | Access token for a protected ntfy topic. |
| `EBENEZER_NTFY_PASSWORD` | | Password for the ntfy username set in Settings, if you use one instead of a token. |
| `EBENEZER_SMTP_PASSWORD` | | Password for the SMTP server that sends reports. |
| `EBENEZER_ADDR` | `:8080` | Listen address. |

Everything else, price time, model, news and report schedules, SMTP server, lives in Settings. Secrets typed into Settings are sealed with `EBENEZER_ENCRYPTION_KEY` and never shown again; set them in the environment to keep them out of the database.

## Develop

```bash
docker run -d --name ebenezer-dev-db -e POSTGRES_USER=ebenezer -e POSTGRES_PASSWORD=ebenezer -e POSTGRES_DB=ebenezer -p 127.0.0.1:54329:5432 postgres:18-alpine
```

```bash
EBENEZER_DATABASE_URL='postgres://ebenezer:ebenezer@127.0.0.1:54329/ebenezer?sslmode=disable' EBENEZER_SECURE_COOKIES=false go run ./cmd/ebenezer
```

```bash
cd web && npm install && npm run dev
```

The web app runs on http://localhost:5173 and sends `/api` to the Go server. `go test ./...` and `npm test` run the tests; `EBENEZER_LIVE=1 go test ./internal/market ./internal/news` also checks the real feeds still answer.

## Licence

MIT. See [LICENSE](LICENSE).
