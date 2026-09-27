// Ploy's mark: a ring of dots on a 7×7 grid. Used wherever Ploy speaks.
const dots = [
  [2, 0], [4, 0],
  [1, 1], [2, 1], [4, 1], [5, 1],
  [0, 2], [1, 2], [2, 2], [4, 2], [5, 2], [6, 2],
  [1, 3], [5, 3],
  [0, 4], [1, 4], [2, 4], [4, 4], [5, 4], [6, 4],
  [1, 5], [2, 5], [3, 5], [4, 5], [5, 5],
  [2, 6], [4, 6],
];

export function PloyAvatar({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 7 7" width={size} height={size} aria-hidden className={`shrink-0 ${className}`}>
      {dots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.42} fill="#558BF3" />
      ))}
    </svg>
  );
}
