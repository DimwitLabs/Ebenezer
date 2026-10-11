import { useId, useRef, useState, type ReactNode } from "react";

// In the top layer so a scrolling table or dialog cannot clip it; a tap toggles it on touch screens.
export default function Tip({ text, children, className, focusable = true }: { text: string; children: ReactNode; className?: string; focusable?: boolean }) {
  const id = useId();
  const at = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  const show = () => {
    const a = at.current?.getBoundingClientRect();
    const b = box.current;
    if (!a || !b) return;
    b.showPopover();
    const { width, height } = b.getBoundingClientRect();
    const above = a.top - height - 6;
    b.style.top = `${above >= 8 ? above : a.bottom + 6}px`;
    b.style.left = `${Math.min(Math.max(8, a.left + a.width / 2 - width / 2), innerWidth - width - 8)}px`;
    setOpen(true);
  };
  const hide = () => {
    if (box.current?.matches(":popover-open")) box.current.hidePopover();
    setOpen(false);
  };

  return (
    <span
      ref={at}
      className={`tip-at${className ? ` ${className}` : ""}`}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={id}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={(e) => (e.stopPropagation(), open ? hide() : show())}
    >
      {children}
      <span ref={box} id={id} role="tooltip" popover="manual" className="tipbox">
        {text}
      </span>
    </span>
  );
}
