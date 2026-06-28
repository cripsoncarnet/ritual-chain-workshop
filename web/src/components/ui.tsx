"use client";

import type { ReactNode, ButtonHTMLAttributes } from "react";
import type { TxState } from "@/hooks/useWriteTx";

/* ------------------------------------------------------------------ Card */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass-card ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="glass-card-header">
      <div style={{ minWidth: 0 }}>
        <h2 className="glass-card-title">{title}</h2>
        {subtitle ? (
          <p className="glass-card-subtitle">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`glass-card-body ${className}`}>{children}</div>;
}

/* ----------------------------------------------------------------- Badge */

type Tone = "green" | "amber" | "indigo" | "zinc" | "red" | "violet";

const BADGE_TONES: Record<Tone, string> = {
  green:  "badge badge-green",
  amber:  "badge badge-amber",
  indigo: "badge badge-indigo",
  zinc:   "badge badge-zinc",
  red:    "badge badge-red",
  violet: "badge badge-violet",
};

export function Badge({
  children,
  tone = "zinc",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={BADGE_TONES[tone]}>
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const variantClass: Record<string, string> = {
    primary:   "btn-neon btn-primary",
    secondary: "btn-neon btn-secondary",
    ghost:     "btn-neon btn-ghost",
  };
  return (
    <button
      className={`${variantClass[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------- Form fields */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`input-neon ${props.className ?? ""}`}
    />
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`input-neon ${props.className ?? ""}`}
      style={{ resize: "vertical", ...props.style }}
    />
  );
}

/* ---------------------------------------------------------- Tx status UI */

const TX_LABEL: Record<TxState, string> = {
  idle:      "",
  wallet:    "Waiting for wallet…",
  pending:   "Confirming on-chain…",
  confirmed: "Confirmed",
  failed:    "Failed",
};

const TX_TONE: Record<TxState, Tone> = {
  idle:      "zinc",
  wallet:    "amber",
  pending:   "indigo",
  confirmed: "green",
  failed:    "red",
};

export function TxStatus({
  state,
  error,
  hash,
  explorerBase,
}: {
  state: TxState;
  error?: string | null;
  hash?: `0x${string}`;
  explorerBase?: string;
}) {
  if (state === "idle" && !error) return null;
  return (
    <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12 }}>
      <Badge tone={TX_TONE[state]}>
        {(state === "wallet" || state === "pending") && <Spinner />}
        {state === "failed" && error ? error : TX_LABEL[state]}
      </Badge>
      {hash && explorerBase ? (
        <a
          href={`${explorerBase}/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(0,255,136,0.7)", textDecoration: "underline", textUnderlineOffset: 2, fontSize: 12 }}
        >
          View tx ↗
        </a>
      ) : null}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" />;
}

export function Notice({
  tone = "zinc",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  const noticeClass: Record<Tone, string> = {
    green:  "notice notice-green",
    amber:  "notice notice-amber",
    indigo: "notice notice-indigo",
    zinc:   "notice notice-zinc",
    red:    "notice notice-red",
    violet: "notice notice-violet",
  };
  return (
    <div className={noticeClass[tone]}>{children}</div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat-block">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
