# Security

## Found something?

Please tell us privately, either through **Security → Report a vulnerability** on this repository or by email to chief@dimwit.me. Don't open a public issue.

## What Ebenezer keeps

Your financial rows, the holdings worked out from them, prices, news and settings, in your own Postgres. Nothing is sent to Dimwit Labs. The only outside calls are to the public price and news sources, to OpenRouter if you add a key, and to ntfy if you set an address.

## How it is protected

**Sign-in:** Passwords are hashed with bcrypt. Sessions are random tokens; the database stores only their SHA-256, so a copy of it cannot be used to sign in. Cookies are HttpOnly, SameSite=Lax, and `__Host-` prefixed when served over HTTPS.

**Forged requests:** Every request that changes something must carry an `X-Ebenezer-Request` header, which a page on another site cannot add without the browser asking Ebenezer first.

**Who sees what:** A portfolio is visible only to the people added to it. Every portfolio and section request checks membership.

**Your scripts:** Processing scripts run in a dedicated worker served with a content security policy of `connect-src 'none'`, so a script, yours or one in a template someone else saved, can reshape rows but cannot send them anywhere. You see the result before anything is saved.

**Statement PDFs:** They are read in your browser. The file and its password never reach the server; only the rows you approve do.

**The page itself:** A strict content security policy allows scripts only from Ebenezer's own origin.

## What it cannot protect you from

**Whoever runs the server:** They can read the database. Ebenezer is meant to be self-hosted for that reason.

**A wrong number:** Prices come from public files and rows from your imports. Ebenezer is a ledger, not an adviser; check before you act.
