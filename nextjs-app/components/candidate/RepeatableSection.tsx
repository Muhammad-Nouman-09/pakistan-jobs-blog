"use client";
import { useId, useRef, useState } from "react";

export interface FieldConfig {
  key: string;
  label: string;
  type?: "text" | "month" | "year" | "url" | "textarea" | "select";
  maxLength?: number;
  required?: boolean;
  options?: { value: string; label: string }[];   // for select (include a blank option first if the field is optional)
  placeholder?: string;
  hint?: string;
}

export interface RepeatableLabels {
  add: string;
  remove: string;
  /** Row heading, e.g. "Education {n}" */
  item: string;
}

interface Row { id: number; values: Record<string, string> }

/**
 * Generic add / remove rows editor. Inputs are uncontrolled and named `${name}[${index}].${field.key}`
 * (parsed on the server by formToObject); blank rows are dropped server-side. Uses only logical CSS so it
 * works in RTL. Without JavaScript the initial rows still post normally.
 */
export default function RepeatableSection({ name, fields, initial, max, labels }: {
  name: string; fields: FieldConfig[]; initial: Record<string, string>[]; max: number; labels: RepeatableLabels;
}) {
  const uid = useId();
  const nextId = useRef(0);
  const make = (values: Record<string, string> = {}): Row => ({ id: nextId.current++, values });
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial.slice(0, max) : [{}]).map((v) => make(v)));

  return (
    <div>
      {rows.map((row, i) => (
        <div className="card" key={row.id} style={{ marginBottom: 12 }}>
          <div className="admin-row" style={{ borderBottom: 0, padding: "0 0 4px" }}>
            <strong>{labels.item.replace("{n}", String(i + 1))}</strong>
            <button type="button" className="btn btn-outline btn-small" onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}>
              {labels.remove}
            </button>
          </div>
          <div className="grid-2">
            {fields.map((f) => {
              const id = `${uid}-${row.id}-${f.key}`;
              const common = {
                id, name: `${name}[${i}].${f.key}`, defaultValue: row.values[f.key] ?? "", required: f.required, maxLength: f.maxLength
              };
              return (
                <div key={f.key} style={f.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
                  <label htmlFor={id}>{f.label}{f.required ? " *" : ""}</label>
                  {f.type === "textarea" ? (
                    <textarea {...common} rows={3} placeholder={f.placeholder} />
                  ) : f.type === "select" ? (
                    <select id={id} name={common.name} defaultValue={common.defaultValue} required={f.required}>
                      {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input
                      {...common}
                      type={f.type === "month" ? "month" : f.type === "url" ? "url" : "text"}
                      inputMode={f.type === "year" ? "numeric" : undefined}
                      pattern={f.type === "year" ? "(19|20)\\d{2}" : f.type === "month" ? "\\d{4}-(0[1-9]|1[0-2])" : undefined}
                      maxLength={f.type === "year" ? 4 : f.maxLength}
                      placeholder={f.placeholder}
                    />
                  )}
                  {f.hint ? <span className="muted">{f.hint}</span> : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" className="btn btn-outline btn-small" onClick={() => setRows((r) => [...r, make()])}>
          + {labels.add}
        </button>
      )}
    </div>
  );
}
