import Link from "next/link";
import type { ReactNode } from "react";
import type { NavItem } from "./nav-config";

// Rows with an href navigate client-side (no reload); the rest are mocked.
function RowLink({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  if (href)
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  return (
    <button type="button" className={className}>
      {children}
    </button>
  );
}

export function SidebarNavItem({ item, tall, active }: { item: NavItem; tall?: boolean; active?: boolean }) {
  const Icon = item.icon;
  return (
    <RowLink
      href={item.href}
      className={`flex w-full items-center gap-[9px] rounded-lg px-2 text-left text-[14px] ${
        active ? "bg-active text-foreground" : "text-muted hover:bg-hover"
      } ${tall ? "h-9" : "h-[34px]"}`}
    >
      <Icon size={20} strokeWidth={1.5} className="shrink-0" />
      <span>{item.label}</span>
    </RowLink>
  );
}

export function SidebarSection({
  label,
  className = "mt-5",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <h2 className="mb-1.5 px-[7px] text-[12px] text-subtle">{label}</h2>
      {children}
    </section>
  );
}

export function SidebarRow({
  href,
  active,
  trailing,
  className = "",
  children,
}: {
  href?: string;
  active?: boolean;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <RowLink
      href={href}
      className={`flex h-[34px] w-full items-center justify-between rounded-lg px-2 text-left text-[14px] ${
        active ? "bg-active" : "hover:bg-hover"
      } ${className}`}
    >
      <span className="truncate">{children}</span>
      {trailing}
    </RowLink>
  );
}
