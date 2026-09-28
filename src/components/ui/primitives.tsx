import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Health } from "@/lib/domain/types";

/*
  Small, flat building blocks that follow the Lane design system. Every
  interactive element is a real <button> or <a>; touch targets are 44px.
*/

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[6px] px-4 text-[15px] font-semibold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-navy text-on-navy hover:bg-ink-78",
  secondary: "border border-hairline bg-card text-ink hover:bg-ground",
  ghost: "text-ink hover:bg-ground",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "md" | "lg" | "sm" }) {
  const h = size === "lg" ? "h-12" : size === "sm" ? "h-9 text-sm px-3" : "h-11";
  return <button type="button" className={cx(buttonBase, buttonVariants[variant], h, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "md" | "lg" | "sm" }) {
  const h = size === "lg" ? "h-12" : size === "sm" ? "h-9 text-sm px-3" : "h-11";
  return <Link className={cx(buttonBase, buttonVariants[variant], h, "no-underline", className)} {...props} />;
}

export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-[12px] border border-hairline bg-card", className)} {...props}>
      {children}
    </div>
  );
}

export function Tag({
  tone = "tint",
  className,
  children,
}: {
  tone?: "tint" | "amber" | "outline";
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    tint: "bg-harbour-tint text-ink",
    amber: "bg-amber-tint text-amber",
    outline: "border border-hairline text-ink-78",
  };
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Owner health, the only place red is allowed. */
export function HealthDot({ health, className }: { health: Health; className?: string }) {
  const colour = health === "red" ? "bg-error" : health === "amber" ? "bg-amber" : "bg-harbour";
  const label = health === "red" ? "Owner needs attention" : health === "amber" ? "Owner needs some care" : "Owner is happy";
  return <span aria-label={label} title={label} className={cx("inline-block h-2 w-2 shrink-0 rounded-full", colour, className)} />;
}

export function Headline({ children, className, as: As = "h1" }: { children: ReactNode; className?: string; as?: "h1" | "h2" }) {
  return (
    <As className={cx("display leading-[1.1] [text-wrap:balance]", className)}>
      {children}
      <span className="text-harbour">.</span>
    </As>
  );
}

export function Stat({ value, label, className }: { value: ReactNode; label: ReactNode; className?: string }) {
  return (
    <Card className={cx("flex flex-col gap-1 p-3 sm:p-5", className)}>
      <span className="display num text-2xl sm:text-[28px] leading-none">{value}</span>
      <span className="text-xs sm:text-[13px] leading-snug text-ink-66">{label}</span>
    </Card>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cx("inline-flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-on-navy", className)}
    >
      {initials}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <Card className="p-6 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      {body ? <p className="mt-1 text-sm text-ink-66">{body}</p> : null}
    </Card>
  );
}
