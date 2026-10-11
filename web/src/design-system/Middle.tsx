const TAIL = 8;

// Long names are cut in the middle, the way macOS does, so both the start and the end stay readable.
export function Middle({ text }: { text: string }) {
  const cut = Math.max(0, text.length - TAIL);
  return (
    <span className="mid" title={text}>
      <span>{text.slice(0, cut)}</span>
      <span>{text.slice(cut)}</span>
    </span>
  );
}
