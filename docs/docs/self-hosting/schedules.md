---
id: schedules
title: Schedules
---

# Schedules

Everything I do on my own runs on a schedule, and every schedule is in plain sight. Each one is a short chain of jobs run in order, named for what it does rather than when, since you may change every time.

## The Schedules

| Schedule | Steps, in order | When | Default |
| --- | --- | --- | --- |
| **Prices** | Exchange and fund prices, Benchmark history, Net worth snapshot, Ebenezer's notes | Weekdays | 18:45 |
| **Crypto** | Coin prices, Net worth snapshot, Ebenezer's notes | Saturdays and Sundays | 18:45 |
| **News** | Fetch and judge news, Ebenezer's notes | Daily, per portfolio | 07:00 and 18:30 |
| **Email report** | Email report | Chosen days, per portfolio | Off. When on, every day at 08:00. |
| **Health check** | Health check | Daily | 09:00 |

Prices, Crypto and Health check run once for the whole instance, and their portfolio steps run for every portfolio. News and Email report run separately for each portfolio, at that portfolio's own times. Crypto shares the price time: coins trade at weekends, when the exchanges have nothing new.

## Where The Times Are Set

| Schedule | Set in |
| --- | --- |
| Prices and Crypto | **Admin**, **Prices and data**, **Fetch prices at** |
| Health check | **Admin**, **Prices and data**, **Check sources at** |
| News | The portfolio's **Settings**, **News**, or switch it off there |
| Email report | The portfolio's **Settings**, **Report** |

Only the owner can change the first two.

## The Jobs

| Job | What it does |
| --- | --- |
| Exchange and fund prices | BSE and NSE closes, AMFI NAVs, NSE index levels, gold and silver rates, and coin prices |
| Benchmark history | Index closes back to your first investment, for the comparison, and the last month of share closes |
| Coin prices | Coin prices in rupees from CoinGecko, so weekends stay current |
| Net worth snapshot | Records today's net worth for the Past chart |
| Fetch and judge news | Fetches news for every scrip you hold, and judges it if a model is connected and judging is on |
| Ebenezer's notes | Writes my notes on Today and Portfolio, for whatever changed. Skipped with no [AI model](/docs/self-hosting/ai-model). |
| Email report | Sends the portfolio's report to the addresses in its settings |
| Health check | Checks every outside source still answers the way I expect. See [Alerts and Health](/docs/self-hosting/alerts-and-health). |

If a step that serves every portfolio fails, the rest of the chain stops. If a step fails for one portfolio, the chain carries on for the others.

## Running By Hand

Under **Admin**, **Schedules** lists every schedule with how its last run went and when the next is due. Only the owner sees it. **Run now** starts a chain at once, a single step can be run alone, and **Stop** halts a running chain; whatever it saved before stopping stays. A job already running is never started twice.

A restart in the middle of a run stops that run. It is marked as stopped by a restart, and you may run it again.

## The Clock

Every time is read on the clock in `TZ`, which is `Asia/Kolkata` unless you set it in `.env`. A zone name I do not recognise falls back to `Asia/Kolkata`. Market days still follow the exchanges, whatever the clock.

## Missed Runs

When I start, I look at each schedule's last due time. If it has not run since, I was not there to run it, so I run it once now. That is a catch-up.

- **Once only:** However many runs I missed, a schedule gets one catch-up, for the latest of them. Three days down does not bring three evenings of prices or three reports.
- **Its own days:** I count only the days the schedule runs on. Prices missed on Friday evening are caught up on Monday morning, not for the weekend between.
- **Not for new schedules:** A schedule that has never run waits for its first time.
- **Run now counts:** If someone pressed **Run now** after the missed time, there is nothing to catch up.
- **Only while I was down:** Move a schedule's time to earlier than now and it simply runs at the new time on its next day.

A catch-up runs the whole chain, and is marked as one wherever the last run is shown, such as **Missed 18:45 on 11 Oct; caught up at 09:02**, until the next run on time.

## Running Several Copies

`EBENEZER_SCHEDULER=false` stops a copy of me running anything on its own. It still serves pages, and **Run now** still works on it.

If you run more than one copy against the same database, leave the scheduler on in exactly one. Each copy keeps its own count of what is running, so two schedulers would fetch every price twice and send every report twice. Catch-ups are the one exception: the database decides which copy makes one, so a missed run is never caught up twice.
