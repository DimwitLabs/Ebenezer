export interface Judge {
  staleAfterDays: number;
  reasonMaxWords: number;
  verdicts: Record<string, string>;
  extraRules: string[];
  routineFilings: string[];
}

export interface JudgeText {
  signal: string;
  humbug: string;
  rules: string;
  skip: string;
  staleDays: string;
  words: string;
}

type Override = Partial<Omit<Judge, "verdicts">> & { verdicts?: Record<string, string> };

export function merged(def: Judge, override: unknown): Judge {
  const o = (override && typeof override === "object" ? override : {}) as Override;
  return { ...def, ...o, verdicts: { ...def.verdicts, ...o.verdicts } };
}

export function toText(j: Judge): JudgeText {
  return {
    signal: j.verdicts.signal ?? "",
    humbug: j.verdicts.humbug ?? "",
    rules: j.extraRules.join("\n"),
    skip: j.routineFilings.join("\n"),
    staleDays: String(j.staleAfterDays),
    words: String(j.reasonMaxWords),
  };
}

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// Only differences from the default are stored, so an untouched portfolio picks up changes to the default.
export function toOverride(def: Judge, t: JudgeText): Override | null | string {
  const staleDays = Number(t.staleDays);
  const words = Number(t.words);
  if (!Number.isInteger(staleDays) || staleDays < 1) return "Old news needs a whole number of days, at least 1";
  if (!Number.isInteger(words) || words < 4) return "Reasons need at least 4 words";
  const o: Override = {};
  const verdicts: Record<string, string> = {};
  if (t.signal.trim() !== def.verdicts.signal) verdicts.signal = t.signal.trim();
  if (t.humbug.trim() !== def.verdicts.humbug) verdicts.humbug = t.humbug.trim();
  if (Object.keys(verdicts).length) o.verdicts = verdicts;
  if (!same(lines(t.rules), def.extraRules)) o.extraRules = lines(t.rules);
  if (!same(lines(t.skip), def.routineFilings)) o.routineFilings = lines(t.skip);
  if (staleDays !== def.staleAfterDays) o.staleAfterDays = staleDays;
  if (words !== def.reasonMaxWords) o.reasonMaxWords = words;
  return Object.keys(o).length ? o : null;
}
