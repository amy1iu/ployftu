import { currentUser } from "@/lib/mock-data";

export function ChatHeader({ title }: { title: string }) {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between pr-[26px] pl-10">
      <h1 className="text-[17px]">{title}</h1>
      <button
        type="button"
        className="flex h-8 items-center gap-2 rounded-full border border-border bg-surface pr-3 pl-2 text-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <span className="flex size-5 items-center justify-center rounded-full bg-avatar text-[11px] text-white">
          {currentUser.initial}
        </span>
        Share
      </button>
    </header>
  );
}
