"use client";

import { useState } from "react";

const colors = ["#558BF3", "#8FB3F7", "#F2B84B", "#E9747A", "#6CC4A1", "#B79CF2"];

/**
 * A burst of confetti falling over the page, for finishing onboarding. Pure CSS
 * (the `confetti-fall` keyframes); skipped for people who prefer reduced motion.
 */
export function Confetti({ pieces = 90 }: { pieces?: number }) {
  // Random once per burst; this only ever renders on the client, after a click.
  const [bits] = useState(() =>
    Array.from({ length: pieces }, (_, i) => ({
      left: Math.random() * 100,
      drift: (Math.random() - 0.5) * 30,
      delay: Math.random() * 0.35,
      duration: 1.3 + Math.random() * 0.9,
      spin: 360 + Math.random() * 540,
      width: 6 + Math.random() * 5,
      round: Math.random() < 0.3,
      color: colors[i % colors.length],
    })),
  );
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden motion-reduce:hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute -top-4 block animate-[confetti-fall_var(--dur)_ease-in_var(--delay)_forwards] opacity-0"
          style={
            {
              left: `${b.left}%`,
              width: b.width,
              height: b.round ? b.width : b.width * 0.45,
              borderRadius: b.round ? "50%" : 1,
              background: b.color,
              "--dur": `${b.duration}s`,
              "--delay": `${b.delay}s`,
              "--drift": `${b.drift}vw`,
              "--spin": `${b.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
