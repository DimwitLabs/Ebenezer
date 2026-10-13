---
id: configuration
title: Configuration
---

# Configuration

Set these in `.env`. Everything else is in Settings, where it belongs.

Keys and passwords are never set here. The OpenRouter key, the ntfy token or password and the mail password are entered under **Admin**, locked with `EBENEZER_ENCRYPTION_KEY` before they reach the database, and never shown again.

## Required

| Variable | What it does |
| --- | --- |
| `EBENEZER_DATABASE_URL` | Postgres connection string. Poolers work. The bundled compose file builds this itself from `POSTGRES_PASSWORD`, so set it only for your own database. |
| `EBENEZER_ENCRYPTION_KEY` | Locks the keys and passwords saved in Settings. At least 32 characters. Make one with `openssl rand -base64 32`. |

## Database

| Variable | Default | What it does |
| --- | --- | --- |
| `EBENEZER_DB_SCHEMA` | `ebenezer` | Schema for my tables. I make it on first start, and bring its tables up to date on every start. |
| `POSTGRES_PASSWORD` | | Password for the bundled database. Letters and digits only. Read by `docker-compose.yml`, not by me. |

## Server

| Variable | Default | What it does |
| --- | --- | --- |
| `EBENEZER_PUBLIC_URL` | | Where people reach me, such as `https://ebenezer.example.com`, for links in emails. Must start `https://` or `http://`. |
| `EBENEZER_SECURE_COOKIES` | `true` | `false` only for plain HTTP on your own machine. |
| `EBENEZER_SESSION_HOURS` | `336` | How long a sign-in lasts, in hours. A positive whole number. |
| `EBENEZER_ADDR` | `:8080` | Listen address inside the container. The compose files do not pass it, so leave it unless you run me without them. |

## Schedules

| Variable | Default | What it does |
| --- | --- | --- |
| `EBENEZER_SCHEDULER` | `true` | Run prices, news, reports and health on schedule, and catch up runs missed while I was down. Turn off on all but one copy. |
| `TZ` | `Asia/Kolkata` | The clock every schedule time is written in. A name I do not know falls back to `Asia/Kolkata`. |

Where alerts go is not set here. The ntfy address is saved under **Admin**, in **Alerts**. See [Alerts and Health](/docs/self-hosting/alerts-and-health).

## Compose Only

These are read by the compose files, not by me.

| Variable | Default | What it does |
| --- | --- | --- |
| `EBENEZER_VERSION` | `latest` | The image tag to run. See [Upgrading](/docs/self-hosting/upgrading). |
| `EBENEZER_BIND` | `127.0.0.1` | The host address my port is published on. |
| `EBENEZER_PORT` | `8080` | The host port I am published on. |

:::danger
Changing `EBENEZER_ENCRYPTION_KEY` after secrets are saved locks them away for good. Change it only if you mean to enter them all again.
:::
