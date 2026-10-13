---
id: backups
title: Backups
---

# Backups

Everything I keep lives in Postgres, in one schema: `ebenezer`, unless you set `EBENEZER_DB_SCHEMA` to something else. Back up that schema and you have backed up me. I have no backup button and no script for it. `pg_dump` has done the job for decades and does not need my help.

## The Bundled Database

The `db` container has no network, so the dump runs inside it. From the folder with `docker-compose.yml`:

```bash
docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U ebenezer -d ebenezer -n ebenezer' > ebenezer.sql
```

The single quotes matter: `$POSTGRES_PASSWORD` is read inside the container, where it is already set. If you changed `EBENEZER_DB_SCHEMA`, put your schema's name after `-n`.

Run it from cron for a nightly copy, and keep a few days of them somewhere that is not this machine.

## Your Own Database

Point `pg_dump` at the same connection string I use:

```bash
pg_dump "$EBENEZER_DATABASE_URL" -n ebenezer --no-owner -f ebenezer.sql
```

`--no-owner` lets the dump be restored as whichever user you connect with later. Use a `pg_dump` as new as your server, or newer. Supabase and most managed Postgres services keep backups of their own as well, and those cover the whole database, not only my schema.

## Restoring

A restore replaces everything I hold with what is in the dump. Stop me first, so nothing writes while it runs.

For the bundled database:

```bash
docker compose stop ebenezer
docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U ebenezer -d ebenezer -c "DROP SCHEMA IF EXISTS ebenezer CASCADE"'
docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U ebenezer -d ebenezer -v ON_ERROR_STOP=1' < ebenezer.sql
docker compose start ebenezer
```

On a fresh machine, start the database alone with `docker compose up -d db`, restore as above, then `docker compose up -d`.

For your own database:

```bash
docker compose -f docker-compose.external-db.yml stop ebenezer
psql "$EBENEZER_DATABASE_URL" -c "DROP SCHEMA IF EXISTS ebenezer CASCADE"
psql "$EBENEZER_DATABASE_URL" -v ON_ERROR_STOP=1 -f ebenezer.sql
docker compose -f docker-compose.external-db.yml start ebenezer
```

:::danger
`DROP SCHEMA ... CASCADE` deletes every table I have, at once and for good. Make sure the dump you are about to restore is the one you mean.
:::

## Keep The Key Beside It

The OpenRouter key, the ntfy token or password and the mail password are in the dump, sealed with `EBENEZER_ENCRYPTION_KEY`. That is deliberate: a stolen backup hands over none of them.

So keep the key with your backups, but never in them. A password manager is a good home for it. Restore with the same key and everything opens. Restore with a different one and your ledger is all there, but those secrets read as unset, and you type them in again under **Admin**.

`.env` holds the key in plain text. Back it up separately from the dump, and do not leave the two side by side in the same folder.

## A Copy You Can Read

A dump is for me. For a copy you can open yourself, use the [export](/docs/using/export): every portfolio you can see, as CSV files you can bring back in. It is a fine thing to keep, but it is not a backup of me. It carries no settings, no accounts, no price history and no news.
