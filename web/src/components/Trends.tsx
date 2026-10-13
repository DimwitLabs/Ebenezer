import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import type { Spend, SpendCategory } from "../lib/api";
import { money } from "../lib/format";
import { biggest, colorOf, iconOf, OFTEN, QUADRANT_MEANS, QUADRANT_NAME, shortDay, totals, trend, weeksBefore, type Point, type Quadrant } from "../lib/spends";
import Tip from "../design-system/Tip";
import { Badge, IconBadge } from "../design-system/Badge";
import { CardHead } from "../design-system/CardHead";
import { Segmented } from "../design-system/Segmented";

const RANGES: [string, number | null, string][] = [
  ["1M", 30, "One month"],
  ["3M", 91, "Three months"],
  ["6M", 182, "Six months"],
  ["1Y", 365, "One year"],
  ["all", null, "All time"],
];

const QUADRANTS: Quadrant[] = ["br", "bo", "sr", "so"];

interface Placed {
  p: Point;
  x: number;
  y: number;
  r: number;
  bare?: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lg = (v: number, lo: number, hi: number) => clamp((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)), 0, 1);

// A small bubble wears its name underneath, so its footprint is the circle plus that label.
const LABEL = 18;
const halfW = (b: Placed) => (b.r >= 40 ? b.r : Math.max(b.r, b.p.name.length * 3.4 + 4));
const below = (b: Placed) => (b.r >= 40 || b.bare ? 0 : LABEL);

// Each half is its own scale, so a bubble's place within its quadrant still says how often and how big.
// The corner headings wrap on a phone, so the room left for bubbles is measured from them, not assumed.
function place(points: Point[], big: number, maxTotal: number, box: DOMRect, cells: Record<Quadrant, DOMRect>, heads: Record<Quadrant, DOMRect>): Placed[] {
  const L = cells.br.left - box.left + 30;
  const T = Math.max(heads.br.bottom, heads.bo.bottom) - box.top + 8;
  const W = cells.so.right - cells.br.left - 60;
  const H = Math.min(heads.sr.top, heads.so.top) - box.top - 8 - T;
  const mx = cells.bo.left - box.left;
  const my = cells.sr.top - box.top;
  const unit = Math.min(W, H);
  const small = W < 400 ? 12 : 16;
  const lo = Math.max(1, big / 6);
  const out: Placed[] = points.map((p) => {
    const fx = p.n >= OFTEN ? 0.5 + 0.5 * lg(p.n, OFTEN, 30) : 0.5 * lg(p.n, 1, OFTEN);
    const fy = p.a > big ? 0.5 + 0.5 * lg(p.a, big, big * 10) : 0.5 * lg(Math.max(p.a, lo), lo, big);
    return { p, x: L + fx * W, y: T + (1 - fy) * H, r: Math.max(small, Math.sqrt(p.t / maxTotal) * unit * 0.13) };
  });
  const keep = (b: Placed) => {
    const left = b.p.q[1] === "r";
    const top = b.p.q[0] === "b";
    const half = halfW(b);
    b.x = left ? clamp(b.x, L - 18 + half, mx - 8 - half) : clamp(b.x, mx + 8 + half, L + W + 18 - half);
    b.y = top ? clamp(b.y, T + b.r, my - 8 - b.r - below(b)) : clamp(b.y, my + 8 + b.r, T + H - b.r - below(b));
  };
  // How far two footprints overlap on each axis, with a little air between them.
  const overlap = (a: Placed, b: Placed) => [halfW(a) + halfW(b) + 6 - Math.abs(b.x - a.x), Math.min(a.y + a.r + below(a), b.y + b.r + below(b)) - Math.max(a.y - a.r, b.y - b.r) + 6];
  // Bubbles that land on each other are eased apart, never out of their own quadrant.
  const settle = () => {
    out.forEach(keep);
    for (let it = 0; it < 160; it++) {
      for (let i = 0; i < out.length; i++)
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i];
          const b = out[j];
          if (a.p.q !== b.p.q) continue;
          const [ox, oy] = overlap(a, b);
          if (ox <= 0 || oy <= 0) continue;
          // Pushed along the line between them, so a bubble boxed in sideways can still slip past above or below.
          let dx = b.x - a.x;
          const dy = b.y - a.y || 1;
          if (Math.abs(dx) < 3) dx = (a.p.t < b.p.t ? -1 : 1) * 3;
          const d = Math.hypot(dx, dy);
          const m = Math.min(ox, oy) / 2 + 0.5;
          a.x -= (dx / d) * m;
          a.y -= (dy / d) * m;
          b.x += (dx / d) * m;
          b.y += (dy / d) * m;
        }
      out.forEach(keep);
    }
  };
  // A phone's quadrant has no room for names at all; tapping a bubble names it in the panel beside.
  if (W < 400) out.forEach((b) => (b.bare = b.r < 40));
  settle();
  // Where a quadrant is still too cramped for every name, the smaller spender drops its label and the rest settle again.
  let dropped = false;
  for (let i = 0; i < out.length; i++)
    for (let j = 0; j < out.length; j++) {
      const a = out[i];
      const b = out[j];
      const bigger = b.p.t > a.p.t || (b.p.t === a.p.t && j < i);
      if (i === j || !bigger || a.bare || a.r >= 40 || a.p.q !== b.p.q) continue;
      const [ox, oy] = overlap(a, b);
      if (ox > 6 && oy > 6) dropped = a.bare = true;
    }
  if (dropped) settle();
  return out;
}

function Change({ now, was }: { now: number; was: number }) {
  const d = now - was;
  if (Math.round(d) === 0) return null;
  return (
    <Badge tone={d > 0 ? "bad" : "ok"} icon={d > 0 ? "arrow_upward" : "arrow_downward"}>
      {money(Math.abs(d))}
    </Badge>
  );
}

export default function Trends({ spends, categories }: { spends: Spend[]; categories: SpendCategory[] }) {
  const [range, setRange] = useState("3M");
  const days = RANGES.find(([k]) => k === range)?.[1] ?? null;
  const t = useMemo(() => trend(spends, days), [spends, days]);
  const last = t.frames.length - 1;
  const [at, setAt] = useState(last);
  const [sel, setSel] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [size, setSize] = useState("");
  const grid = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => setAt(last), [last, t]);
  const w = Math.min(at, last);
  const frame = t.frames[w];

  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(`${el.clientWidth}x${el.clientHeight}`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = grid.current;
    if (!el || !frame) return;
    const rect = (q: Quadrant, sel = "") => el.querySelector(`[data-q="${q}"]${sel}`)!.getBoundingClientRect();
    const all = (sel = "") => Object.fromEntries(QUADRANTS.map((q) => [q, rect(q, sel)])) as Record<Quadrant, DOMRect>;
    setPlaced(place(frame.points, t.big, t.maxTotal, el.getBoundingClientRect(), all(), all(" .cell-h")));
  }, [frame, t, size]);

  useEffect(() => {
    if (!playing) return;
    if (w >= last) return setPlaying(false);
    const id = setTimeout(() => setAt(w + 1), 900);
    return () => clearTimeout(id);
  }, [playing, w, last]);

  if (spends.length === 0 || !frame) {
    return (
      <div className="card trends">
        <CardHead title="Trends" />
        <p className="help">Once you have a few weeks of spends, this shows which categories are habits and which are one-offs.</p>
      </div>
    );
  }

  const seek = (e: PointerEvent<HTMLDivElement>) => {
    const r = track.current!.getBoundingClientRect();
    setAt(Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * last));
  };
  const play = () => {
    if (playing) return setPlaying(false);
    if (w >= last) setAt(0);
    setPlaying(true);
  };

  const sum = (q: Quadrant) => frame.points.filter((p) => p.q === q).reduce((s, p) => s + p.t, 0);
  const prevEnd = weeksBefore(frame.end);
  const now = totals(spends, frame.end, sel);
  const was = totals(spends, prevEnd, sel);
  const point = sel ? frame.points.find((p) => p.name === sel) : undefined;
  const series = t.frames.map((f) => totals(spends, f.end, sel).t);
  const hi = Math.max(...series);
  const lo = Math.min(...series);
  const px = (i: number) => 4 + (i / Math.max(1, last)) * 292;
  const py = (v: number) => 50 - ((v - lo) / (hi - lo || 1)) * 44;
  const path = series.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(" ");
  const ticks = last > 0 ? [...new Set([0, Math.round(last / 3), Math.round((2 * last) / 3), last])] : [];

  return (
    <div className="card trends">
      <CardHead title="Trends">
        <Segmented
          label="Range"
          options={RANGES.map(([k, , name]) => [
            k,
            k === "all" ? (
              <span className="ms" aria-hidden="true">
                all_inclusive
              </span>
            ) : (
              k
            ),
            name,
          ])}
          value={range}
          onChange={(k) => (setRange(k), setSel(null))}
        />
      </CardHead>
      <p className="ch-sub">Your categories by how often and how much each time. Big is anything over your median spend for the range, {money(t.big)} now.</p>
      <div
        className="mx"
        ref={grid}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest(".bb, .focus")) setSel(null);
        }}
      >
        <span className="corner" />
        <div className="colh">
          <b>Rarely</b>
          <small>less than once a week</small>
        </div>
        <div className="colh r">
          <b>Often</b>
          <small>once a week or more</small>
        </div>
        <div className="rowh">
          <b>
            Big
            <Tip text={`${money(t.big)} is your median spend over this range: half your spends were bigger, half smaller. It moves with the range you pick.`} className="inf">
              <span className="ms" aria-hidden="true">
                info
              </span>
            </Tip>
          </b>
          <small>over {money(t.big)} a time</small>
        </div>
        <div className="rowh lo">
          <b>Small</b>
          <small>{money(t.big)} or less</small>
        </div>
        {QUADRANTS.map((q) => (
          <div key={q} className={`cell q-${q}`} data-q={q}>
            <div className="cell-h">
              <b>{QUADRANT_MEANS[q]}</b>
              <span>{sum(q) ? money(sum(q)) : ""}</span>
            </div>
          </div>
        ))}
        <div className="focus">
          <div className="fh">
            <IconBadge icon={sel ? iconOf(categories, sel) : "receipt_long"} color={sel ? colorOf(sel) : "var(--md-sys-color-primary)"} />
            <b>{sel ?? "Everything"}</b>
            <small>{point ? QUADRANT_NAME[point.q] : `${frame.points.length} categories`}</small>
            {sel && (
              <md-icon-button className="clr" onClick={() => setSel(null)} aria-label="Show everything" title="Show everything">
                <md-icon>close</md-icon>
              </md-icon-button>
            )}
          </div>
          <div className="fv">
            <strong>{money(now.t)}</strong>
            <Change now={now.t} was={was.t} />
          </div>
          <div className="fs">
            {now.n} {now.n === 1 ? "spend" : "spends"}
            {now.n > 0 && `, usually ${money(now.t / now.n)} each,`} in the four weeks to {shortDay(frame.end)}
          </div>
          {last > 0 && (
            <>
              <svg viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden="true">
                <path d={`${path} L${px(last)} 56 L4 56Z`} fill="currentColor" opacity=".12" />
                <path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <circle cx={px(w)} cy={py(series[w])} r="4" fill="currentColor" />
              </svg>
              <div className="sd">
                <span>{shortDay(t.frames[0].end)}</span>
                <span>{shortDay(t.frames[last].end)}</span>
              </div>
            </>
          )}
          <div className="fc">
            <b>Against the four weeks before</b>
            {(
              [
                ["Spends", was.n, now.n, String],
                ["Usually", was.n ? was.t / was.n : 0, now.n ? now.t / now.n : 0, money],
                ["In all", was.t, now.t, money],
              ] as [string, number, number, (v: number) => string][]
            ).map(([l, p, v, f]) => (
              <div key={l}>
                <span>{l}</span>
                <span>
                  {f(p)}{" "}
                  <span className="ms" aria-hidden="true">
                    arrow_forward
                  </span>{" "}
                  <b>{f(v)}</b>
                </span>
              </div>
            ))}
          </div>
          <div className="fb">
            <b>Biggest spends</b>
            {biggest(spends, frame.end, sel).map((s) => (
              <div key={s.id}>
                <span>{sel ? s.item : `${s.item} · ${s.category || "No category"}`}</span>
                <span>{money(s.amount)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bl">
          {placed.map(({ p, x, y, r, bare }) => (
            <button
              key={p.name}
              type="button"
              className={`bb${r >= 40 ? " lg" : ""}${bare ? " bare" : ""}${p.name === sel ? " on" : ""}`}
              style={{ width: r * 2, height: r * 2, transform: `translate(${x - r}px, ${y - r}px)`, ["--c" as string]: colorOf(p.name) }}
              title={`${p.name}: ${p.n} ${p.n === 1 ? "spend" : "spends"}, usually ${money(p.a)}, ${money(p.t)} in all`}
              onClick={() => setSel(p.name === sel ? null : p.name)}
            >
              <md-focus-ring />
              <span className="ms" aria-hidden="true">
                {iconOf(categories, p.name)}
              </span>
              <b>{p.name}</b>
              <i>{money(p.t)}</i>
            </button>
          ))}
        </div>
      </div>
      {last > 0 && (
        <div className="tl">
          <md-icon-button className="play" onClick={play} aria-label={playing ? "Pause" : "Play through the range"} title={playing ? "Pause" : "Play"}>
            <md-icon>{playing ? "pause" : "play_arrow"}</md-icon>
          </md-icon-button>
          <div
            className="track"
            ref={track}
            role="slider"
            tabIndex={0}
            aria-label="Four weeks ending"
            aria-valuemin={0}
            aria-valuemax={last}
            aria-valuenow={w}
            aria-valuetext={shortDay(frame.end)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setAt(Math.max(0, w - 1));
              if (e.key === "ArrowRight") setAt(Math.min(last, w + 1));
            }}
            onPointerDown={(e) => {
              setPlaying(false);
              e.currentTarget.setPointerCapture(e.pointerId);
              seek(e);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e);
            }}
          >
            <div className="rail2" />
            <div className="done" style={{ width: `${(w / last) * 100}%` }} />
            <div className="knob" style={{ left: `${(w / last) * 100}%` }} />
            {ticks.map((i) => (
              <span key={i} className="tick" style={{ left: `${(i / last) * 100}%` }}>
                {shortDay(t.frames[i].end)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
