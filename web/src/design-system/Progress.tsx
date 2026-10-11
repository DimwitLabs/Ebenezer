export default function Progress({ done, total, label, className }: { done: number; total: number; label: string; className?: string }) {
  const share = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  return (
    <div className={`prog${className ? ` ${className}` : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <span className="on" style={{ flexBasis: `${share * 100}%` }} />
      <span className="off" />
    </div>
  );
}
