---
id: importing
title: Importing
---

# Importing

Everything I count comes from rows. You can bring them to me three ways: a table from a spreadsheet or a broker's export, a statement PDF from CAMS, KFintech, NSDL or CDSL, or one row at a time by hand. All three start on the **Data** screen.

## Bringing In A Table

Pick a section on **Data** and press **Import**, then choose a CSV file or paste the rows with the header row first. Any columns will do; I take CSV only.

I match each of the section's fields to a column by its name and by the names brokers commonly use, so "Trade Date", "Qty" and "Buy/Sell" find their places without help. Check the matches against the preview before you go on, and change any I got wrong.

At the end you can choose to **Replace what is there**. Left off, rows already in the section are kept and exact repeats are skipped. Holdings are worked out again at once, first in first out.

## Tidying Up

Broker exports are rarely tidy. Dates come in three formats, actions say "B" and "S", and numbers carry commas and brackets. If any rows fail to fit the section's fields, I ask the AI model to write a small script that repairs them.

- **What the model sees:** The column names and three sample rows, with the problems I found in them. Every other row stays in your browser.
- **What the script may do:** Put dates into one format, read numbers, map "B" or "Purchase" to the nearest choice, and drop rows that are not data at all, such as totals or repeated headers. It is told never to merge or invent rows.
- **Where it runs:** In your browser, in a worker that is forbidden any network access. It cannot send your rows anywhere.

If the result is not to your liking, say what to change, such as "leave out rows before 2024", and the model rewrites the script. Rows that still fail you can fix by hand or leave out.

:::info
Tidying needs an AI model. Without one, you fix the failing rows by hand. If nothing fails, no model is asked. See [AI Model](/docs/self-hosting/ai-model).
:::

## Saved Templates

Save an import as a template and I remember its column matches and, if the rows needed tidying, the script that tidied them. Next time, choose the template and the same file from the same broker goes in with no matching and no AI model asked. Templates belong to the portfolio and to the kind of section they were made for.

## Statement PDFs

**Upload a statement** on **Data** covers the whole portfolio, not one section.

| Statement | What it brings |
| --- | --- |
| CAMS or KFintech, the **detailed** one | Every mutual fund transaction in it |
| NSDL or CDSL | Every holding in your demat accounts, as it stood on the statement's last day |

Statements are locked with the password you set when you asked for them, usually your PAN.

:::info
The file and its password stay in the browser tab. I read the PDF there and only the rows you tick come to me.
:::

I compare the statement with my own books for the same day and list every holding with what the statement says, what I have, and what I would add to make them agree: missing transactions, holdings I have never heard of, or a buy or sell to correct a wrong quantity. You tick what goes in. If you have no section for the funds, shares or bonds on it, I make one. A holding with no ISIN cannot be priced or checked against a statement, and I warn you about it.

## Opening Positions

A demat statement lists what you hold, not what you paid or when. A holding I add from one is counted from the statement day at that day's value. If the statement gives no cost, the cost is unknown: the holding counts in net worth but is left out of every gain and every XIRR, and I say so on Today and Portfolio.

Import your tradebook or order history later and its trades replace those opening positions, scrip by scrip.

## By Hand And Elsewhere

**Add by hand** on a section takes one row at a time in the section's own fields, and holdings are counted again the moment it is saved. A gold row with no metal marked is counted as 24 karat gold.

Expenses and credit cards have their own **Import**, through the same dialog; see [Expenses and Cards](/docs/using/expenses-and-cards). Files from an [export](/docs/using/export) come back in through **Import** with nothing to match.
