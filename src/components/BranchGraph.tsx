"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphData } from "@/lib/graph";

type Props = {
  graph: GraphData;
  repoUrl: string;
};

// Layout constants — tweaking these changes the whole visual density.
const ROW_HEIGHT = 28;
const LANE_WIDTH = 18;
const LEFT_PAD = 16;
const RIGHT_PAD_GRAPH = 16; // gap between graph and commit text
const NODE_RADIUS = 5;
const TEXT_X_OFFSET = 12;
const MIN_TEXT_WIDTH = 360;

export function BranchGraph({ graph, repoUrl }: Props) {
  const { commits, edges, branchTips, laneCount } = graph;

  const graphWidth = LEFT_PAD + laneCount * LANE_WIDTH + RIGHT_PAD_GRAPH;
  const totalHeight = Math.max(ROW_HEIGHT, commits.length * ROW_HEIGHT) + ROW_HEIGHT;

  // Pan/zoom state for the graph (vertical scroll handled by container).
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  function laneX(lane: number) {
    return LEFT_PAD + lane * LANE_WIDTH;
  }
  function rowY(row: number) {
    return ROW_HEIGHT / 2 + row * ROW_HEIGHT;
  }

  // Group branch tips by SHA so they stack on the same row.
  const tipsBySha = useMemo(() => {
    const m = new Map<string, typeof branchTips>();
    for (const t of branchTips) {
      const arr = m.get(t.sha) ?? [];
      arr.push(t);
      m.set(t.sha, arr);
    }
    return m;
  }, [branchTips]);

  function handleWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 0.9), 0.5, 2.5));
  }

  // Empty-graph guard.
  if (commits.length === 0) {
    return (
      <div className="rounded-md border border-border bg-bg-soft p-4 text-sm text-text-muted">
        No commits to render.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="relative rounded-md border border-border bg-bg-soft overflow-auto"
      style={{ maxHeight: "70vh" }}
    >
      <div
        className="flex font-mono text-xs"
        style={{
          fontSize: `${12 * zoom}px`,
          minWidth: `${(graphWidth + MIN_TEXT_WIDTH) * zoom}px`,
        }}
      >
        {/* SVG graph column */}
        <svg
          width={graphWidth * zoom}
          height={totalHeight * zoom}
          viewBox={`0 0 ${graphWidth} ${totalHeight}`}
          style={{ flex: "0 0 auto" }}
          preserveAspectRatio="xMinYMin meet"
        >
          {/* Edges first so commit nodes sit on top */}
          {edges.map((e, i) => {
            const x1 = laneX(e.fromLane);
            const y1 = rowY(e.fromRow);
            const x2 = laneX(e.toLane);
            const y2 = rowY(e.toRow);
            const d =
              e.fromLane === e.toLane
                ? `M ${x1} ${y1} L ${x2} ${y2}`
                : curvePath(x1, y1, x2, y2);
            return (
              <path
                key={i}
                d={d}
                stroke={e.color}
                strokeWidth={1.5}
                fill="none"
              />
            );
          })}
          {/* Commit nodes */}
          {commits.map((c) => (
            <circle
              key={c.sha}
              cx={laneX(c.lane)}
              cy={rowY(c.row)}
              r={NODE_RADIUS}
              fill={c.color}
              stroke="#0d1117"
              strokeWidth={2}
            >
              <title>{c.sha.slice(0, 7)} — {c.message}</title>
            </circle>
          ))}
        </svg>

        {/* Commit text column */}
        <div
          className="flex-1 py-0"
          style={{
            paddingLeft: TEXT_X_OFFSET,
            lineHeight: `${ROW_HEIGHT}px`,
          }}
        >
          {commits.map((c) => {
            const tips = tipsBySha.get(c.sha) ?? [];
            return (
              <div
                key={c.sha}
                className="flex items-center gap-2 whitespace-nowrap hover:bg-bg-softer"
                style={{ height: ROW_HEIGHT }}
              >
                {tips.map((t) => (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-1 rounded-full px-2 text-[10px] uppercase tracking-wide"
                    style={{
                      background: hexToRgba(t.color, 0.15),
                      color: t.color,
                      border: `1px solid ${hexToRgba(t.color, 0.4)}`,
                      lineHeight: "16px",
                    }}
                    title={`branch: ${t.name}`}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: t.color,
                      }}
                    />
                    {t.name}
                  </span>
                ))}
                <a
                  href={`${repoUrl}/commit/${c.sha}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-text hover:text-accent truncate"
                  style={{ maxWidth: "60ch" }}
                  title={c.message}
                >
                  {c.message || "(no message)"}
                </a>
                <span className="text-text-muted">
                  {c.authorLogin || c.authorName}
                </span>
                <span className="text-text-muted">·</span>
                <span className="text-text-muted">{formatDate(c.date)}</span>
                <span className="text-text-muted">·</span>
                <span className="text-text-muted">{c.sha.slice(0, 7)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="sticky bottom-2 left-2 ml-2 mb-2 inline-flex w-fit items-center gap-1 rounded-md border border-border bg-bg px-1 py-1 text-xs">
        <button
          onClick={() => setZoom((z) => clamp(z * 0.9, 0.5, 2.5))}
          className="px-2 py-0.5 hover:bg-bg-soft rounded"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="w-10 text-center text-text-muted">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => clamp(z * 1.1, 0.5, 2.5))}
          className="px-2 py-0.5 hover:bg-bg-soft rounded"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => setZoom(1)}
          className="px-2 py-0.5 hover:bg-bg-soft rounded text-text-muted"
        >
          reset
        </button>
      </div>
    </div>
  );
}

function curvePath(x1: number, y1: number, x2: number, y2: number) {
  // S-curve: vertical drop, then horizontal slide. The control points sit
  // halfway between rows so the bend lands at the row boundary.
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Hook ESLint hint suppressed — we explicitly want fresh sort each render.
export default BranchGraph;
