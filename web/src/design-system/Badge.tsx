import type { CSSProperties, MouseEvent, ReactNode } from "react";

export function Badge({
  children,
  icon,
  tone,
  title,
  className,
  onClick,
  disabled,
  href,
  download,
}: {
  children: ReactNode;
  icon?: string;
  tone?: "ok" | "bad" | "new" | "on" | "warn";
  title?: string;
  className?: string;
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  href?: string;
  download?: boolean;
}) {
  const cls = `badge${tone ? ` ${tone}` : ""}${className ? ` ${className}` : ""}`;
  const body = (
    <>
      {icon && <span className="ms">{icon}</span>}
      {children}
    </>
  );
  if (href)
    return (
      <a className={cls} href={href} download={download} title={title} aria-label={title}>
        {body}
      </a>
    );
  if (onClick)
    return (
      <button type="button" className={cls} title={title} onClick={onClick} disabled={disabled}>
        {body}
      </button>
    );
  return (
    <span className={cls} title={title}>
      {body}
    </span>
  );
}

export function IconBadge({ icon, size = 40, tone, round, color }: { icon: string; size?: 28 | 32 | 36 | 40 | 44; tone?: "pc" | "primary" | "tertiary" | "note"; round?: boolean; color?: string }) {
  return (
    <span className={`ib ms s${size}${round ? " round" : ""}${tone ? ` ${tone}` : ""}${color ? " ink" : ""}`} style={color ? ({ background: color } as CSSProperties) : undefined} aria-hidden="true">
      {icon}
    </span>
  );
}
