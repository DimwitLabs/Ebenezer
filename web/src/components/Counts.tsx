import Tip from "../design-system/Tip";

export default function Counts({ counts, owed }: { counts: boolean; owed: boolean }) {
  const [icon, label] = !counts ? ["block", "Not counted in net worth"] : owed ? ["remove_circle", "Owed, so taken from net worth"] : ["add_circle", "Counted in net worth"];
  return (
    <Tip text={label} className="ms counts" focusable={false}>
      {icon}
    </Tip>
  );
}
