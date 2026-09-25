// Shown from the moment a message is sent until the reply's first words arrive.
export function ThinkingIndicator() {
  return (
    <div role="status" aria-label="Thinking" className="flex items-center gap-2 px-2 text-subtle">
      <span className="flex gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-subtle"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="text-[13px]">Thinking</span>
    </div>
  );
}
