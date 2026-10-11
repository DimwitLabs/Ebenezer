import { useEffect, useRef, useState } from "react";

import { short } from "../lib/format";

export interface Block {
  key: string;
  label: string;
  value: number;
  count?: number;
}

interface Placed {
  b: Block;
  x: number;
  y: number;
  w: number;
  h: number;
}

const HEIGHT = 320;

// Squarified layout (Bruls et al.): strips along the shorter side, each growing only while its blocks get squarer.
function place(items: Block[], w: number, h: number): Placed[] {
  const out: Placed[] = [];
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total) return out;
  const scale = (w * h) / total;
  let x = 0;
  let y = 0;
  let rw = w;
  let rh = h;
  const worst = (row: Block[], side: number) => {
    const s = row.reduce((a, b) => a + b.value * scale, 0);
    let m = 0;
    for (const b of row) {
      const r = b.value * scale;
      m = Math.max(m, (side * side * r) / (s * s), (s * s) / (side * side * r));
    }
    return m;
  };
  const lay = (row: Block[]) => {
    const s = row.reduce((a, b) => a + b.value * scale, 0);
    if (rw >= rh) {
      const cw = s / rh;
      let cy = y;
      for (const b of row) {
        const bh = (b.value * scale) / cw;
        out.push({ b, x, y: cy, w: cw, h: bh });
        cy += bh;
      }
      x += cw;
      rw -= cw;
    } else {
      const ch = s / rw;
      let cx = x;
      for (const b of row) {
        const bw = (b.value * scale) / ch;
        out.push({ b, x: cx, y, w: bw, h: ch });
        cx += bw;
      }
      y += ch;
      rh -= ch;
    }
  };
  let row: Block[] = [];
  for (const b of items) {
    const side = Math.min(rw, rh);
    if (row.length === 0 || worst([...row, b], side) <= worst(row, side)) row.push(b);
    else {
      lay(row);
      row = [b];
    }
  }
  if (row.length) lay(row);
  return out;
}

export default function Treemap({ blocks, noun, selected, onToggle }: { blocks: Block[]; noun: [string, string]; selected: Set<string>; onToggle: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = blocks.filter((b) => b.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const placed = width ? place(items, width, HEIGHT) : [];

  return (
    <div className="tmap" ref={ref} style={{ height: HEIGHT }} role="group" aria-label="Where the money sits">
      {placed.map(({ b, x, y, w, h }, i) => {
        const share = (b.value / total) * 100;
        const pc = share < 1 ? "<1" : Math.round(share);
        const side = Math.min(w, h * 1.6);
        const big = Math.round(Math.max(13, Math.min(30, side / 7)));
        const name = Math.round(Math.max(11, Math.min(15, side / 14)));
        const roomy = w > 9 * name && h > big + name * 2 + 20;
        const fits = w > big * 2.6 && h > big + 16;
        const on = selected.has(b.key);
        const count = b.count === undefined ? "" : ` · ${b.count} ${b.count === 1 ? noun[0] : noun[1]}`;
        return (
          <button
            key={b.key}
            type="button"
            className={`tblock${on ? " on" : selected.size ? " dim" : ""}`}
            aria-pressed={on}
            title={`${b.label} · ${pc}% · ${short(b.value)}${count}`}
            onClick={() => onToggle(b.key)}
            style={{ left: x, top: y, width: w, height: h, ["--h" as string]: (i * 47 + 150) % 360, ["--big" as string]: `${big}px`, ["--name" as string]: `${name}px` }}
          >
            <md-focus-ring />
            {roomy && <b>{b.label}</b>}
            {(roomy || fits) && (
              <span>
                <em>{pc}%</em>
                {roomy && short(b.value)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
