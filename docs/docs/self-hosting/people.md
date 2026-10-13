---
id: people
title: People
---

# People

One person owns this Ebenezer. Everyone else is let in by the owner, and sees only the portfolios the owner shares with them. A household's money is nobody else's business, and I keep it that way.

## The Owner And Members

The owner is whoever made the first account. I mark them **Admin** in the list of people, and there is only one. Everyone else is a member.

| | Owner | Member |
| --- | --- | --- |
| Make portfolios of their own, and delete the ones they made | Yes | Yes |
| Work in a portfolio shared with them, settings included | Yes | Yes |
| Export what they can see | Yes | Yes |
| Add and remove people | Yes | No |
| Share a portfolio | Yes | No |
| Choose who a portfolio's report is emailed to | Yes | No |
| Set the AI model, mail server, alerts, price times and gold rates | Yes | No |
| See the schedules under **Admin** and the `/health` page | Yes | No |

The report's addresses are the owner's because reports go out through the owner's mail server. A portfolio a member makes for themselves is theirs alone: I do not show it to the owner, and since only the owner can share, it stays that way. Where a member asks for something that needs an AI model and none is connected, I tell them to see the owner, by name.

## Adding Someone

Under **Admin**, open **People** and add them with their email, name and a first password. If the [mail server](/docs/self-hosting/mail) is set up, I can email the invite instead: I make up the first password, mail it with a link to sign in, and nobody else ever sees it. Without mail, you choose the password and hand it over yourself.

A first password does one thing: it lets them choose their own. Until they do, it opens nothing else, and after that it stops working. If the invite went astray before they signed in, send a new one; the old password stops working at once.

:::info
The link in the invite comes from `EBENEZER_PUBLIC_URL`. Without it, the email has their address and first password but nowhere to click.
:::

## Sharing A Portfolio

Open the portfolio's **Settings** and find **Shared with**. Every person on this Ebenezer is listed with a switch: on lets them open it, off stops them. **Invite by email** shares it with someone new, making their account as above, or with someone who already has one, who keeps their password.

Only the owner can share, and only a portfolio the owner is on. The owner can never be switched off a portfolio they are on.

## Who Owns A Portfolio

A portfolio belongs to whoever made it, and only they can delete it. A portfolio made before I kept track of this belongs to the owner if they are on it, and otherwise to whoever on it has had an account the longest.

## Removing Someone

Remove someone under **People** and they can no longer sign in. The owner cannot be removed. I will not remove someone who is the only person on a portfolio, as it would be left with nobody to open it: share it with someone else first, or delete it.

The portfolios a removed person owned pass to the owner if they are on them, and otherwise to whoever on each has had an account the longest.

## Forgotten Passwords

There is no reset. A new invite only works for someone who has not yet chosen their own password. Once they have, I cannot read it back and will not make up a new one, so keep yours somewhere safe.
