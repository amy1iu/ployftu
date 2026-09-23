import type { OnboardingUIMessage } from "@/lib/ai/agent";

export function Message({ message }: { message: OnboardingUIMessage }) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-2xl bg-active px-4 py-2.5 whitespace-pre-wrap">{text}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 px-2">
      {message.parts.map((part, i) => {
        const key = `${message.id}-${i}`;
        switch (part.type) {
          case "text":
            return part.text.split(/\n{2,}/).map((para, j) => (
              <p key={`${key}-${j}`} className="whitespace-pre-wrap">
                {para}
              </p>
            ));
          case "tool-recommendProducts":
            if (part.state !== "output-available") {
              return (
                <p key={key} className="text-subtle">
                  Finding the best fit…
                </p>
              );
            }
            return (
              <div key={key} className="grid gap-2">
                {part.output.map((rec) => (
                  <div key={rec.productId} className="rounded-xl border border-border bg-surface p-4">
                    <p className="font-medium">{rec.product.name}</p>
                    <p className="text-muted">{rec.reason}</p>
                  </div>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}
