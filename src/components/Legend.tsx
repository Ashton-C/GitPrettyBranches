import { LANE_COLORS } from "@/lib/graph";

type Props = {
  branchTips: { name: string; color: string }[];
};

export function Legend({ branchTips }: Props) {
  if (branchTips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-bg-soft px-3 py-2 text-[11px]">
      {branchTips.map((b) => (
        <span
          key={b.name}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
          style={{
            background: hexToRgba(b.color, 0.12),
            color: b.color,
            border: `1px solid ${hexToRgba(b.color, 0.4)}`,
          }}
          title={b.name}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: b.color,
            }}
          />
          <span className="max-w-[14ch] truncate">{b.name}</span>
        </span>
      ))}
    </div>
  );
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Re-export so caller can see palette if needed for previews.
export { LANE_COLORS };
