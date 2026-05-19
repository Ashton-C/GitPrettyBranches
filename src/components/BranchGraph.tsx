"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphData } from "@/lib/graph";

type Props = {
  graph: GraphData;
  repoUrl: string;
};

// Natural geometry — SVG user units. The viewBox auto-scales so absolute
// values matter mostly for ratios. Sideways layout with a left → right time
// axis: oldest on the left, newest (branch tips) on the right. Lanes stack
// top → bottom.
const COL_WIDTH = 28;
const LANE_HEIGHT = 22;
const LEFT_PAD = 40;
const RIGHT_PAD = 40;
const TOP_PAD = 56; // extra headroom for branch chips above tip nodes
const BOTTOM_PAD = 24;
const NODE_RADIUS = 6;

export function BranchGraph({ graph, repoUrl }: Props) {
  const { commits, edges, branchTips, laneCount } = graph;

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const naturalWidth =
    LEFT_PAD + Math.max(1, commits.length) * COL_WIDTH + RIGHT_PAD;
  const naturalHeight =
    TOP_PAD + Math.max(1, laneCount) * LANE_HEIGHT + BOTTOM_PAD;

  // viewBox = source of truth for pan + zoom.
  const [view, setView] = useState({
    x: 0,
    y: 0,
    w: naturalWidth,
    h: naturalHeight,
  });

  useEffect(() => {
    setView({ x: 0, y: 0, w: naturalWidth, h: naturalHeight });
  }, [naturalWidth, naturalHeight]);

  // Rows come in newest-first (row 0 = HEAD). Flip the visual mapping so the
  // newest commit lands on the right edge — standard left-to-right timeline.
  const maxRow = Math.max(0, commits.length - 1);
  function commitX(row: number) {
    return LEFT_PAD + (maxRow - row) * COL_WIDTH;
  }
  function laneY(lane: number) {
    return TOP_PAD + lane * LANE_HEIGHT;
  }

  // Map: row index → list of branch tips that end at that commit. A branch's
  // "first node" is its tip — the most recent commit on it.
  const tipsByRow = useMemo(() => {
    const shaToRow = new Map<string, { lane: number; row: number }>();
    for (const c of commits) shaToRow.set(c.sha, { lane: c.lane, row: c.row });
    const m = new Map<
      number,
      { name: string; color: string; lane: number; row: number }[]
    >();
    for (const t of branchTips) {
      const pos = shaToRow.get(t.sha);
      if (!pos) continue;
      const arr = m.get(pos.row) ?? [];
      arr.push({ name: t.name, color: t.color, lane: pos.lane, row: pos.row });
      m.set(pos.row, arr);
    }
    return m;
  }, [branchTips, commits]);

  // For fast hit-testing on hover/click: commits indexed by row, then by lane.
  const commitsByRow = useMemo(() => {
    const m = new Map<number, GraphData["commits"]>();
    for (const c of commits) {
      const arr = m.get(c.row) ?? [];
      arr.push(c);
      m.set(c.row, arr);
    }
    return m;
  }, [commits]);

  const [hoveredSha, setHoveredSha] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; sha: string } | null>(null);

  // Keep latest view in a ref so the natively-attached wheel listener (which
  // is registered once with passive:false) can always read fresh state.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  function clientToSvgUsing(
    v: { x: number; y: number; w: number; h: number },
    clientX: number,
    clientY: number,
  ) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    return { x: v.x + fx * v.w, y: v.y + fy * v.h };
  }

  function clientToSvg(clientX: number, clientY: number) {
    return clientToSvgUsing(view, clientX, clientY);
  }

  function pickCommit(clientX: number, clientY: number) {
    const { x, y } = clientToSvg(clientX, clientY);
    // Inverted axis: x grows with (maxRow - row), so row = maxRow - col.
    const row = Math.round(maxRow - (x - LEFT_PAD) / COL_WIDTH);
    const candidates = commitsByRow.get(row);
    if (!candidates || candidates.length === 0) return null;
    let best: GraphData["commits"][number] | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const dx = x - commitX(c.row);
      const dy = y - laneY(c.lane);
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    const threshold = Math.max(NODE_RADIUS * 2, (COL_WIDTH + LANE_HEIGHT) / 3);
    return bestDist <= threshold ? best : null;
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isDragging.current) {
      handleDrag(e);
      return;
    }
    const c = pickCommit(e.clientX, e.clientY);
    if (c) {
      setHoveredSha(c.sha);
      setTooltip({ x: e.clientX, y: e.clientY, sha: c.sha });
    } else {
      setHoveredSha(null);
      setTooltip(null);
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (dragMoved.current) return;
    const c = pickCommit(e.clientX, e.clientY);
    if (!c) return;
    // Open GitHub in a new tab. No modal — the tree stays clean.
    window.open(`${repoUrl}/commit/${c.sha}`, "_blank", "noopener,noreferrer");
  }

  // Wheel must be non-passive so we can preventDefault and stop the page from
  // scrolling while the cursor is over the graph. React's synthetic onWheel
  // is passive by default, so we attach manually.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const v = viewRef.current;
      const factor = e.deltaY < 0 ? 0.9 : 1.1;
      const { x: mx, y: my } = clientToSvgUsing(v, e.clientX, e.clientY);
      const newW = clamp(v.w * factor, naturalWidth / 20, naturalWidth * 5);
      const newH = clamp(v.h * factor, naturalHeight / 20, naturalHeight * 5);
      const fx = (mx - v.x) / v.w;
      const fy = (my - v.y) / v.h;
      setView({
        x: mx - fx * newW,
        y: my - fy * newH,
        w: newW,
        h: newH,
      });
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalWidth, naturalHeight]);

  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragMoved.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    setHoveredSha(null);
    setTooltip(null);
  }

  function handleMouseUp() {
    isDragging.current = false;
  }

  function handleDrag(e: React.MouseEvent) {
    if (!isDragging.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const dxRaw = e.clientX - dragStart.current.x;
    const dyRaw = e.clientY - dragStart.current.y;
    if (Math.hypot(dxRaw, dyRaw) > 3) dragMoved.current = true;
    const rect = svg.getBoundingClientRect();
    const dx = (dxRaw / rect.width) * view.w;
    const dy = (dyRaw / rect.height) * view.h;
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

  if (commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-border bg-bg-soft p-4 text-sm text-text-muted">
        No commits to render.
      </div>
    );
  }

  const fitPct = Math.round((naturalWidth / view.w) * 100);
  const hoveredCommit =
    hoveredSha != null ? commits.find((c) => c.sha === hoveredSha) ?? null : null;

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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          setHoveredSha(null);
          setTooltip(null);
        }}
        onClick={handleClick}
        style={{ cursor: isDragging.current ? "grabbing" : "default" }}
      >
        {/* Edges first so nodes sit on top */}
        {edges.map((e, i) => {
          const x1 = commitX(e.fromRow);
          const y1 = laneY(e.fromLane);
          const x2 = commitX(e.toRow);
          const y2 = laneY(e.toLane);
          const d =
            e.fromLane === e.toLane
              ? `M ${x1} ${y1} L ${x2} ${y2}`
              : sidewaysCurve(x1, y1, x2, y2);
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

        {/* Branch chips at the tip (first node) of each branch */}
        {[...tipsByRow.entries()].map(([row, tips]) => (
          <g key={`tips-${row}`}>
            {tips.map((t, i) => {
              const node = { x: commitX(t.row), y: laneY(t.lane) };
              const w = chipWidth(t.name);
              // Stack chips upward when multiple branches share a tip.
              const chipY = node.y - NODE_RADIUS - 10 - i * 20;
              const chipX = node.x - w / 2;
              return (
                <g key={t.name}>
                  {/* Connector line from chip to node */}
                  <line
                    x1={node.x}
                    y1={chipY + 16}
                    x2={node.x}
                    y2={node.y - NODE_RADIUS}
                    stroke={hexToRgba(t.color, 0.55)}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <ChipSvg x={chipX} y={chipY} label={t.name} color={t.color} />
                </g>
              );
            })}
          </g>
        ))}

        {/* Commit nodes */}
        {commits.map((c) => {
          const isHover = c.sha === hoveredSha;
          return (
            <circle
              key={c.sha}
              cx={commitX(c.row)}
              cy={laneY(c.lane)}
              r={isHover ? NODE_RADIUS + 1 : NODE_RADIUS}
              fill={c.color}
              stroke="#0d1117"
              strokeWidth={2}
              style={{ cursor: "pointer" }}
            />
          );
        })}
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

      <div className="absolute bottom-3 left-3 z-10 rounded-md border border-border bg-bg/90 px-2 py-1 text-[10px] text-text-muted backdrop-blur">
        scroll = zoom · drag = pan · click commit to open on GitHub
      </div>

      {/* Hover tooltip — the only on-graph detail surface */}
      {tooltip && hoveredCommit && (
        <FloatingCard
          clientX={tooltip.x}
          clientY={tooltip.y}
          containerRef={containerRef}
        >
          <div className="flex items-center justify-between gap-2 font-mono text-text-muted">
            <span>{hoveredCommit.sha.slice(0, 7)}</span>
            <span>{formatDate(hoveredCommit.date)}</span>
          </div>
          <div className="mt-0.5 line-clamp-2 text-text">
            {hoveredCommit.message}
          </div>
          <div className="mt-0.5 text-text-muted">
            {hoveredCommit.authorLogin || hoveredCommit.authorName}
          </div>
        </FloatingCard>
      )}
    </div>
  );
}

function FloatingCard({
  clientX,
  clientY,
  containerRef,
  children,
}: {
  clientX: number;
  clientY: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect) return null;
  const localX = Math.min(clientX - rect.left + 12, rect.width - 280);
  const localY = Math.min(clientY - rect.top + 12, rect.height - 80);
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[260px] rounded-md border border-border bg-bg/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
      style={{ left: Math.max(8, localX), top: Math.max(8, localY) }}
    >
      {children}
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
    <g transform={`translate(${x}, ${y})`}>
      <rect
        rx={8}
        ry={8}
        width={w}
        height={h}
        fill={hexToRgba(color, 0.18)}
        stroke={hexToRgba(color, 0.55)}
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
  return Math.min(label.length, 28) * 6 + 24;
}

function sidewaysCurve(x1: number, y1: number, x2: number, y2: number) {
  // Horizontal S: control points pulled along the X axis so the bend happens
  // mid-column instead of mid-row.
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
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

export default BranchGraph;
