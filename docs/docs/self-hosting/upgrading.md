---
id: upgrading
title: Upgrading
---

# Upgrading

Upgrading is a pull and a restart. Take a [backup](/docs/self-hosting/backups) first. It costs a minute, and not taking one has cost people a good deal more.

## The Pull

From the folder with your compose file and `.env`:

```bash
docker compose pull
docker compose up -d
```

If you use your own database, name the other file both times:

```bash
docker compose -f docker-compose.external-db.yml pull
docker compose -f docker-compose.external-db.yml up -d
```

Compose replaces my container with the new image. The bundled database keeps its volume and carries on.

Read the release notes for the version you are moving to before you pull it. They are on GitHub with each release, and in `CHANGELOG.md`.

## Pinning A Tag

`EBENEZER_VERSION` in `.env` picks the image tag, and is `latest` when unset. `latest` moves with every release, so each pull may bring a new version. To sit still, pin one:

| Set `EBENEZER_VERSION` to | You get |
| --- | --- |
| `X.Y.Z` | That release and nothing else, until you change it |
| `X.Y` | Patches to that minor version, but no new features |
| `X` | Everything within that major version |
| `latest`, or nothing | Every release as it comes |

Put the release's number in place of the letters, then pull and start as above. The tags are listed in [Installing](/docs/self-hosting/install).

## The Database On Start

There is nothing to run by hand, and there are no migrations. Every time I start, I bring the database up to date myself: I make any table that is missing and add any column a new version needs. What is there already, I leave alone, and your rows are never touched beyond filling in a new column.

I also rebuild every section's holdings on start, so a change in how I read your rows shows at once.

## When To Do It

Any time no schedule is running. A run that is going when the old container stops is cut short, and you may run it again. A schedule whose minute passes while I am down is caught up once I am back. See [Missed Runs](/docs/self-hosting/schedules#missed-runs).

Your sign-in survives an upgrade. Sessions live in the database, not in the container.
