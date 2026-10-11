import { useState } from "react";
import { useLocation } from "react-router-dom";

import Dialog from "../design-system/Dialog";
import { SwitchRow, TextField } from "../design-system/Fields";

const ISSUES = "https://github.com/Dimwit/Ebenezer/issues/new";
const MAILBOX = "chief@dimwit.me";

const PAGES: [RegExp, string][] = [
  [/\/expenses\/cards$/, "Credit Cards"],
  [/\/expenses$/, "Expenses"],
  [/\/portfolio$/, "Portfolio"],
  [/\/news$/, "News"],
  [/\/ask$/, "Ask"],
  [/\/data$/, "Data"],
  [/\/settings$/, "Settings"],
  [/^\/admin\/export$/, "Export"],
  [/^\/admin$/, "Account"],
  [/^\/health$/, "Health"],
  [/^\/p\/[^/]+\/?$/, "Today"],
];

function browser(): string {
  const ua = navigator.userAgent;
  const name = ua.match(/(Edg|Firefox|Chrome|Version)\/(\d+)/);
  const label = !name ? "A browser" : name[1] === "Edg" ? `Edge ${name[2]}` : name[1] === "Version" ? `Safari ${name[2]}` : `${name[1]} ${name[2]}`;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${label} on ${os}` : label;
}

export default function BugDialog({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation();
  const [what, setWhat] = useState("");
  const [details, setDetails] = useState(true);
  const page = PAGES.find(([re]) => re.test(pathname))?.[1] ?? "Ebenezer";
  const facts = `Version ${__VERSION__}, the ${page} page, ${browser()}.`;
  const body = details ? `${what.trim()}\n\n---\n${facts}` : what.trim();
  const title = what.trim().split("\n")[0].slice(0, 80);
  const off = !what.trim();
  const way = (href: string) => ({ className: `way${off ? " off" : ""}`, href: off ? undefined : href, "aria-disabled": off || undefined, tabIndex: off ? -1 : undefined, onClick: onClose });

  return (
    <Dialog title="Report a bug" icon="bug_report" narrow onClose={onClose}>
      <TextField type="textarea" rows={5} label="What happened?" value={what} onChange={setWhat} placeholder="What you did, what you expected, and what you got instead" autoFocus />
      <SwitchRow checked={details} onChange={setDetails} title="Add details about this Ebenezer" detail={`${facts} No names, amounts or holdings.`} />
      <div className="ways">
        <a {...way(`${ISSUES}?${new URLSearchParams({ title, body })}`)} target="_blank" rel="noreferrer">
          <md-ripple />
          <md-focus-ring />
          <span className="ms">code</span>
          <b>Open a GitHub issue</b>
          <span className="ms">open_in_new</span>
        </a>
        <a {...way(`mailto:${MAILBOX}?subject=${encodeURIComponent(`Ebenezer: ${title}`)}&body=${encodeURIComponent(body)}`)}>
          <md-ripple />
          <md-focus-ring />
          <span className="ms">mail</span>
          <b>Email it</b>
          <span className="ms">open_in_new</span>
        </a>
      </div>
    </Dialog>
  );
}
