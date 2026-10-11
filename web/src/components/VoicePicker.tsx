import type { Personality, Tone, Voice } from "../lib/api";
import { TextField } from "../design-system/Fields";
import { ToggleChips } from "../design-system/Chips";
import { Group } from "../design-system/Group";
import { Tile } from "../design-system/Tile";

const PERSONALITIES: [Personality, string, string, string][] = [
  ["accountant", "calculate", "Sceptical accountant", "Questions every number"],
  ["coach", "self_improvement", "Patient coach", "Keeps the long run in view"],
  ["plain", "table_rows", "Plain ledger", "Figures only, no opinions"],
  ["custom", "edit_note", "Your own", "Describe the voice yourself"],
];

const TONES: [Tone, string][] = [
  ["dry", "Dry"],
  ["warm", "Warm"],
  ["blunt", "Blunt"],
  ["playful", "Playful"],
];

const PLAIN = "Funds: 11.4% this year. Nifty 50: 13.5%.";

// One made-up fact said every way, so the choice is heard rather than described.
const SAMPLES: Record<Exclude<Personality, "custom">, Record<Tone, string>> = {
  accountant: {
    dry: "Your funds made 11.4% this year against the Nifty's 13.5%. You're paying fees to trail an index.",
    warm: "Your funds made a decent 11.4% this year, though the Nifty did 13.5%. Worth a look at what the fees buy you.",
    blunt: "Your funds lost to the Nifty by 2.1 points. You're paying for that.",
    playful: "Your funds ran 11.4% this year. The Nifty ran 13.5% and charged nothing for the privilege.",
  },
  coach: {
    dry: "Funds 11.4%, Nifty 13.5% this year. One year is short; watch the next few.",
    warm: "11.4% is a good year, even if the Nifty did a little better. Stay the course and look again next year.",
    blunt: "You're 2.1 points behind the Nifty. Not a crisis; keep going and check again next year.",
    playful: "The Nifty pipped your funds this year, 13.5% to 11.4%. It's a marathon, not a sprint.",
  },
  plain: { dry: PLAIN, warm: PLAIN, blunt: PLAIN, playful: PLAIN },
};

type Picked = Pick<Voice, "personality" | "custom" | "tone">;

export default function VoicePicker({ value, onChange }: { value: Picked; onChange: (v: Picked) => void }) {
  const sample = value.personality === "custom" ? `I'll take on the voice you describe, in a ${value.tone} tone.` : SAMPLES[value.personality][value.tone];
  return (
    <>
      <div className="pick voices" role="radiogroup" aria-label="Personality">
        {PERSONALITIES.map(([key, icon, title, hint]) => (
          <Tile key={key} icon={icon} title={title} hint={hint} pressed={value.personality === key} onClick={() => onChange({ ...value, personality: key })} />
        ))}
      </div>
      {value.personality === "custom" && (
        <TextField
          type="textarea"
          rows={3}
          label="The voice you want"
          value={value.custom}
          onChange={(custom) => onChange({ ...value, custom })}
          maxLength={600}
          placeholder="e.g. A retired bank manager from Pune who has seen three crashes and trusts none of the fund houses."
        />
      )}
      <Group label="Tone">
        <ToggleChips label="Tone" radio options={TONES} on={(k) => value.tone === k} onPick={(tone) => onChange({ ...value, tone })} />
      </Group>
      <div className="voiceprev">
        <span className="h">
          <img src="/favicon.svg" alt="" />
          How I'd put it
        </span>
        <p>{sample}</p>
        <span className="s">An example line. My notes will be about your own money.</span>
      </div>
    </>
  );
}
