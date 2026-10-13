# Ebenezer Docs

The documentation site, built with Docusaurus and drawn in the app's own colours.

```bash
npm install
npm start
```

`npm run build` writes a static site to `build/`, and `npm run serve` serves it.

The colours come from `web/src/lib/theme.ts` and the tokens from `web/src/design-system/tokens.css`, so run `npm install` in `web/` too. The version pill reads `web/package.json`, so the number follows the app without being written down twice.
