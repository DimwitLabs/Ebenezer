---
id: ai-model
title: AI Model
---

# AI Model

I reach AI models through OpenRouter, so you choose the model and pay only for what I use. The model reads and writes for me. The sums I do myself.

## Connecting OpenRouter

Only the owner can do this, under **Admin**, then **AI**.

1. Make a key at [openrouter.ai/keys](https://openrouter.ai/keys) and add a few dollars of credit.
2. Paste it into **OpenRouter key**.
3. Pick a **Model** from the list. Each shows its price in dollars per million tokens in and out.
4. Press **Test**, then **Save**.

The model is shared by every portfolio on this Ebenezer, and so is the bill. Until you pick one, I use `anthropic/claude-sonnet-5.5`.

**Test** asks the model for a small piece of JSON. If it answers, but not with the JSON asked for, the model cannot keep to the format I need, so pick another. Other failures are usually a bad key, no credit, or a model id that does not exist.

:::warning[PII Redaction]
If your OpenRouter key has PII redaction on, fund and index names turn into placeholders on the way and ruin every answer. The test says so when it happens. Turn redaction off for this key on OpenRouter.
:::

## A Model Per Portfolio

Each portfolio may use a model of its own, under its **Settings**, then **Ebenezer**. Members can do this for portfolios shared with them, and it still runs on the owner's key. The portfolio's model does everything for that portfolio, tidying imported rows included.

## What Uses It

| What | Without a model |
| --- | --- |
| Judging news, signal or humbug. See [News](/docs/using/news). | Stories are still fetched and saved, but not judged |
| My notes on Today and Portfolio. See [Today](/docs/using/today). | Written from a phrasebook rather than fresh |
| Answering questions in [Ask](/docs/using/ask) | Nothing to answer with |
| The spend chat and tidying categories. See [Expenses and Cards](/docs/using/expenses-and-cards). | Add and sort spends by hand |
| Looking up a card's terms | Fill them in yourself |
| Tidying imported rows that do not fit. See [Importing](/docs/using/importing). | Fix the rows that fail by hand |

Prices, returns, imports, statements, the ledger, reports and the [export](/docs/using/export) need no model at all.

Every request leaves this server for OpenRouter and whichever provider runs the model. **What Ebenezer sees**, on every note and on Ask, shows you exactly what I send.

## The Key Is Kept Sealed

I lock the key with `EBENEZER_ENCRYPTION_KEY` before it reaches the database, and once saved I never show it again, not even to you. You can replace or remove it. Removing it stops everything above until a new one is saved.

If you have saved a key, the daily [health check](/docs/self-hosting/alerts-and-health) also asks OpenRouter whether it still accepts it.
