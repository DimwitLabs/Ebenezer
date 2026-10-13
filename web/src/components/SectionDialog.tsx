import { useState } from "react";

import { del, patch, post, type Field, type FieldType, type Section } from "../lib/api";
import { useSession } from "../lib/session";
import Dialog from "../design-system/Dialog";
import { DialogActions } from "../design-system/DialogActions";
import { Select, SwitchRow, TextField } from "../design-system/Fields";
import { IconPicker } from "../design-system/IconPicker";
import { Tile } from "../design-system/Tile";
import { useSnack } from "../design-system/Snack";
import { useConfirm } from "../design-system/Confirm";

const NOTE_HINT: Record<string, string> = {
  stocks: "Long-term picks. I rarely sell.",
  funds: "SIPs for retirement, untouched till 2045.",
  deposits: "Emergency money, never locked beyond a year.",
  savings: "Salary account and the joint household one.",
  bonds: "SGBs held to maturity for the tax-free gain.",
  crypto: "A small bet, never more than 5% of what I own.",
  gold: "Only the coins are savings; the jewellery stays in the family.",
  loans: "Home loan. Prepaying ₹1 L each March.",
  property: "The flat we live in. Not for sale.",
  insurance: "Term plan for me; health cover through work too.",
};

const ICONS = [
  "home",
  "apartment",
  "landscape",
  "directions_car",
  "two_wheeler",
  "diamond",
  "watch",
  "palette",
  "savings",
  "account_balance",
  "payments",
  "credit_card",
  "request_quote",
  "receipt_long",
  "real_estate_agent",
  "agriculture",
  "storefront",
  "business_center",
  "handshake",
  "school",
  "health_and_safety",
  "shield",
  "elderly",
  "child_care",
  "flight",
  "currency_bitcoin",
  "toll",
  "workspace_premium",
  "inventory_2",
  "forest",
  "solar_power",
  "redeem",
  "volunteer_activism",
  "pets",
  "music_note",
  "sports_esports",
  "local_shipping",
  "star",
];

const TYPE_LABEL: Record<FieldType, string> = { text: "Text", number: "Number", money: "Money", date: "Date", percent: "Percent", choice: "Choice" };

interface Props {
  portfolioId: string;
  section: Section | null;
  existing?: string[];
  onClose: () => void;
  onDone: (id?: string) => void;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1")
    .slice(0, 40);

export default function SectionDialog({ portfolioId, section, existing = [], onClose, onDone }: Props) {
  const [confirm, confirmDialog] = useConfirm();
  const { catalogue } = useSession();
  const say = useSnack();
  const editing = section !== null;
  const [kind, setKind] = useState(section?.kind ?? "");
  const [name, setName] = useState(section?.name ?? "");
  const [icon, setIcon] = useState(section?.icon ?? "star");
  const [description, setDescription] = useState(section?.description ?? "");
  const [counts, setCounts] = useState(section?.counts ?? true);
  const [valuation, setValuation] = useState(section?.valuation === "rate" || section?.valuation === "none" ? section.valuation : "manual");
  const [rate, setRate] = useState(section?.rate !== null && section?.rate !== undefined ? String(section.rate) : "8");
  const [fields, setFields] = useState<Field[]>(
    section?.kind === "custom"
      ? section.fields
      : [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "bought_on", label: "Bought on", type: "date" },
          { key: "cost", label: "Cost", type: "money" },
          { key: "value", label: "Value today", type: "money" },
        ],
  );
  const [valueField, setValueField] = useState(section?.valueField || "value");
  const [costField, setCostField] = useState(section?.costField || "cost");
  const [dateField, setDateField] = useState(section?.dateField || "bought_on");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const custom = kind === "custom";
  const saved = new Set(section?.fields.map((f) => f.key));
  const ofType = (...types: FieldType[]) => fields.filter((f) => f.label.trim() && types.includes(f.type));

  const pickKind = (k: string) => {
    setKind(k);
    const def = catalogue?.kinds.find((x) => x.key === k);
    if (def && k !== "custom") {
      setName(def.name);
      setIcon(def.icon);
    } else {
      setName("");
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { name, icon, description, counts };
    if (custom) {
      Object.assign(body, {
        valuation,
        rate: valuation === "rate" ? Number(rate) : null,
        fields: fields.filter((f) => f.label.trim()),
        valueField: valuation === "manual" ? valueField : "",
        costField: valuation === "none" ? "" : costField,
        dateField: valuation === "none" ? "" : dateField,
      });
    }
    try {
      if (editing) {
        await patch(`/sections/${section.id}`, body);
        say("Section saved");
        onDone();
      } else {
        const s = await post<Section>(`/portfolios/${portfolioId}/sections`, { ...body, kind });
        say(`${s.name} added`);
        onDone(s.id);
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!section || !(await confirm({ title: `Delete ${section.name}?`, message: `Its ${section.rows} rows go with it. This can't be undone.`, action: "Delete" }))) return;
    try {
      await del(`/sections/${section.id}`);
      say(`${section.name} deleted`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const fieldSelect = (label: string, value: string, set: (v: string) => void, options: Field[]) => (
    <Select value={value} onChange={set} label={label} options={options.map((f) => ({ value: f.key, label: f.label }))} />
  );

  return (
    <Dialog
      title={editing ? `Edit ${section.name}` : "New section"}
      icon={editing || kind ? icon : "add"}
      onClose={onClose}
      footer={
        <DialogActions
          remove={editing ? { label: "Delete section", onClick: () => void remove() } : undefined}
          onCancel={onClose}
          label={editing ? "Save" : "Add section"}
          onClick={() => void save()}
          disabled={busy || !kind || !name.trim()}
        />
      }
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!editing && !kind && (
        <div className="pick">
          {catalogue?.kinds.map((k) => {
            const taken = k.key !== "custom" && existing.includes(k.key);
            return <Tile key={k.key} icon={k.icon} title={k.name} hint={taken ? "Already added" : k.hint} disabled={taken} onClick={() => pickKind(k.key)} />;
          })}
        </div>
      )}
      {kind && (
        <div className="two">
          <div>
            <TextField label="Name" value={name} onChange={setName} maxLength={60} placeholder={custom ? "e.g. Real estate" : undefined} />
            <TextField
              type="textarea"
              rows={3}
              label="Notes for Ebenezer"
              value={description}
              onChange={setDescription}
              maxLength={2000}
              placeholder={`e.g. ${NOTE_HINT[kind] ?? "What it is and how you think about it."}`}
            />
            <SwitchRow checked={counts} onChange={setCounts} title="Count it in net worth" detail={counts ? "Included in totals and wealth XIRR." : "Tracked here but left out of totals."} />
            {custom && (
              <>
                <p className="label gap">How it is valued</p>
                {(
                  [
                    ["manual", "By your own figure", "You keep a value field up to date."],
                    ["rate", "Grows at a rate", "Cost compounds yearly from the date bought."],
                    ["none", "Not valued", "A list you keep, with no money attached."],
                  ] as const
                ).map(([v, title, detail]) => (
                  <label key={v} className="radio">
                    <md-radio name="valuation" value={v} checked={valuation === v} onChange={() => setValuation(v)} />
                    <span>
                      <b>{title}</b>
                      <span>{detail}</span>
                    </span>
                  </label>
                ))}
                <div className="fields2 gap">
                  {valuation === "manual" && fieldSelect("Value comes from", valueField, setValueField, ofType("money", "number"))}
                  {valuation !== "none" && fieldSelect("Cost comes from", costField, setCostField, ofType("money", "number"))}
                  {valuation !== "none" && fieldSelect("Bought on comes from", dateField, setDateField, ofType("date"))}
                  {valuation === "rate" && <TextField label="Rate a year, %" inputMode="decimal" value={rate} onChange={setRate} />}
                </div>
              </>
            )}
          </div>
          <div>
            <p className="label">Icon</p>
            <IconPicker icons={ICONS} value={icon} onChange={setIcon} />
            {custom && (
              <>
                <p className="label gap">Fields</p>
                {fields.map((f, i) => (
                  <div className="frow" key={i}>
                    <TextField
                      className="compact"
                      value={f.label}
                      placeholder="Label"
                      onChange={(v) => setFields((fs) => fs.map((x, j) => (j === i ? { ...x, label: v, key: saved.has(x.key) ? x.key : slug(v) } : x)))}
                      aria-label="Field label"
                    />
                    <Select
                      className="compact"
                      value={f.type}
                      onChange={(v) => setFields((fs) => fs.map((x, j) => (j === i ? { ...x, type: v as FieldType } : x)))}
                      aria-label="Field type"
                      options={(catalogue?.fieldTypes ?? []).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
                    />
                    <md-icon-button onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} aria-label="Remove field">
                      <md-icon>delete</md-icon>
                    </md-icon-button>
                  </div>
                ))}
                <md-text-button onClick={() => setFields((fs) => [...fs, { key: "", label: "", type: "text" }])}>
                  <md-icon slot="icon">add</md-icon>Add a field
                </md-text-button>
                {editing && <p className="help">Renaming a field keeps its data. Removing one hides it from the table but the rows keep their old values.</p>}
              </>
            )}
          </div>
        </div>
      )}
      {confirmDialog}
    </Dialog>
  );
}
