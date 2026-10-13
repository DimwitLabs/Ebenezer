# Contributing to Ebenezer

Thank you for your interest in contributing to Ebenezer!

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a new branch following our branch naming conventions (see below)
4. Make your changes and test them
5. Commit using conventional commits (see below)
6. Submit a Pull Request

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages, one line each.

Examples:
```
feat(import): read KFintech statements
fix(value): count switches in wealth XIRR
chore(web): drop an unused helper
docs: explain the external database
```

## Branch Naming

Branch names follow the same convention as commits:

```
<type>/<short-description>
```

Examples: `feat/screener`, `fix/cas-continuation-lines`, `docs/settings`

## Development

See [Develop](README.md#develop) in the README for running the database, the Go server and the web app.

```bash
go test ./...
cd web && npm test && npm run build
```

`EBENEZER_TEST_DATABASE_URL` points the database tests at a Postgres you can throw away. `EBENEZER_LIVE=1` runs the checks against the real price and news sources.

## Good To Know

Screens are built from `web/src/design-system/`. Read its `README.md` before writing a new component or CSS class, and extend a primitive there rather than copying it into a screen. A pattern that turns up a third time in feature code moves into the design system. If a screen needs something the design system can't express, say so in the pull request rather than quietly adding a one-off.

Elements that sit together as a set, such as options, tiles, chips, buttons or rows, share one height and width whatever their text. Check every set at desktop and phone widths.

Colours live as tokens in `web/src/design-system/tokens.css`, each holding its light and dark value through `light-dark()`; add a colour there rather than inline.

The price and news sources are unofficial. When you change how one is read, change its health check in `internal/app/health.go` too.

The site at `docs/` is one Docusaurus build: the landing page in `docs/src/pages/index.tsx` at the root, and the docs under `/docs`. The landing page is screenshots of the real app with a little copy in Ebenezer's own voice, styled from the app's tokens and icons in `docs/src/css/landing.css`; on a phone each section becomes a row of swipeable cards. When a screen it shows changes, retake the screenshots: start `cd web && node_modules/.bin/vite --config vite.shots.config.ts`, then run `node web/shots/capture.mjs` (needs `cwebp`). They land in `docs/static/img/shots` with transparent backgrounds. The sample data in `web/shots/` is typed against `web/src/lib/api.ts`, so `npx tsc --noEmit -p shots` from `web` catches drift.

## Guidelines

- Keep things readable and follow existing conventions of code structure
- Format Go with gofmt and TypeScript with prettier at `--print-width 200`; keep CSS to one rule per line and don't run prettier on it
- Change the database by editing `internal/store/schema.sql` in place; there are no migrations. It runs on every start, so every statement must be safe to run again: `CREATE TABLE IF NOT EXISTS`, `CREATE [UNIQUE] INDEX IF NOT EXISTS`, `ON CONFLICT DO NOTHING` for seed rows, and an update that fills old rows only where they are still empty. To add a column, put it in the `CREATE TABLE` and add `ALTER TABLE {s}.table ADD COLUMN IF NOT EXISTS ...` with the same definition straight after it, so existing databases get it too; a `NOT NULL` column needs a `DEFAULT` for the rows already there. A constraint, type, function or trigger outside a `CREATE TABLE` needs its own guard, such as `CREATE OR REPLACE FUNCTION` or a `DO` block that checks the catalogue first
- Comment the why, not the what; delete a comment that restates the code beneath it
- Delete code you make unreachable rather than leaving it behind a flag
- Include tests for new behaviour and ensure all tests pass before submitting
- Update CHANGELOG.md with your changes

## Contribution Terms

Ebenezer is licensed under the MIT License, and contributions are accepted under the same licence.

By submitting a pull request you confirm that the contribution is your own work and that you have the right to submit it.

Thank you for contributing!
