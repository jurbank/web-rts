import type { Operation } from "editor";
import { useState, type ReactNode } from "react";

/** Applies an edit to the document. False when it was refused. */
export type Edit = (operation: Operation) => boolean;

export const FIELD =
  "pointer-events-auto min-h-9 min-w-0 rounded-md border border-white/30 bg-slate-800 px-2 text-white";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pointer-events-auto flex flex-col gap-2 rounded-lg bg-slate-900/85 p-2">
      <h2 className="text-xs tracking-wide text-white/60 uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** A small button for a list entry. */
export function Chip(props: {
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.pressed}
      className="min-h-7 rounded-md border border-white/30 px-2 disabled:opacity-40 aria-pressed:bg-white aria-pressed:text-slate-900"
    >
      {props.children}
    </button>
  );
}

/** Holds what is typed until the field is left or Enter is pressed, so one change is one edit. */
export function TextField(props: {
  label: string;
  value: string;
  type?: "text" | "number";
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center justify-between gap-2">
      {props.label}
      <input
        type={props.type ?? "text"}
        step="any"
        placeholder={props.placeholder}
        className={`${FIELD} w-24`}
        value={draft ?? props.value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== props.value) props.onCommit(draft.trim());
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

/** Emptying the field calls `onClear`, or changes nothing when the value is required. */
export function NumberField(props: {
  label: string;
  value: number | undefined;
  placeholder?: string;
  onCommit: (value: number) => void;
  onClear?: () => void;
}) {
  return (
    <TextField
      type="number"
      label={props.label}
      value={props.value === undefined ? "" : String(props.value)}
      placeholder={props.placeholder}
      onCommit={(text) => {
        if (text === "") props.onClear?.();
        else props.onCommit(Number(text));
      }}
    />
  );
}
