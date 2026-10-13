import type { ECharts, EChartsCoreOption } from "echarts/core";
import { useEffect, useRef } from "react";

export const SEG = ["--seg1", "--seg2", "--seg3", "--seg4", "--seg5", "--seg6", "--seg7"];

// Tokens hold light-dark() and var() chains, so a probe element resolves them to rgb().
export function token(name: string): string {
  const probe = document.createElement("i");
  probe.style.display = "none";
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c || "#888";
}

interface Props {
  option: () => EChartsCoreOption;
  deps: unknown[];
  height?: number;
}

// option is a function so colours are re-read whenever the theme flips.
export default function Chart({ option, deps, height = 280 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const build = useRef(option);
  build.current = option;

  // ECharts arrives in its own chunk on the first chart; the box holds its height meanwhile, so nothing shifts.
  useEffect(() => {
    let stop = () => {};
    let gone = false;
    import("./echarts").then(({ init }) => {
      if (gone || !el.current) return;
      const c = init(el.current, undefined, { renderer: "canvas" });
      chart.current = c;
      const draw = () => c.setOption(build.current(), true);
      draw();
      const resize = new ResizeObserver(() => c.resize());
      resize.observe(el.current);
      const scheme = window.matchMedia("(prefers-color-scheme: dark)");
      const theme = new MutationObserver(draw);
      theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
      scheme.addEventListener("change", draw);
      stop = () => {
        resize.disconnect();
        theme.disconnect();
        scheme.removeEventListener("change", draw);
        c.dispose();
        chart.current = null;
      };
    });
    return () => {
      gone = true;
      stop();
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(build.current(), true);
  }, deps);

  return <div ref={el} className="chart" style={{ height }} />;
}
