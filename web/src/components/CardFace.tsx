import type { ReactNode } from "react";

export const NETWORKS: [string, string][] = [
  ["visa", "Visa"],
  ["mastercard", "Mastercard"],
  ["amex", "American Express"],
  ["rupay", "RuPay"],
  ["diners", "Diners Club"],
  ["other", "Something else"],
];

export const COLOURS = ["#1d2b4f", "#6b1f2a", "#1f4d3a", "#3a3a3a", "#5a3d7a", "#8a6a1f", "metal"];

export function NetworkMark({ network, ink = "#fff" }: { network: string; ink?: string }) {
  switch (network) {
    case "visa":
      return (
        <svg viewBox="0 0 64 22" role="img" aria-label="Visa">
          <text x="0" y="19" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontStyle="italic" fontSize="22" letterSpacing="-.5" fill={ink}>
            VISA
          </text>
        </svg>
      );
    case "mastercard":
      return (
        <svg viewBox="0 0 46 28" role="img" aria-label="Mastercard">
          <circle cx="14" cy="14" r="14" fill="#eb001b" />
          <circle cx="32" cy="14" r="14" fill="#f79e1b" />
          <path d="M23 3.3a14 14 0 0 1 0 21.4a14 14 0 0 1 0-21.4z" fill="#ff5f00" />
        </svg>
      );
    case "amex":
      return (
        <svg viewBox="0 0 44 30" role="img" aria-label="American Express">
          <rect width="44" height="30" rx="4" fill="#016fd0" />
          <text x="22" y="13" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="7" letterSpacing=".2" fill="#fff">
            AMERICAN
          </text>
          <text x="22" y="23" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="7" letterSpacing=".2" fill="#fff">
            EXPRESS
          </text>
        </svg>
      );
    case "rupay":
      return (
        <svg viewBox="0 0 70 22" role="img" aria-label="RuPay">
          <text x="0" y="18" fontFamily="Arial, sans-serif" fontWeight="900" fontStyle="italic" fontSize="19" fill={ink}>
            RuPay
          </text>
          <path d="M60 3l9 8-9 8z" fill="#f47920" />
          <path d="M56 3l9 8-9 8z" fill="#097a44" opacity=".9" />
        </svg>
      );
    case "diners":
      return (
        <svg viewBox="0 0 30 30" role="img" aria-label="Diners Club">
          <circle cx="15" cy="15" r="14" fill="#fff" />
          <circle cx="15" cy="15" r="9" fill="none" stroke="#0079be" strokeWidth="3" />
          <path d="M15 6v18" stroke="#0079be" strokeWidth="3" />
        </svg>
      );
  }
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="Card">
      <path fill={ink} d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
    </svg>
  );
}

export const faceBackground = (color: string) =>
  color === "metal" ? "linear-gradient(135deg, #9aa0a8, #e9ebee 55%, #b9bec5)" : `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 72%, white))`;

export function CardFace({ color, bank, name, nickname, network, badge }: { color: string; bank: string; name: string; nickname: string; network: string; badge?: ReactNode }) {
  const light = color === "metal";
  return (
    <div className={`face${light ? " light" : ""}`} style={{ background: faceBackground(color) }}>
      {badge}
      <span className="iss">{bank || "Bank"}</span>
      <span className="nm">{name || "Card"}</span>
      <span className="chipg" />
      {nickname && (
        <span className="nick">
          <span className="ms" aria-hidden="true">
            sell
          </span>
          {nickname}
        </span>
      )}
      <span className="net">
        <NetworkMark network={network} ink={light ? "#1a1f71" : "#fff"} />
      </span>
    </div>
  );
}
