import { money, short, signed } from "../lib/format";
import Tip from "./Tip";

export default function Amount({ n, sign = false }: { n: number; sign?: boolean }) {
  const text = sign ? signed(n) : short(n);
  const full = (sign && n > 0 ? "+" : "") + money(n);
  if (text === full) return <span>{text}</span>;
  return <Tip text={full}>{text}</Tip>;
}
