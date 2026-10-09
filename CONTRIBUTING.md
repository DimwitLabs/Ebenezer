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

Colours live as tokens at the top of `web/src/design-system/design-system.css`, each holding its light and dark value through `light-dark()`; add a colour there rather than inline.

The price and news sources are unofficial. When you change how one is read, change its health check in `internal/app/health.go` too.

## Guidelines

- Keep things readable and follow existing conventions of code structure
- Format Go with gofmt and TypeScript with prettier at `--print-width 200`; keep CSS to one rule per line and don't run prettier on it
- Change the database by editing `internal/store/schema.sql` in place; there are no migrations
- Comment the why, not the what; delete a comment that restates the code beneath it
- Delete code you make unreachable rather than leaving it behind a flag
- Include tests for new behaviour and ensure all tests pass before submitting
- Update CHANGELOG.md with your changes

## Contribution Terms

Ebenezer is licensed under the MIT License, and contributions are accepted under the same licence.

By submitting a pull request you confirm that the contribution is your own work and that you have the right to submit it.

Thank you for contributing!
