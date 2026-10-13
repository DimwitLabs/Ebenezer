import { useEffect, useState } from "react";

import "../../css/landing.css";

// Screenshots with a phone-width capture of the app's own phone layout.
const PHONE = new Set(["today-past", "today-future", "money-sits", "against-index"]);

// Both themes are in the page and CSS shows the one matching the site's toggle; a hidden lazy image is never fetched.
export function Pic({ name, alt, phone = PHONE.has(name) }: { name: string; alt: string; phone?: boolean }) {
  return (
    <>
      {(["light", "dark"] as const).map((t) => (
        <picture key={t} className={`only-${t}`}>
          {phone && <source srcSet={`/img/shots/${name}-phone-${t}.webp`} media="(max-width: 600px)" />}
          <img src={`/img/shots/${name}-${t}.webp`} alt={alt} loading="lazy" />
        </picture>
      ))}
    </>
  );
}

// The hero is the page's largest paint, so it is one picture fetched first; it follows the system theme, which the site's toggle matches unless set by hand.
export function Hero({ alt }: { alt: string }) {
  const shot = (name: string) => `/img/shots/${name}.webp`;
  return (
    <picture>
      <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcSet={shot("today-phone-dark")} width={764} height={902} />
      <source media="(max-width: 600px)" srcSet={shot("today-phone-light")} width={764} height={902} />
      <source media="(prefers-color-scheme: dark)" srcSet={shot("today-dark")} width={2296} height={768} />
      <img src={shot("today-light")} alt={alt} width={2296} height={768} fetchPriority="high" />
    </picture>
  );
}

const EYES = { past: [8, 12.8], present: [9.6, 14.4], future: [11.2, 16] } as const;

export function Ghost({ when }: { when: keyof typeof EYES }) {
  const [a, b] = EYES[when];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M5 19.5V11a7 7 0 0 1 14 0v8.5a2.33 2.33 0 0 1-4.67 0 2.33 2.33 0 0 1-4.66 0A2.33 2.33 0 0 1 5 19.5Z" />
      <ellipse cx={a} cy="11" rx="1.2" ry="1.7" fill="currentColor" stroke="none" />
      <ellipse cx={b} cy="11" rx="1.2" ry="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Icon({ name }: { name: string }) {
  return (
    <span className="ms" aria-hidden="true">
      {name}
    </span>
  );
}

export function Copy({ text }: { text: string }) {
  const [said, setSaid] = useState("");
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => setSaid("Copied"),
      () => setSaid("Could not copy. Select the command instead."),
    );
  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(""), 2000);
    return () => clearTimeout(t);
  }, [said]);
  return (
    <div className="cmd">
      <code>{text}</code>
      <button type="button" aria-label={`Copy ${text}`} onClick={copy}>
        <Icon name={said === "Copied" ? "check" : "content_copy"} />
      </button>
      <span className="sr-only" role="status">
        {said}
      </span>
    </div>
  );
}
