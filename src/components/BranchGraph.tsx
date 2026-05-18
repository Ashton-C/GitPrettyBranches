"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphData } from "@/lib/graph";

type Props = {
  graph: GraphData;
  repoUrl: string;
};

// Natural geometry — these are SVG user units. The viewBox auto-scales the
// whole thing to fill the parent container, so absolute pixel sizes don't
// really matter; ratios do.
const ROW_HEIGHT = 28;
const LANE_WIDTH = 22;
const LEFT_PAD = 20;
const GRAPH_RIGHT_PAD = 16;
const TEXT_COL_WIDTH = 520;
const NODE_RADIUS = 6;
const TOP_PAD = 16;
const BOTTOM_PAD = 16;

export function BranchGraph({ graph, repoUrl }: Props) {
  const { commits, edges, branchTips, laneCount } = graph;

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const graphPixelWidth = LEFT_PAD + laneCount * LANE_WIDTH + GRAPH_RIGHT_PAD;
  const naturalWidth = graphPixelWidth + TEXT_COL_WIDTH;
  const naturalHeight =
    TOP_PAD + Math.max(1, commits.length) * ROW_HEIGHT + BOTTOM_PAD;

  // viewBox is the source of truth for pan + zoom.
  const [view, setView] = useState({
    x: 0,
    y: 0,
    w: naturalWidth,
    h: naturalHeight,
  });

  // Reset viewBox whenever the underlying graph changes (different repo
  // expanded, refresh, etc.).
  useEffect(() => {
    setView({ x: 0, y: 0, w: naturalWidth, h: naturalHeight });
  }, [naturalWidth, naturalHeight]);

  function laneX(lane: number) {
    return LEFT_PAD + lane * LANE_WIDTH;
  }
  function rowY(row: number) {
    return TOP_PAD + ROW_HEIGHT / 2 + row * ROW_HEIGHT;
  }

  // Group branch tips by SHA so multiple branches at the same commit stack.
  const tipsBySha = useMemo(() => {
    const m = new Map<string, typeof branchTips>();
    for (const t of branchTips) {
      const arr = m.get(t.sha) ?? [];
      arr.push(t);
      m.set(t.sha, arr);
    }
    return m;
  }, [branchTips]);

  // Hover state for tooltip + row highlight.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    idx: number;
  } | null>(null);

  // Convert client (mouse) coordinates → SVG user units, taking the current
  // viewBox into account. This is how pan/zoom translate into commit picking.
  function clientToSvg(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    return { x: view.x + fx * view.w, y: view.y + fy * view.h };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isDragging.current) return;
    const { y } = clientToSvg(e.clientX, e.clientY);
    const idx = Math.floor((y - TOP_PAD) / ROW_HEIGHT);
    if (idx >= 0 && idx < commits.length) {
      setHoverIdx(idx);
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        idx,
      });
    } else {
      setHoverIdx(null);
      setTooltip(null);
    }
  }

  function handleMouseLeave() {
    setHoverIdx(null);
    setTooltip(null);
  }

  // Wheel = zoom around the cursor; preserves the SVG point under the mouse.
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.9 : 1.1;
    const { x: mx, y: my } = clientToSvg(e.clientX, e.clientY);
    const newW = clamp(view.w * factor, naturalWidth / 20, naturalWidth * 5);
    const newH = clamp(view.h * factor, naturalHeight / 20, naturalHeight * 5);
    // Keep cursor pinned to same point in user-units.
    const fx = (mx - view.x) / view.w;
    const fy = (my - view.y) / view.h;
    setView({
      x: mx - fx * newW,
      y: my - fy * newH,
      w: newW,
      h: newH,
    });
  }

  // Drag to pan.
  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number; vx: number; vy: number }>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  });

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    // Don't start a drag on top of a clickable element (commit row anchor).
    const target = e.target as Element;
    if (target.closest("a")) return;
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      vx: view.x,
      vy: view.y,
    };
    setHoverIdx(null);
    setTooltip(null);
  }

  function handleMouseUp() {
    isDragging.current = false;
  }

  function handleDrag(e: React.MouseEvent) {
    if (!isDragging.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx =
      ((e.clientX - dragStart.current.x) / rect.width) * view.w;
    const dy =
      ((e.clientY - dragStart.current.y) / rect.height) * view.h;
    setView((v) => ({ ...v, x: dragStart.current.vx - dx, y: dragStart.current.vy - dy }));
  }

  function fitToScreen() {
    setView({ x: 0, y: 0, w: naturalWidth, h: naturalHeight });
  }

  function zoomBy(factor: number) {
    const cx = view.x + view.w / 2;
    const cy = view.y + view.h / 2;
    const newW = clamp(view.w * factor, naturalWidth / 20, naturalWidth * 5);
    const newH = clamp(view.h * factor, naturalHeight / 20, naturalHeight * 5);
    setView({ x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH });
  }

  // Empty-graph guard.
  if (commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-border bg-bg-soft p-4 text-sm text-text-muted">
        No commits to render.
      </div>
    );
  }

  // Approximate "fit %" indicator for the user — 100% means the natural
  // viewBox is shown unmodified.
  const fitPct = Math.round((naturalWidth / view.w) * 100);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full rounded-md border border-border bg-bg-soft overflow-hidden"
    >
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => {
          handleDrag(e);
          handleMouseMove(e);
        }}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          handleMouseLeave();
        }}
        style={{ cursor: isDragging.current ? "grabbing" : "grab" }}
      >
        {/* Row hover highlight */}
        {hoverIdx !== null && (
          <rect
            x={view.x}
            y={TOP_PAD + hoverIdx * ROW_HEIGHT}
            width={view.w}
            height={ROW_HEIGHT}
            fill="#ffffff"
            opacity={0.04}
          />
        )}

        {/* Edges — drawn first so nodes/text sit on top */}
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
              strokeWidth={2}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* Commit text + branch chips, all in SVG so they scale with viewBox */}
        {commits.map((c, idx) => {
          const tips = tipsBySha.get(c.sha) ?? [];
          const textX = graphPixelWidth;
          const y = rowY(c.row);
          return (
            <g key={c.sha}>
              {/* Branch tip chips */}
              {tips.map((t, ti) => {
                const chipX =
                  textX +
                  tips
                    .slice(0, ti)
                    .reduce((acc, tt) => acc + chipWidth(tt.name) + 6, 0);
                return (
                  <ChipSvg
                    key={t.name}
                    x={chipX}
                    y={y}
                    label={t.name}
                    color={t.color}
                  />
                );
              })}
              {/* Commit message — clicking takes you to GitHub */}
              <a
                href={`${repoUrl}/commit/${c.sha}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <text
                  x={
                    textX +
                    tips.reduce(
                      (acc, t) => acc + chipWidth(t.name) + 6,
                      tips.length > 0 ? 4 : 0,
                    )
                  }
                  y={y + 4}
                  fontSize={13}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fill={hoverIdx === idx ? "#e6edf3" : "#c9d1d9"}
                  className="cursor-pointer"
                >
                  {truncate(c.message || "(no message)", 64)}
                </text>
              </a>
            </g>
          );
        })}

        {/* Commit nodes on top of everything */}
        {commits.map((c) => (
          <circle
            key={c.sha}
            cx={laneX(c.lane)}
            cy={rowY(c.row)}
            r={NODE_RADIUS}
            fill={c.color}
            stroke="#0d1117"
            strokeWidth={2}
          />
        ))}
      </svg>

      {/* Zoom + fit controls */}
      <div className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-md border border-border bg-bg/95 px-1 py-1 text-xs backdrop-blur">
        <button
          onClick={() => zoomBy(1.25)}
          className="rounded px-2 py-0.5 hover:bg-bg-soft"
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <span className="w-12 text-center text-text-muted">{fitPct}%</span>
        <button
          onClick={() => zoomBy(0.8)}
          className="rounded px-2 py-0.5 hover:bg-bg-soft"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          onClick={fitToScreen}
          className="rounded px-2 py-0.5 text-text-muted hover:bg-bg-soft hover:text-text"
          title="Fit entire tree to screen"
        >
          fit
        </button>
      </div>

      {/* Tooltip for the hovered commit */}
      {tooltip && (
        <CommitTooltip
          clientX={tooltip.x}
          clientY={tooltip.y}
          containerRef={containerRef}
          commit={commits[tooltip.idx]}
        />
      )}

      <div className="absolute bottom-3 left-3 z-10 rounded-md border border-border bg-bg/90 px-2 py-1 text-[10px] text-text-muted backdrop-blur">
        scroll = zoom · drag = pan · click commit to open
      </div>
    </div>
  );
}

function CommitTooltip({
  clientX,
  clientY,
  containerRef,
  commit,
}: {
  clientX: number;
  clientY: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  commit: ReturnType<() => GraphData["commits"][number]>;
}) {
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect) return null;
  // Keep tooltip inside the container bounds.
  const localX = Math.min(clientX - rect.left + 12, rect.width - 320);
  const localY = Math.min(clientY - rect.top + 12, rect.height - 110);
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[320px] rounded-md border border-border bg-bg/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
      style={{ left: Math.max(8, localX), top: Math.max(8, localY) }}
    >
      <div className="font-mono text-text-muted">
        {commit.sha.slice(0, 7)}
      </div>
      <div className="mt-0.5 text-text">{commit.message}</div>
      <div className="mt-1 text-text-muted">
        {commit.authorLogin || commit.authorName} · {formatDate(commit.date)}
      </div>
      {commit.branches.length > 0 && (
        <div className="mt-1 text-text-muted">
          on {commit.branches.slice(0, 4).join(", ")}
          {commit.branches.length > 4
            ? ` +${commit.branches.length - 4}`
            : ""}
        </div>
      )}
    </div>
  );
}

function ChipSvg({
  x,
  y,
  label,
  color,
}: {
  x: number;
  y: number;
  label: string;
  color: string;
}) {
  const w = chipWidth(label);
  const h = 16;
  return (
    <g transform={`translate(${x}, ${y - h / 2})`}>
      <rect
        rx={8}
        ry={8}
        width={w}
        height={h}
        fill={hexToRgba(color, 0.18)}
        stroke={hexToRgba(color, 0.5)}
      />
      <circle cx={9} cy={h / 2} r={3} fill={color} />
      <text
        x={17}
        y={h / 2 + 4}
        fontSize={10}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fill={color}
      >
        {label}
      </text>
    </g>
  );
}

function chipWidth(label: string) {
  // Approximate width: 6px per char (monospace 10px) + 24px padding.
  return Math.min(label.length, 28) * 6 + 24;
}

function curvePath(x1: number, y1: number, x2: number, y2: number) {
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

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
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

export default BranchGraph;
