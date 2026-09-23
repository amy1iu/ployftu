import type { ReactNode } from "react";
import type { NavItem } from "./nav-config";

// Tabs are mocked: they render as buttons but don't navigate yet.
const noop = () => {};

export function SidebarNavItem({ item, tall }: { item: NavItem; tall?: boolean }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={noop}
      className={`flex w-full items-center gap-[9px] rounded-lg px-2 text-left text-[14px] text-muted hover:bg-hover ${
        tall ? "h-9" : "h-[34px]"
      }`}
    >
      <Icon size={20} strokeWidth={1.5} className="shrink-0" />
      <span>{item.label}</span>
    </button>
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
  active,
  trailing,
  children,
}: {
  active?: boolean;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={noop}
      className={`flex h-[34px] w-full items-center justify-between rounded-lg px-2 text-left text-[14px] ${
        active ? "bg-active" : "hover:bg-hover"
      }`}
    >
      <span className="truncate">{children}</span>
      {trailing}
    </button>
  );
}
