// Takes the site's screenshots from the real app on sample data. Start the shots server first:
//   cd web && node_modules/.bin/vite --config vite.shots.config.ts
// then: node web/shots/capture.mjs [name ...]
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.SHOTS_URL ?? "http://localhost:5180";
const OUT = fileURLToPath(new URL("../../docs/static/img/shots/", import.meta.url));
// The landing page gives every shot its width and height, so the page does not jump as they load.
const SIZES = fileURLToPath(new URL("../../docs/src/components/Landing/sizes.json", import.meta.url));
const sizes = existsSync(SIZES) ? JSON.parse(readFileSync(SIZES, "utf8")) : {};
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const card = (text) => `[...document.querySelectorAll('.card')].filter(c => c.querySelector('h3, b')?.textContent.trim().startsWith(${JSON.stringify(text)})).slice(0, 1)`;

// pick returns the elements to crop to; the shot is the box around all of them.
const SHOTS = [
  { name: "today", path: "/p/family", width: 1180, pick: `[document.querySelector('.hero.s8'), document.querySelector('.notecard')]` },
  { name: "today-past", path: "/p/family", width: 1180, pre: `document.querySelector('.seg button').click(); await w(1200)`, pick: `[document.querySelector('.hero.s8')]` },
  { name: "today-future", path: "/p/family", width: 1180, pre: `[...document.querySelectorAll('.seg button')].at(-1).click(); await w(1200)`, pick: `[document.querySelector('.hero.s8')]` },
  { name: "today-phone", path: "/p/family", width: 390, pick: `[document.querySelector('.head'), document.querySelector('.hero.s8')]` },
  { name: "note", desk: false, path: "/p/family", width: 1180, pick: `[document.querySelector('.notecard')]` },
  { name: "against-index", path: "/p/family/portfolio", width: 1180, pick: card("Each section against") },
  { name: "money-sits", path: "/p/family/portfolio", width: 1180, pick: card("Where the money sits") },
  {
    name: "spend-chat",
    desk: false,
    path: "/p/family/expenses",
    width: 1180,
    pre: `const t = document.querySelector('.chatc textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, '₹450 on lunch'); t.dispatchEvent(new Event('input', { bubbles: true })); await w(200); t.form.requestSubmit(); await w(2500)`,
    pick: `[...document.querySelectorAll('.chatc .msgs > *')]`,
  },
  { name: "trends", desk: false, path: "/p/family/expenses", width: 1180, pick: `[document.querySelector('.card.trends')]` },
  { name: "cards", desk: false, path: "/p/family/expenses/cards", width: 1180, pick: `[...document.querySelectorAll('.cards > .card.cc')]` },
  { name: "news", desk: false, path: "/p/family/news", width: 1180, pick: `[document.querySelector('md-chip-set'), ...[...document.querySelectorAll('.newsday')].slice(0, 2)]` },
  { name: "ask", desk: false, path: "/p/family/ask", width: 1000, pre: `document.querySelector('.starters button').click(); await w(4500)`, pick: `[...document.querySelectorAll('.askc .msgs > *')]` },
];

// Wide shots shrink past reading on a phone, so they also get a phone-width capture of the app's own phone layout.
const OVERVIEW = `[...document.querySelectorAll('.ptabs button')].find((b) => b.textContent.trim() === 'Overview')?.click(); await w(1200)`;
const PHONE_PRE = { trends: OVERVIEW };
const PHONE = {
  "today-past": null,
  "today-future": null,
  "money-sits": null,
  "against-index": null,
  note: null,
  trends: null,
  cards: `[document.querySelector('.cards > .card.cc')]`,
  news: `[document.querySelector('md-chip-set'), document.querySelector('.newsday')]`,
  ask: null,
  "spend-chat": null,
};
for (const [name, pick] of Object.entries(PHONE)) {
  const s = SHOTS.find((x) => x.name === name);
  SHOTS.push({ ...s, desk: true, name: `${name}-phone`, width: 390, pick: pick ?? s.pick, pre: PHONE_PRE[name] ?? s.pre });
}

const only = process.argv.slice(2);
// Some screens only appear on the site at phone width, so their desktop capture is skipped.
const shots = (only.length ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS).filter((s) => s.desk !== false);

const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "ebenezer-shots-"))}`, "--hide-scrollbars", "about:blank"], {
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 1500));
const target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const waiting = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (waiting.has(d.id)) {
    waiting.get(d.id)(d);
    waiting.delete(d.id);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    waiting.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const run = async (js) => {
  const d = await send("Runtime.evaluate", { expression: `(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); ${js} })()`, awaitPromise: true, returnByValue: true });
  if (d.result?.exceptionDetails) throw new Error(d.result.exceptionDetails.exception?.description ?? "script failed");
  return d.result?.result?.value;
};

mkdirSync(OUT, { recursive: true });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const s of shots) {
  for (const theme of ["light", "dark"]) {
    await send("Emulation.setDeviceMetricsOverride", { width: s.width, height: 1000, deviceScaleFactor: 2, mobile: s.width < 600 });
    await send("Page.navigate", { url: `${BASE}/?embed=1&theme=${theme}&path=${encodeURIComponent(s.path)}` });
    await run(`for (let i = 0; i < 50 && !document.querySelector('.view > *'); i++) await w(100); await w(2500);`);
    if (s.pre) await run(s.pre);
    // Everything behind the picked cards goes see-through, so a shot sits on any background without the app's grey around it.
    await run(`for (const el of (${s.pick}).filter(Boolean)) for (let a = el.parentElement; a; a = a.parentElement) a.style.setProperty('background', 'transparent', 'important');`);
    const box = await run(`const els = (${s.pick}).filter(Boolean);
      if (!els.length) return null;
      const rs = els.map((e) => e.getBoundingClientRect());
      const pad = 12, x = Math.max(0, Math.min(...rs.map((r) => r.left)) - pad), y = Math.max(0, Math.min(...rs.map((r) => r.top)) + scrollY - pad);
      return { x, y, width: Math.max(...rs.map((r) => r.right)) + pad - x, height: Math.max(...rs.map((r) => r.bottom)) + scrollY + pad - y };`);
    if (!box) {
      console.error(`${s.name}: nothing matched`);
      continue;
    }
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...box, scale: 1 } });
    const png = join(OUT, `${s.name}-${theme}.png`);
    const data = Buffer.from(shot.result.data, "base64");
    writeFileSync(png, data);
    sizes[s.name] = [data.readUInt32BE(16), data.readUInt32BE(20)];
    if (spawnSync("cwebp", ["-quiet", "-q", "88", png, "-o", png.replace(/\.png$/, ".webp")]).status !== 0) throw new Error("cwebp failed; install it with brew install webp");
    rmSync(png);
    console.log(`${s.name}-${theme}.webp ${Math.round(box.width)}x${Math.round(box.height)}`);
  }
}
writeFileSync(SIZES, `${JSON.stringify(Object.fromEntries(Object.entries(sizes).sort()), null, 2)}\n`);
chrome.kill();
process.exit(0);
