"use client";
import { useRef, useState } from "react";

/** Read-only field with a copy button (used once to hand over an invitation link). */
export default function CopyField({ id, value, label, copyLabel, copiedLabel }: { id: string; value: string; label: string; copyLabel: string; copiedLabel: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  async function copy() {
    ref.current?.select();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      document.execCommand("copy");
      setCopied(true);
    }
  }
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="inline-form" style={{ display: "flex", width: "100%" }}>
        <input id={id} ref={ref} readOnly value={value} dir="ltr" onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, width: "auto" }} />
        <button type="button" className="btn btn-outline btn-small" onClick={copy}>{copied ? copiedLabel : copyLabel}</button>
      </div>
    </div>
  );
}
