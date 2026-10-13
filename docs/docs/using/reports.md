---
id: reports
title: The Report
---

# The Report

Each portfolio can have a report: a short email with what changed, sent on the days and at the time you choose, through your own mail server. Read it with your tea and you need not open me at all, which suits us both.

Everything about it is in Settings, under **Report**.

## What It Holds

The subject line carries the portfolio's name, its net worth, and the change since the last day I recorded one. Below it come the parts you choose:

- **Summary:** Net worth and the change, what is owned, owed and put in, your wealth XIRR, and the same money in your benchmark.
- **Ebenezer's note:** My note from [Today](/docs/using/today), in the portfolio's own [voice](/docs/using/voice).
- **Sections:** Each section's value, gain, XIRR and share of what is owned.
- **Movers:** The last trading day's biggest gainers and losers among your holdings, by rupees made or lost.
- **News:** Stories judged signal, each with my reason. With few or none, say because no AI model is connected, a few recent unjudged stories fill in, marked as such. Humbug never does.
- **Source health:** Any source that failed the last health check, and nothing when all is well.

A part with nothing to show is left out rather than sent empty.

:::tip
Set `EBENEZER_PUBLIC_URL` and the report links back to me. Without it, those links are left out. See [Configuration](/docs/reference/configuration).
:::

## When It Comes And Who Gets It

The schedule is off until you turn it on. It sends at `08:00` every day unless you choose other days or another time, in the instance's time zone. **Send now** sends one at once, and **Preview** shows it as it would go out without sending a thing, so you can arrange the parts before the mail is even set up. See [Schedules](/docs/self-hosting/schedules) for every job together.

Only the owner chooses which addresses it goes to. The report goes out through the owner's mail server, so the owner decides where it goes. Anyone the portfolio is shared with may change the rest.

## Mail Comes First

I send nothing until a mail server is set up under Admin. The owner does that once for the whole instance: see [Mail](/docs/self-hosting/mail).
