import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Counts up from 0 on mount and whenever key changes, then returns null so the caller shows the exact figure.
export function useCount(target: number, key?: unknown, ms = 1100): number | null {
  const [n, setN] = useState<number | null>(() => (still() ? null : 0));
  const goal = useRef(target);
  useEffect(() => {
    goal.current = target;
  }, [target]);
  useLayoutEffect(() => {
    if (still()) return setN(null);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setN(k < 1 ? goal.current * (1 - (1 - k) ** 3) : null);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    setN(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, ms]);
  return n;
}
