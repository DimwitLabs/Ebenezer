---
id: alerts-and-health
title: Alerts And Health
---

# Alerts And Health

The files I read are public, and their owners change them without asking me. Every day I try each one and check it still looks as it should. After two failures in a row I send you an ntfy alert, and another each day it stays broken. When it mends, I say so. I do not write a letter for every cough.

## Setting Up ntfy

Alerts go through [ntfy](https://ntfy.sh), to whichever topic you choose. The address is set in the app and nowhere else: there is no setting for it in `.env`. Only the owner can set this up, under **Admin**, then **Alerts**.

1. Put the topic's address in **ntfy topic address**, such as `https://ntfy.sh/your-secret-topic`.
2. Choose a **Sign-in**: **None** for a public topic with a hard-to-guess name, or an **Access token** (it starts `tk_`) or **Username and password** for a protected one.
3. Press **Save**, then **Send a test**.

The token and the password are locked with `EBENEZER_ENCRYPTION_KEY` before they reach the database, and I never show them again.

## The Daily Check

The **Health check** runs every day at 09:00 unless the owner changes **Check sources at** under **Admin**, in **Prices and data**. A check passes only if the source answers and what comes back has the shape I expect. A page that loads but holds nothing useful still fails.

| Check | Passes when |
| --- | --- |
| NSE bhavcopy | The last trading day's file has more than 1,000 quotes |
| BSE bhavcopy | The same day's file has more than 1,000 quotes |
| NSE indices | The same day's closes include the Nifty 50 |
| AMFI NAVs | More than 5,000 NAVs come back |
| CoinGecko | Bitcoin has a price in rupees |
| Bullion rates | Gold has a price per gram |
| Google News | A search for ITC finds at least one story |
| BSE announcements | ITC has at least one filing in the last 30 days |
| OpenRouter key | OpenRouter still accepts your key. Only checked once a key is saved. |

BSE and the indices are checked only when NSE answers, as I need NSE to tell me which day was the last trading day.

## When I Alert

One failure is usually a blip: an exchange slow to publish, a site down for a minute. Two in a row is worth your attention, so the second sends **Ebenezer: a source is failing**, with each broken source, how many days it has been failing, and what went wrong. While it stays broken, I remind you once a day, however often the check runs.

When a source I alerted you about answers again, I send **Ebenezer: a source is back**, and the next breakage starts the count afresh. A single failure that mends by the next check sends nothing at all.

Without an ntfy address, I still check and still keep the results. I simply have nobody to tell.

## The Health Page

The results live at `/health`, which is in no menu; the owner types the address, and members are refused. It lists every check with what came back, whether it is working, and when it was last checked, and **Check now** runs the checks at once. See [Schedules](/docs/self-hosting/schedules).

:::tip
`/health` is about my sources. For an uptime monitor, `/api/health` answers 200 when I can reach my database and 503 when I cannot. The Docker image's own health check uses it.
:::
