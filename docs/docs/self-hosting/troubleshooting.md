---
id: troubleshooting
title: Troubleshooting
---

# Troubleshooting

Most of what goes wrong with me goes wrong somewhere else first: an exchange, a mail server, a browser that will not keep a cookie. Here is what I have seen, what I say when I see it, and what to do.

## Seeing What I Said

Every scheduled run keeps a line on how it went, under **Admin**, **Schedules**, for each step. For more, read my logs:

```bash
docker compose logs ebenezer
```

Add `-f docker-compose.external-db.yml` after `docker compose` if you use your own database.

## Prices Have Stopped

The exchanges and AMFI publish their files for anyone who asks, and change them without telling anyone. A column is renamed, a file moves, a site starts turning visitors away. I have no say in it.

Open `/health` first. It shows every source I read, whether it answered, and what came back. If one has failed twice in a row and you have [ntfy](/docs/self-hosting/alerts-and-health) set up, you have already had an alert.

What the **Prices** run says tells you where to look:

| Message | What it means |
| --- | --- |
| `no NSE bhavcopy in the last week` | I found no NSE closing file for any of the last week's weekdays. NSE is turning me away, or has moved its file. |
| `BSE: ...`, `AMFI: ...`, `gold: ...`, `crypto: ...` | That one source failed. The others were still saved, and holdings still rebuilt from them. |
| `unexpected shape` on `/health` | The source answered, but with something that no longer looks like the file I know. |

A source that has changed its file needs a new version of me to read it. Watch the releases, and [upgrade](/docs/self-hosting/upgrading) when the fix arrives. Until then, the prices you have stay as they were, and **Run now** under **Prices** tries again whenever you like.

## No Alerts Arrive

I send alerts only to the ntfy address saved under **Admin**, in **Alerts**. Nothing in `.env` sets it. Save the address there, then press **Send a test**.

If the test fails, ntfy's own reply follows it. A protected topic turning me away usually means the token, or the username and password, under **Sign-in** are wrong.

## A Web Page Instead Of The File

`got a web page instead of the file` means I asked for a file and got a web page back. That is usually a bot wall in front of the exchange, not a holiday, and I do not treat it as one: a holiday is skipped quietly, a wall is a failure.

A single evening of it often clears by itself. If it lasts, the exchange is turning away requests from your server's address, and nothing in my settings changes that. The health check will keep failing until it lifts.

## News Comes In Unjudged

Stories arrive on the News screen without a verdict. Either no [AI model](/docs/self-hosting/ai-model) is connected, or **Have the AI judge each story** is off in the portfolio's **Settings**, under **News**. Connect a model, or switch judging back on, and the next run judges what it finds. Only the owner can connect one.

## The Model Test Fails

| Message | What to do |
| --- | --- |
| `... answered, but not with the JSON asked for` | The model cannot keep to the format I need. Pick another. |
| `... answered, but words were redacted on the way` | Turn off PII redaction for this key on OpenRouter. It turns fund and index names into placeholders. |
| `add an OpenRouter key first` | Paste a key before pressing **Test**. |
| Anything from `openrouter:` | OpenRouter's own complaint: a bad key, no credit, or a model id it does not know. |

If **Model** is a plain box rather than a list, I could not reach OpenRouter to fetch the list. Type the model's id, or try again later.

## Mail Will Not Go

A failed test email comes with the server's own reason underneath.

| Reason starts with | Usually means |
| --- | --- |
| `sign-in:` | The username or password is wrong, or the server wants an app password rather than your usual one. If it says `unencrypted connection`, you have **Security** set to **None** with a username, and I will not send a password in the clear to another machine. |
| `STARTTLS:` | **Security** does not match the port. STARTTLS usually goes with 587, TLS with 465. |
| `the From address` | The **From address** is not an email address. |
| A timeout or refused connection | The host or port is wrong, or your server cannot reach it. Some hosts block outgoing mail ports. |
| `set up SMTP in Settings first` | No host or From address is saved. |

If an invite fails, the person's account is made all the same, and I say so: `... is set up, but I couldn't send the email`. Fix the mail, then press **Send invite** beside their name under **People**.

A report that fails with `add an address to send the report to in Settings` has nobody to go to. The owner adds addresses under the portfolio's **Report** settings.

## Signing In Goes Nowhere

You sign in, and land back on the sign-in page. You are reaching me over plain HTTP while `EBENEZER_SECURE_COOKIES` is `true`, so your browser is not sending the sign-in cookie back.

Put me behind HTTPS, as in [Installing](/docs/self-hosting/install). To try me over plain HTTP on your own machine, set `EBENEZER_SECURE_COOKIES=false` in `.env` and run `docker compose up -d` again.

`your session has ended; sign in again` means what it says. A sign-in lasts `EBENEZER_SESSION_HOURS`, 14 days by default, and changing your password signs you out everywhere else.

## Too Many Attempts

`too many attempts; wait a few minutes` comes after 10 tries at one email, or 100 from one address, within 15 minutes. Wait, and it lifts. Behind a reverse proxy, every sign-in reaches me from the proxy's address, so everyone shares that hundred.

Asking the model is limited too: each person may send 60 requests an hour, across Ask, the spend chat and the rest, and a portfolio may send six reports an hour by hand. Past that, I ask you to wait.

## Saved Keys Have Gone Blank

The OpenRouter key, the ntfy token or password, or the mail password shows as not set, though you saved it. `EBENEZER_ENCRYPTION_KEY` has changed since. My log says `this secret was sealed with a different EBENEZER_ENCRYPTION_KEY`.

If you have the old key, put it back in `.env` and restart me, and they all open again. If it is lost, they are lost: nobody can open them. Type them in again under **Admin**, and keep the key somewhere safe this time.

The rest of your ledger is not sealed with the key, so it is all still there.

## I Will Not Start

Compose or I will say why in the logs before giving up.

| Message | Fix |
| --- | --- |
| `set POSTGRES_PASSWORD, see .env.example` | Set it in `.env`. |
| `set EBENEZER_ENCRYPTION_KEY, see .env.example` | Set it in `.env`. |
| `set EBENEZER_DATABASE_URL, see .env.example` | You are using `docker-compose.external-db.yml`. Set the connection string in `.env`. |
| `EBENEZER_ENCRYPTION_KEY must be at least 32 characters` | Make one with `openssl rand -base64 32`. |
| `EBENEZER_PUBLIC_URL should look like https://ebenezer.example.com` | Give the full address, starting `https://` or `http://`. |
| `EBENEZER_SECURE_COOKIES must be true or false` | The same goes for `EBENEZER_SCHEDULER`. |
| `EBENEZER_SESSION_HOURS must be a positive whole number` | Hours, such as `336`. |
| `database url: ...` | The connection string is not one Postgres understands. |
| `failed to connect to ...` | I cannot reach the database. Check the host, port, password and `sslmode`. |
| `create schema: ...` or `create tables: ...` | I reached the database but may not make or change my schema and tables in it. Give the user that right. I bring the tables up to date on every start, not only the first. |

## A Run Says It Was Stopped

`stopped by a restart; run it again` means I was restarted part-way through, by an upgrade or a reboot. `stopped by you` means someone pressed **Stop**. Either way, whatever it saved before stopping is kept. Press **Run now** to finish the job.
