/**
 * Tiny control-panel primitives for the Design Lab (segmented pickers, toggles,
 * action buttons, grouped rows). Deliberately dependency-free inline components
 * styled by lab.css — the lab's own chrome must never pull in the app design
 * system it is used to preview, so a token change in @elizaos/ui can't silently
 * restyle the harness around it.
 */
import type { ReactNode } from "react";

export function ControlGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="lab-group">
      <div className="lab-group-label">{label}</div>
      <div className="lab-group-body">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="lab-segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`lab-seg ${o.value === value ? "is-active" : ""}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="lab-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="lab-toggle-track" aria-hidden />
      <span className="lab-toggle-label">{label}</span>
    </label>
  );
}

export function ActionButton({
  children,
  onClick,
  variant = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "default" | "primary";
}) {
  return (
    <button
      type="button"
      className={`lab-action ${variant === "primary" ? "is-primary" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="lab-row">{children}</div>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="lab-hint">{children}</p>;
}
