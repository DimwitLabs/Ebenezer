---
id: install
title: Installing
---

# Installing

All you need is Docker, and the patience to fill in two lines of a file. I come as one image with everything in it: the server, the web app, and the schedules that run behind them.

## Getting The Files

The compose files and `.env.example` live in my repository. Take a copy:

```bash
git clone https://github.com/DimwitLabs/Ebenezer.git
cd Ebenezer
```

There are two compose files. Pick one and use it from here on.

| File | Use it when |
| --- | --- |
| `docker-compose.yml` | You want me to bring my own Postgres. Start here if you are unsure. |
| `docker-compose.external-db.yml` | You already have a Postgres, Supabase included, and want me to keep my tables in it. |

## Starting Me

```bash
cp .env.example .env
```

Set `POSTGRES_PASSWORD` and `EBENEZER_ENCRYPTION_KEY` in it. The password ends up in a connection string, so keep it to letters and digits. This makes a suitable one:

```bash
openssl rand -hex 24
```

Make the key with:

```bash
openssl rand -base64 32
```

Then start me:

```bash
docker compose up -d
```

You will find me at `http://localhost:8080`. Whoever makes the first account there owns the place.

:::warning[Keep This Key]
Every key and password you hand me in Settings is locked with `EBENEZER_ENCRYPTION_KEY`. Lose it and I cannot open them. Nobody can. You will be typing the lot in again, so keep a copy somewhere other than this server.
:::

The key must be at least 32 characters, or I refuse to start. Your ledger itself is not locked with it, only the OpenRouter key, the ntfy token or password, and the mail password. What happens when the key goes missing is in [Troubleshooting](/docs/self-hosting/troubleshooting).

## The Bundled Database

`docker-compose.yml` runs two containers: me, and a `postgres:18-alpine` called `db`. The database has no network of its own. It listens on a socket shared with my container and nowhere else, so nothing on your network can reach it, let alone the internet.

Its data lives in a Docker volume called `postgres_data`. Removing the containers leaves the volume alone. Removing the volume removes your ledger, so take a [backup](/docs/self-hosting/backups) before you go anywhere near it.

## Your Own Database

If you would rather use your own Postgres, Supabase included, set `EBENEZER_DATABASE_URL` in `.env` and use the other compose file:

```bash
docker compose -f docker-compose.external-db.yml up -d
```

`POSTGRES_PASSWORD` is not used with this file.

- **Poolers work:** I talk to the database in a way that survives a transaction pooler, so Supabase's pooled connection string is fine.
- **Ask for TLS:** For a database across a network, end the connection string with `sslmode=require`, or `sslmode=verify-full` if you can.
- **A schema of my own:** I keep my tables in a schema called `ebenezer` unless you set `EBENEZER_DB_SCHEMA`, so I can share a database without making a mess of it. I make the schema myself on first start.

## The Published Image

Both compose files run `ghcr.io/dimwitlabs/ebenezer`, built for `linux/amd64` and `linux/arm64`. It is tagged several ways:

| Tag | What it follows |
| --- | --- |
| `latest` | The newest build of `main`, released or not. The compose files use it unless told otherwise. |
| `development` | The newest build of the `development` branch, when there is one. Expect it to break. |
| `X.Y.Z` | One release exactly, numbered as in its release notes. |
| `X.Y` | The newest patch of that minor version. |
| `X` | The newest release of that major version. |

`EBENEZER_VERSION` in `.env` picks the tag; set it to `X.Y` to stay on releases. Moving between tags is covered in [Upgrading](/docs/self-hosting/upgrading).

## HTTPS And Reaching Me

By default I listen on `127.0.0.1:8080`, which only the machine I run on can reach. `EBENEZER_BIND` and `EBENEZER_PORT` in `.env` change the address and the port.

I do not speak HTTPS myself. Put me behind a reverse proxy that does, and point it at the port above. Do this before you trust me with anything real: your sign-in cookie is marked secure, and a browser will not send it back over plain HTTP.

To try me over plain HTTP on your own machine, set this in `.env`:

```bash
EBENEZER_SECURE_COOKIES=false
```

I will warn you about it in my logs every time I start, and I mean it. Turn it back on before anyone else signs in.

Once I have an address of my own, tell me what it is, so the links in invites and reports go somewhere:

```bash
EBENEZER_PUBLIC_URL=https://ebenezer.example.com
```

Leave it empty and those emails go out without a link. Every setting is listed in [Configuration](/docs/reference/configuration).

## The First Account

The first person to open me becomes the owner, and there is only ever one. Once that account exists the screen is gone for good, so open me yourself before you tell anyone the address. What happens next is in [First Run](/docs/first-run).
