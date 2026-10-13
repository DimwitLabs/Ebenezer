import { useEffect, useRef, type JSX, type KeyboardEvent } from "react";

import type { MdFilledTextField } from "@material/web/textfield/filled-text-field.js";

import Tip from "./Tip";

// Safari reports isComposing false on the Enter that picks an IME candidate, but still sends keyCode 229 for it.
export function composing(e: KeyboardEvent) {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}

type TextFieldProps = Omit<JSX.IntrinsicElements["md-filled-text-field"], "value" | "onChange" | "onInput" | "ref" | "supportingText"> & {
  value: string;
  onChange: (value: string) => void;
  info?: string;
};

export function Info({ text }: { text: string }) {
  return (
    <Tip text={text} className="info">
      <span className="ms" aria-label="More about this">
        info
      </span>
    </Tip>
  );
}

export function Label({ text, info }: { text: string; info?: string }) {
  return (
    <span className="flabel">
      {text}
      {info && <Info text={info} />}
    </span>
  );
}

function Hint({ text, error, count, max }: { text?: string; error?: boolean; count?: number; max?: number }) {
  const near = max !== undefined && count !== undefined && count >= max * 0.8;
  if (!text && !near) return null;
  return (
    <span className={`fhint${error ? " err" : ""}`}>
      <span>{text}</span>
      {near && <span className="fcount num">{`${count} / ${max}`}</span>}
    </span>
  );
}

// The field's own maxLength would draw a counter inside the focus ring, so the limit is kept here.
function clip(el: MdFilledTextField, max?: number): string {
  if (max !== undefined && el.value.length > max) el.value = el.value.slice(0, max);
  return el.value;
}

// The input lives in a shadow root, so the browser's Enter-to-submit never reaches the form; this restores it.
export function TextField({ value, onChange, onKeyDown, autoFocus, label, className, info, errorText, error, maxLength, ...rest }: TextFieldProps) {
  const ref = useRef<MdFilledTextField>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const enter = (e: KeyboardEvent<MdFilledTextField>) => {
    onKeyDown?.(e);
    if (e.key !== "Enter" || e.defaultPrevented || composing(e) || rest.type === "textarea") return;
    const form = e.currentTarget.form;
    if (form) {
      e.preventDefault();
      form.requestSubmit();
    }
  };
  return (
    <div className={`fld${className ? ` ${className}` : ""}`}>
      {label && <Label text={label} info={info} />}
      <md-filled-text-field aria-label={label} {...rest} error={error} ref={ref} value={value} onInput={(e) => onChange(clip(e.currentTarget, maxLength))} onKeyDown={enter} />
      <Hint text={error ? errorText : undefined} error={error && !!errorText} count={value.length} max={maxLength} />
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
  supporting?: string;
  disabled?: boolean;
}

interface SelectProps {
  label?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  info?: string;
  "aria-label"?: string;
}

// The menu opens in the top layer (popover), so dialogs and scrolling tables never clip it.
export function Select({ label, value, options, onChange, disabled, className, info, "aria-label": ariaLabel }: SelectProps) {
  return (
    <div className={`fld${className ? ` ${className}` : ""}`}>
      {label && <Label text={label} info={info} />}
      <md-filled-select aria-label={ariaLabel ?? label} value={value} disabled={disabled} menuPositioning="popover" onChange={(e) => onChange(e.currentTarget.value)}>
        {options.map((o) => (
          <md-select-option key={o.value} value={o.value} selected={o.value === value} disabled={o.disabled}>
            <div slot="headline">{o.label}</div>
            {o.supporting && <div slot="supporting-text">{o.supporting}</div>}
          </md-select-option>
        ))}
      </md-filled-select>
    </div>
  );
}

interface SwitchRowProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  detail?: string;
  disabled?: boolean;
}

export function SwitchRow({ checked, onChange, title, detail, disabled }: SwitchRowProps) {
  return (
    <label className="switch">
      <md-ripple disabled={disabled} />
      <span className="t">
        <b>{title}</b>
        {detail && <span className="s">{detail}</span>}
      </span>
      <md-switch selected={checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.selected)} />
    </label>
  );
}
