---
id: expenses-and-cards
title: Expenses And Cards
---

# Expenses And Cards

Tell me what you spent and I keep the ledger. Every rupee that leaves you gets a line, a category and the card or account it came from, and I tell you plainly where it all went. Each portfolio keeps its own expenses, so the family's spends need not sit with yours.

## The Month So Far

The top of the Expenses screen is the month in one card: what you have spent since the 1st against the same day last month, what a usual month costs you (the middle of your last six), bills that usually come by now and have not, and what your cards have spent since their last statements.

Beside it is my note: the category that has grown most, spends still waiting to be told how they were paid, a card whose statement closes within the week, and what your bank balances stand at after the spends since you set them. The eye on the note shows the plain facts I wrote it from.

## Telling The Chat What You Spent

Say it as you would to a friend: `swiggy 450 on regalia`, `electricity 2,340 from savings`, `uber 320 yesterday`. I write down the item, the amount, the day and the category, and how you paid if you said so. Several spends in one message are fine, and every save can be undone.

I match how you paid to a card, its nickname, a bank account from a Savings section, or Cash. If you name a card I do not know, I leave it blank rather than guess at another from the same bank, and if a spend could have come from more than one place, I ask.

You may also ask: "how much on food this month?", "what's left on regalia?". I answer from the month's figures, your categories, cards and accounts, and your recent spends. The chat is fresh each visit; what you save stays in the ledger.

## Categories

I put each spend in a broad bucket you would budget by: Food, Groceries, Transport, Bills, Rent, Shopping, Electronics, Health, Travel. I use one of yours whenever the spend fits it even loosely, so a phone goes in Electronics and the internet bill in Bills. I make a new one only when nothing fits, and I tell you when I do. You can rename, join and remove categories by hand from the ledger's filter.

Categories still grow one chat at a time, so they collect near-twins ("Uber" and "Cabs"), ones too narrow to budget by, and spends filed in the wrong place. **Tidy** reads your categories with their most common items and suggests what to join, rename or move. You see every change before anything happens, and you can tell me what to leave alone, like "keep Zepto apart".

## The Ledger

The ledger lists one month at a time, day by day. Search and the filter look across every month, by category, by card or account, by import, or for spends still missing how they were paid. Add, edit and remove spends by hand from here.

A spend paid from a bank account in a Savings section comes off that account's balance, if it falls after the day you set the balance.

## Trends

Trends sorts your categories by how often you spend on them and how much each time:

| | Rarely, less than once a week | Often, once a week or more |
| --- | --- | --- |
| **Big** | Occasional big ones | Regular big spends |
| **Small** | Odds and ends | Habits that add up |

Big means over your median spend for the range. Play the timeline to watch categories drift between quarters, or open one to see what it usually costs and its biggest spends.

## Importing Expenses

**Import** brings in a CSV from the app you used before, or rows pasted from a spreadsheet. Date, What and Amount are needed; Category, Paid from and Note are welcome. It works the same way as [Importing](/docs/using/importing): the AI model sees only the column names and three sample rows, and every other row is read in your browser.

Paid from is matched to your cards, accounts and Cash, and anything I cannot place is left for you to choose. New categories come in as they are; Tidy can join them later. Spends already in the ledger are skipped. Each import can be taken back out in one go from the ledger's filter.

## Credit Cards

The Credit Cards screen shows what you owe on cards, what is billed and not yet paid, what this cycle has spent so far, and how much of your limits is left. What you owe on cards is counted in what you owe on [Today](/docs/using/today).

:::info
I only keep count. Paying the card is up to you. Mark a bill paid once you have.
:::

When you add a card, you give its statement day, how many days after it payment is due, and where it stands today: the last statement's balance, what you have paid towards it, and its date. From there I keep count myself. Charge cards, paid in full each month with no preset limit, are kept too.

Not sure of a card's interest, fees or due days? **Look them up** asks the AI model to find the card's usual published terms on the bank's own site, and shows the site it came from. Your own statement has the terms that apply to you, so check them against it.

## Statements And Dues

Spends you put on a card count towards its current cycle. On the statement day, the cycle becomes the new bill. A statement I was never told was paid carries into the next one, as a bank's would. Marking the latest statement paid clears the ones before it too.

Removing a card leaves its spends in the ledger with no card against them. The note beside the cards says which bill is due next, which is overdue, which statement closes within the week, and whether your savings cover what is due. Cards from an [export](/docs/using/export) come back in through **Import** on this screen.

## What Works Without An AI Model

Most of this is arithmetic, and arithmetic needs no model. The chat, **Tidy**, looking up a card's terms, and tidying rows during an import (unless a template already has it) need one. Everything else works without: the ledger and adding spends by hand, categories, Trends, the month so far and my notes, cards, statements and dues.

Without a model, add spends with the **+** on the ledger. Only the owner can connect one; see [AI Model](/docs/self-hosting/ai-model).
