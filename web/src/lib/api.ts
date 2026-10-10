export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "",
  ) {
    super(message);
  }
}

export const isNoAI = (e: unknown) => e instanceof ApiError && e.code === "no_ai";

let unauthorized = () => {};

export function onUnauthorized(fn: () => void) {
  unauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "X-Ebenezer-Request": "1" };
  let payload: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: payload,
    credentials: "same-origin",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && path !== "/login" && path !== "/status") unauthorized();
  if (!res.ok) throw new ApiError(res.status, String(json.error ?? res.statusText), String(json.code ?? ""));
  return json as T;
}

export const get = <T>(path: string) => request<T>("GET", path);
export const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {});
export const put = <T>(path: string, body: unknown) => request<T>("PUT", path, body);
export const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
export const del = <T>(path: string) => request<T>("DELETE", path);

export async function reportPreview(pid: string): Promise<{ subject: string; html: string }> {
  const res = await fetch(`/api/portfolios/${pid}/report`, {
    headers: { "X-Ebenezer-Request": "1" },
    credentials: "same-origin",
  });
  if (res.status === 401) unauthorized();
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(res.status, String(json.error ?? res.statusText), String(json.code ?? ""));
  }
  return {
    subject: decodeURIComponent((res.headers.get("X-Report-Subject") ?? "").replace(/\+/g, " ")),
    html: await res.text(),
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
  mustChangePassword: boolean;
}

export interface Status {
  needsSetup: boolean;
  user: User | null;
  timeZone: string;
}

export type FieldType = "text" | "number" | "money" | "date" | "percent" | "choice";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  choices?: string[];
  example?: string;
}

export interface Kind {
  key: string;
  name: string;
  icon: string;
  hint: string;
  valuation: string;
  holdings: boolean;
  valueField?: string;
  costField?: string;
  dateField?: string;
  template?: string;
  fields: Field[];
}

export interface Catalogue {
  kinds: Kind[];
  fieldTypes: FieldType[];
  customValuations: string[];
  expenseFields: Field[];
  cardFields: Field[];
}

export interface NewsSettings {
  enabled: boolean;
  times: string[];
  windowDays: number;
  perScrip: number;
  aiJudge: boolean;
  judge?: unknown;
}

export type Personality = "accountant" | "coach" | "plain" | "custom";
export type Tone = "dry" | "warm" | "blunt" | "playful";

export interface Voice {
  personality: Personality;
  custom: string;
  tone: Tone;
  instructions: string;
  // model is this portfolio's own OpenRouter model; empty uses the instance's.
  model?: string;
}

export interface ReportSettings {
  enabled: boolean;
  time: string;
  days: string[];
  to: string[];
  sections: string[];
}

export interface PortfolioSettings {
  benchmark: string;
  inflation: number;
  xirrMinDays: number;
  morningCount: string;
  news: NewsSettings;
  voice: Voice;
  report: ReportSettings;
  moves: Record<string, string>;
  palette?: Record<string, string>;
}

export interface Portfolio {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  people: string[] | null;
  currency: string;
  fyStart: number;
  settings: PortfolioSettings;
}

export interface Section {
  id: string;
  portfolioId: string;
  kind: string;
  name: string;
  icon: string;
  description: string;
  valuation: string;
  rate: number | null;
  valueField: string;
  costField: string;
  dateField: string;
  fields: Field[];
  counts: boolean;
  position: number;
  rows: number;
  holdings: number;
  lastImport: string | null;
}

export type RowData = Record<string, string | number | boolean>;

export interface Row {
  id: string;
  data: RowData;
  createdAt: string;
}

export interface Holding {
  key: string;
  isin: string;
  symbol: string;
  name: string;
  quantity: number;
  cost: number;
  realised: number;
  firstDate: string | null;
}

export interface Position {
  key: string;
  name: string;
  isin?: string;
  quantity?: number;
  price: number | null;
  value: number;
  invested: number;
  xirr: number | null;
  days: number;
  group?: string;
  stale?: boolean;
  bullion?: boolean;
  from?: string;
  costUnknown?: boolean;
}

export interface SectionResult {
  sectionId: string;
  value: number;
  invested: number;
  positions: Position[];
  unpriced: number;
  unknown?: number;
  returns: Returns;
}

export const NO_RETURNS: Returns = {
  xirr: null,
  benchmark: null,
  inflation: 0,
  days: 0,
  eligible: false,
};

export interface Returns {
  xirr: number | null;
  benchmark: number | null;
  inflation: number;
  days: number;
  eligible: boolean;
}

export interface NoteLine {
  icon: string;
  text: string;
  section?: string;
}

export interface Note {
  lead: string;
  sees?: string;
  lines: NoteLine[];
  signoff: string;
}

export interface Protection {
  policies: number;
  life: number;
  lifeN: number;
  health: number;
  healthN: number;
  premiums: number;
  next: { policy: string; day: string; premium: number } | null;
}

export interface Summary {
  protection: Protection | null;
  unknown: number;
  netWorth: number;
  assets: number;
  liabilities: number;
  invested: number;
  wealth: Returns;
  stocks: Returns;
  sections: SectionResult[];
  sectionList: Section[];
  pricedOn: string | null;
  benchmark: string;
  cardsOwed: number;
  note: Note;
  tabNotes: Record<string, { lines: NoteLine[]; quiet?: string; sees?: string }>;
  notesPending: boolean;
}

export interface Snapshot {
  day: string;
  netWorth: number;
  invested: number;
}

export interface Import {
  id: string;
  sectionId: string;
  sectionName: string;
  source: string;
  added: number;
  skipped: number;
  replaced?: number;
  createdAt: string;
}

export interface Template {
  id: string;
  kind: string;
  name: string;
  payload: TemplatePayload;
}

export interface TemplatePayload {
  mapping: Record<string, string>;
  processed: boolean;
  script?: string;
  summary?: string;
}

export interface NewsItem {
  id: number;
  link: string;
  title: string;
  source: string;
  snippet: string;
  publishedAt: string | null;
  scrips: string[];
  about: string[];
  verdict: string;
  category: string;
  reason: string;
  also: number;
}

export interface ScripView {
  security: Security | null;
  history: { day: string; close: number }[];
  holding: Holding;
  news: NewsItem[];
  trades: Trade[];
}

export interface Trade {
  date: string;
  action: string;
  quantity: number;
  amount: number;
  sell: boolean;
  opening: boolean;
}

export interface JobRun {
  id: number;
  job: string;
  portfolioId: string | null;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  message: string;
  facts: Fact[];
}

export interface Fact {
  label: string;
  value: string;
}

export interface Job {
  name: string;
  label: string;
  description: string;
  portfolio: boolean;
  running: boolean;
  progress?: { text: string; done: number; total: number };
  lastRun: JobRun | null;
  next: string;
}

export interface Schedule {
  name: string;
  label: string;
  portfolio: boolean;
  steps: { job: string; label: string }[];
  running: boolean;
  next: string;
  nextAt: string | null;
}

export interface InstanceSettings {
  pricesTime: string;
  goldPerGram: number;
  silverPerGram: number;
  openRouterModel: string;
  healthTime: string;
  ntfyUrl: string;
  ntfyUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "starttls" | "tls" | "none";
  smtpUser: string;
  smtpFrom: string;
}

export type SecretName = "openrouter_key" | "ntfy_token" | "ntfy_password" | "smtp_password";

export interface SecretState {
  set: boolean;
  fromEnv: boolean;
}

export interface Metals {
  goldPerGram: number;
  silverPerGram: number;
  source: string;
  at: string;
}

export interface InstanceView {
  settings: InstanceSettings;
  metals: Metals;
  secrets: Record<SecretName, SecretState>;
  canEdit: boolean;
}

export interface Model {
  id: string;
  name: string;
  context: number;
  prompt: number;
  completion: number;
}

export interface TestResult {
  ok: boolean;
  detail: string;
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  failures: number;
  at: string;
}

export interface Security {
  isin: string;
  symbol: string;
  bseCode: string;
  name: string;
  kind: string;
  category: string;
}

export interface HeldOn {
  sectionId: string;
  kind: string;
  key: string;
  isin: string;
  name: string;
  quantity: number;
  cost: number;
}

export interface Ledger {
  ledger: string;
  defaultInstructions: string;
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
  // redacted marks an answer the OpenRouter account redacted words from before the model saw them.
  redacted?: boolean;
}

// to is a section id, a kind key such as "gold" (made if missing), or "" to move it back.
export const moveHolding = (pid: string, isin: string, to: string) => put<Portfolio>(`/portfolios/${pid}/moves`, { isin, to });

export const ask = (pid: string, question: string, history: Turn[]) => post<{ answer: string; redacted: boolean }>(`/portfolios/${pid}/ask`, { question, history });

export interface Spend {
  id: string;
  day: string;
  item: string;
  amount: number;
  category: string;
  paidWith: string;
  asking: boolean;
  note: string;
  importId?: string;
}

export interface SpendCategory {
  name: string;
  icon: string;
}

export interface Method {
  key: string;
  name: string;
  kind: "card" | "account" | "cash";
  also?: string;
}

export interface Account {
  key: string;
  name: string;
  set: number;
  asOf: string | null;
  spent: number;
  balance: number;
}

export type CardKind = "credit" | "charge";

export interface Card {
  id: string;
  kind: CardKind;
  bank: string;
  name: string;
  nickname: string;
  network: string;
  color: string;
  limit: number | null;
  statementDay: number;
  dueDays: number;
  interest: number | null;
  annualFee: number | null;
  statementOn: string;
  statementBalance: number;
  paid: number;
  spentBefore: number;
}

export interface CardState extends Card {
  lastStatement: string;
  nextStatement: string;
  due: string;
  billed: number;
  paidOff: number;
  cycle: number;
  owed: number;
  unpaid: number;
  peak: number;
  spends: number;
}

export interface SpendImport {
  id: string;
  source: string;
  added: number;
  skipped: number;
  createdAt: string;
}

export interface ExpenseOverview {
  month: string;
  lastMonth: string;
  total: number;
  count: number;
  through: string | null;
  lastSoFar: number;
  usual: number;
  billsToCome: number;
  bills: string[];
  onCards: number;
}

export interface Expenses {
  spends: Spend[];
  categories: SpendCategory[];
  methods: Method[];
  cards: CardState[];
  accounts: Account[];
  overview: ExpenseOverview;
  note: Note;
  cardNote: Note;
  imports: SpendImport[];
  icons: string[];
}

export interface ChatResult {
  reply: string;
  saved: Spend[];
  effects: string[];
  asking: string[];
  newCategories: string[];
  offerTidy: boolean;
  expenses: Expenses;
}

export interface PaidResult {
  saved: string;
  effects: string[];
  expenses: Expenses;
}

export interface TidyChange {
  kind: "join" | "rename" | "move";
  from: string;
  to: string;
  item?: string;
  count: number;
  ids?: string[];
}

export interface TidyProposal {
  summary: string;
  changes: TidyChange[];
}

export interface CardTerms {
  found: boolean;
  interest: number | null;
  annualFee: number | null;
  dueDays: number | null;
  lateFee: string;
  source: string;
}

export interface ExportFile {
  name: string;
  rows: number;
  size: number;
}

export interface ExportPortfolio {
  id: string;
  name: string;
  icon: string;
  color: string;
  slug: string;
  files: ExportFile[];
}
