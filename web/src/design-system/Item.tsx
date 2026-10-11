import type { ReactNode } from "react";

interface Props {
  icon: string;
  title: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
  tone?: "on" | "bad" | "idle";
  className?: string;
  chevron?: boolean;
  onClick?: () => void;
}

export function Item({ icon, title, detail, children, tone, className, chevron, onClick }: Props) {
  const cls = `item${className ? ` ${className}` : ""}`;
  const body = (
    <>
      <span className={`item-i ms${tone ? ` ${tone}` : ""}`} aria-hidden="true">
        {icon}
      </span>
      <div className="item-t">
        <b>{title}</b>
        {detail && <span>{detail}</span>}
      </div>
      {children && <div className="item-a">{children}</div>}
      {chevron && (
        <span className="item-go ms" aria-hidden="true">
          chevron_right
        </span>
      )}
    </>
  );
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" className={cls} onClick={onClick}>
      <md-ripple />
      <md-focus-ring />
      {body}
    </button>
  );
}
