---
id: mail
title: Mail
---

# Mail

I send mail through a server you choose. Any SMTP service works, including your own mailbox's. I do not run a mail service of my own, and I would not trust one that offered.

## What Goes Out

I send the [morning reports](/docs/using/reports), invites to people you add or share a portfolio with (see [People](/docs/self-hosting/people)), and a test when you ask for one. Without a mail server, none of these go.

## Setting It Up

Only the owner can do this, under **Admin**, then **Email**.

| Field | What goes in it |
| --- | --- |
| **SMTP host** | Your mail server, such as `smtp.example.com`. Required. |
| **Port** | Usually 587 for STARTTLS and 465 for TLS |
| **Security** | **STARTTLS**, **TLS**, or **None** |
| **Username** | Often your email address. Leave it empty if the server wants no sign-in. |
| **Password** | The password for that username |
| **From address** | The address mail comes from, such as `ebenezer@example.com`. Required. |

**None** sends everything unencrypted and is only for a relay on a network you trust.

For Gmail, Outlook and Zoho, press its chip and I fill in the server; you still give the username, password and From address.

| Service | Host | Port | Security |
| --- | --- | --- | --- |
| Gmail | `smtp.gmail.com` | 587 | STARTTLS |
| Outlook | `smtp-mail.outlook.com` | 587 | STARTTLS |
| Zoho | `smtp.zoho.com` | 587 | STARTTLS |

## Sending A Test

A test goes to your own account's address, through the saved settings, so I save what you typed before I send it. If it fails, I show the server's own complaint. Common ones are in [Troubleshooting](/docs/self-hosting/troubleshooting).

The mail password is locked with `EBENEZER_ENCRYPTION_KEY` before it reaches the database, and once saved I never show it again.
