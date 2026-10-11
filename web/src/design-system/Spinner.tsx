const WAVE = (() => {
  const r = 17,
    amp = 1.3,
    waves = 9,
    pts: string[] = [];
  for (let i = 0; i <= 360; i += 3) {
    const t = (i * Math.PI) / 180;
    const d = r + amp * Math.sin(waves * t);
    pts.push(`${(24 + d * Math.cos(t)).toFixed(2)} ${(24 + d * Math.sin(t)).toFixed(2)}`);
  }
  return `M${pts.join("L")}`;
})();

export default function Spinner({ size = 48, label = "Loading", className, slot }: { size?: number; label?: string; className?: string; slot?: string }) {
  return (
    <span className={`spinner${className ? ` ${className}` : ""}`} slot={slot} role="progressbar" aria-label={label} style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d={WAVE} pathLength={100} />
      </svg>
    </span>
  );
}

export function Wait({ text }: { text?: string }) {
  return (
    <div className="wait">
      <Spinner label={text} />
      {text && <span className="help">{text}</span>}
    </div>
  );
}
