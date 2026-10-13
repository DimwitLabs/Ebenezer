---
id: news
title: News
---

# News

Every story about a company you hold crosses my desk. I mark it signal or humbug, with one line on why. A broker's opinion: humbug. A price that moved: humbug. A headline written to be clicked: humbug, humbug. What is left, read.

News is kept for each portfolio, for the shares it holds today. Funds, bonds and the rest bring no news; a share you have sold brings none either.

## How I Find It

For each company in a Stocks section, I look in two places:

- **The news:** I search Google News by the company's full name, never a bare ticker. NSE and BSE tickers differ, and short ones like HAL match all manner of noise.
- **Its BSE filings:** Everything the company has filed with BSE over the same days, when I know its BSE code.

Stories with nearly the same headline are kept as one. Filings come with their PDF, which I fetch for you, since the exchanges turn away a browser that arrives from another site. To read one company's news at once, open the share on the Portfolio screen and fetch it there.

## Signal Or Humbug

An AI model of your choosing reads each story's headline, source, age and snippet, and gives it a verdict and a reason in a few words. It is told to use nothing else: no outside knowledge, no invented figures.

| Verdict | What it means |
| --- | --- |
| Signal | Something happened: results, a dividend or buyback, an order, a rating, a management change, a regulatory or tax change, a deal or fundraise, a real operating figure. Dated events to come, such as a record date or a board meeting, are signal too. |
| Humbug | Price targets, broker calls, listicles, live-price pages, stories that only say the share price moved, technical chatter, and anything built to be clicked with no new fact |
| Stale | It describes something already over, more than three days ago by default |
| Unclear | The headline and snippet do not say what happened |
| Offtopic | It is about another company, a general market wrap, or names your company only in a list |
| Routine | A filing on your skip list, set aside without asking the model at all |

Once a story is judged, its verdict stays. A later run never changes what you have already read. The News screen opens on signal, and humbug is a tap away in case you doubt me.

## Judging Rules

Each portfolio judges by its own rules, under Settings, **News**, **How the judge decides**. They are plain words, read by the model as written: what counts as worth reading, what counts as noise, anything else the judge should know, and filings to skip without asking, such as trading window notices and newspaper publications. You can also set when a story counts as stale and how long my reasons may run.

Only what you change from the default is kept, so a portfolio you never touch picks up any improvement to the defaults when you upgrade. The reasons are written in the portfolio's own voice; see [Voice](/docs/using/voice).

## When I Fetch

Under Settings, **News**:

| Setting | Default | What it does |
| --- | --- | --- |
| Look back, days | `3` | How far back I search on each run |
| Stories per scrip, at most | `6` | From the news, and again from filings, for each company |
| Fetch news on a schedule | On | Runs at the times you list |
| Times each day | `07:00`, `18:30` | In the instance's time zone |
| Have the AI judge each story | On | Signal or humbug, with a reason. Needs an AI model. |

After each run I rewrite my notes on Today, so a story worth knowing reaches them. **Fetch now** runs it at once whether the schedule is on or not. When two portfolios hold the same company, they share the fetching, but each judges by its own rules. See [Schedules](/docs/self-hosting/schedules) for every job together.

## With No AI Model

I still fetch the news and the filings. Nothing is judged, so every story is **Unjudged** and the screen opens on everything. The same is true if you turn judging off; you may still have one story judged by hand, if a model is connected.

When judging is on and the model fails partway, the stories it never saw are picked up on the next run rather than left unjudged for good. Connecting a model is on [AI Model](/docs/self-hosting/ai-model).
