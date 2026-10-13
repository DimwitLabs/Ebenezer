import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

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

// Fades in each card below the fold as it scrolls into view; cards already on screen when they arrive are left alone.
export function useReveal(root: RefObject<HTMLElement | null>, selector = ".card") {
  useEffect(() => {
    const box = root.current;
    if (!box) return;
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          el.dataset.reveal = "in";
          setTimeout(() => delete el.dataset.reveal, 700);
        }),
      { rootMargin: "0px 0px -24px 0px" },
    );
    const within = (nodes: Iterable<Node>) => {
      const cards: HTMLElement[] = [];
      for (const n of nodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.matches(selector)) cards.push(n);
        cards.push(...n.querySelectorAll<HTMLElement>(selector));
      }
      return cards;
    };
    const take = (cards: HTMLElement[]) => {
      if (still()) return;
      const fold = window.innerHeight;
      for (const el of cards) {
        if (el.dataset.reveal || el.parentElement?.closest(`${selector}, md-dialog, dialog, [role="dialog"]`)) continue;
        if (el.getBoundingClientRect().top < fold) continue;
        el.dataset.reveal = "wait";
        io.observe(el);
      }
    };
    take(within([box]));
    const mo = new MutationObserver((ms) => {
      within(ms.flatMap((m) => [...m.removedNodes])).forEach((el) => {
        io.unobserve(el);
        delete el.dataset.reveal;
      });
      take(within(ms.flatMap((m) => [...m.addedNodes])));
    });
    mo.observe(box, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
      box.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => delete el.dataset.reveal);
    };
  }, [root, selector]);
}
