import { useState } from "react";

import type { InstanceView } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { useSession } from "../lib/session";
import { IconBadge } from "../design-system/Badge";
import Dialog from "../design-system/Dialog";
import { DialogActions } from "../design-system/DialogActions";
import { Item } from "../design-system/Item";
import { aiReady, mailReady, useAIForm, useMailForm, type Inst } from "./InstanceSetup";
import Progress from "../design-system/Progress";

function AIDialog({ inst, onClose }: { inst: Inst; onClose: () => void }) {
  const ai = useAIForm(inst);
  return (
    <Dialog
      title="Connect an AI model"
      icon="auto_awesome"
      onClose={onClose}
      footer={
        <DialogActions label="Save" disabled={!ai.ready} onClick={async () => (await ai.save()) && onClose()}>
          {ai.testButton}
        </DialogActions>
      }
    >
      <p className="help">I reach AI models through OpenRouter, so you choose the model and pay only for what I use.</p>
      {ai.form}
    </Dialog>
  );
}

function MailDialog({ inst, onClose }: { inst: Inst; onClose: () => void }) {
  const mail = useMailForm(inst);
  return (
    <Dialog
      title="Set up email"
      icon="alternate_email"
      onClose={onClose}
      footer={
        <DialogActions label="Save" disabled={!mail.ready} onClick={async () => (await mail.save()) && onClose()}>
          {mail.testButton}
        </DialogActions>
      }
    >
      <p className="help">I send your daily report and invites through a mail server you choose. Any SMTP service works, including your own mailbox's.</p>
      {mail.form}
      {mail.providers}
    </Dialog>
  );
}

export default function SetupList({ inst: given }: { inst?: Inst }) {
  const { user } = useSession();
  const own = useLoad<InstanceView>(!given && user?.isOwner ? "/settings" : null);
  const inst = given ?? own;
  const [open, setOpen] = useState<"ai" | "mail" | null>(null);
  if (!inst.data || (aiReady(inst.data) && mailReady(inst.data))) return null;

  const items = [
    { key: null, icon: "account_balance_wallet", title: "Your first portfolio", hint: "Done", done: true },
    { key: "ai" as const, icon: "auto_awesome", title: "Connect an AI model", hint: "So I can sort spends, write notes and answer questions", done: aiReady(inst.data) },
    { key: "mail" as const, icon: "alternate_email", title: "Set up email", hint: "So I can send your report and invites", done: mailReady(inst.data) },
  ];
  const done = items.filter((i) => i.done).length;

  return (
    <div className="card todo">
      <div className="todo-h">
        <IconBadge icon="checklist" size={44} tone="pc" />
        <div className="tt">
          <b>A couple of things left to set up</b>
          <span>
            {done} of {items.length} done · only you see this
          </span>
        </div>
        <Progress done={done} total={items.length} label={`${done} of ${items.length} done`} />
      </div>
      <div className="todo-l">
        {items.map((i) =>
          i.done ? (
            <Item key={i.title} className="ti done" icon="check" title={i.title} detail="Done" />
          ) : (
            <Item key={i.title} className="ti" icon={i.icon} title={i.title} detail={i.hint} chevron onClick={() => setOpen(i.key)} />
          ),
        )}
      </div>
      {open === "ai" && <AIDialog inst={inst} onClose={() => setOpen(null)} />}
      {open === "mail" && <MailDialog inst={inst} onClose={() => setOpen(null)} />}
    </div>
  );
}
