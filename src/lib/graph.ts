import type { GitHubBranch, GitHubCommit } from "./github";

export type GraphCommit = {
  sha: string;
  parents: string[];
  message: string;
  authorName: string;
  authorLogin: string | null;
  authorAvatar: string | null;
  date: string;
  branches: string[];
  lane: number;
  row: number;
  color: string;
};

export type GraphEdge = {
  fromSha: string;
  toSha: string;
  fromLane: number;
  toLane: number;
  fromRow: number;
  toRow: number;
  color: string;
};

export type GraphData = {
  commits: GraphCommit[];
  edges: GraphEdge[];
  branchTips: { name: string; sha: string; color: string; lane: number }[];
  laneCount: number;
};

// Color palette tuned for a dark background. Repeats if there are many lanes.
export const LANE_COLORS = [
  "#58a6ff",
  "#f778ba",
  "#3fb950",
  "#d29922",
  "#a371f7",
  "#ff7b72",
  "#79c0ff",
  "#ffa657",
  "#56d4dd",
  "#bc8cff",
  "#7ee787",
  "#ffb4a2",
];

function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

/**
 * Build a graph layout from raw GitHub commits across branches.
 *
 * Algorithm:
 *   1. Deduplicate commits and record which branches contain each SHA.
 *   2. Topologically order so children come before parents (newest first).
 *   3. Walk the ordered list assigning each commit to a "lane" using an
 *      active-lane table keyed by the SHA that lane is currently waiting on.
 *      A merge commit keeps its lane on the first parent and pushes other
 *      parents onto fresh lanes (preferring to reuse the lane of the branch
 *      that owns that parent).
 */
export function buildGraph(
  branches: GitHubBranch[],
  branchCommits: Map<string, GitHubCommit[]>,
  defaultBranch: string,
): GraphData {
  const byBranch = new Map<string, GitHubCommit[]>();
  for (const b of branches) {
    const cs = branchCommits.get(b.name);
    if (cs) byBranch.set(b.name, cs);
  }

  // 1. Merge all commits into a single map; remember which branches own each.
  const commits = new Map<string, GitHubCommit>();
  const branchesBySha = new Map<string, Set<string>>();
  for (const [branchName, cs] of byBranch) {
    for (const c of cs) {
      if (!commits.has(c.sha)) commits.set(c.sha, c);
      let set = branchesBySha.get(c.sha);
      if (!set) {
        set = new Set();
        branchesBySha.set(c.sha, set);
      }
      set.add(branchName);
    }
  }

  // 2. Topological order with a date tiebreaker (newer first).
  const ordered = topoOrder(commits);

  // 3. Lane assignment.
  // activeLanes[i] = SHA that lane i is currently expecting next, or null if free.
  const activeLanes: (string | null)[] = [];
  const commitMeta = new Map<string, { lane: number; row: number; color: string }>();
  const edges: GraphEdge[] = [];

  // Seed: place each branch tip on its own lane (default branch first → leftmost).
  const tipOrder = [...byBranch.keys()].sort((a, b) => {
    if (a === defaultBranch) return -1;
    if (b === defaultBranch) return 1;
    return a.localeCompare(b);
  });
  const tipShaToBranch = new Map<string, string[]>();
  for (const name of tipOrder) {
    const cs = byBranch.get(name);
    if (!cs || cs.length === 0) continue;
    const tipSha = cs[0].sha;
    const list = tipShaToBranch.get(tipSha) ?? [];
    list.push(name);
    tipShaToBranch.set(tipSha, list);
  }

  function claimFreeLane(forSha: string): number {
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] === null) {
        activeLanes[i] = forSha;
        return i;
      }
    }
    activeLanes.push(forSha);
    return activeLanes.length - 1;
  }

  // Pre-assign tip lanes in branch order so default branch ends up on lane 0.
  for (const name of tipOrder) {
    const cs = byBranch.get(name);
    if (!cs || cs.length === 0) continue;
    const tipSha = cs[0].sha;
    // If another branch tip already claimed a lane for this SHA, share it.
    const existing = activeLanes.indexOf(tipSha);
    if (existing === -1) claimFreeLane(tipSha);
  }

  let row = 0;
  for (const sha of ordered) {
    const commit = commits.get(sha)!;

    // Find every lane currently waiting on this SHA.
    const waitingLanes: number[] = [];
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] === sha) waitingLanes.push(i);
    }

    let myLane: number;
    if (waitingLanes.length === 0) {
      // Nobody is waiting (e.g., orphan commit or detached history). Claim one.
      myLane = claimFreeLane(sha);
      waitingLanes.push(myLane);
    } else {
      myLane = Math.min(...waitingLanes);
    }

    const color = laneColor(myLane);
    commitMeta.set(sha, { lane: myLane, row, color });

    // Free any other lanes that converged on this commit; emit merge-in edges.
    for (const lane of waitingLanes) {
      if (lane !== myLane) {
        activeLanes[lane] = null;
      }
    }

    // Replace my lane with the first parent (linear history continuation).
    activeLanes[myLane] = commit.parents[0]?.sha ?? null;

    // Each additional parent gets a fresh lane (a merge bringing in another line).
    for (let i = 1; i < commit.parents.length; i++) {
      const psha = commit.parents[i].sha;
      const existing = activeLanes.indexOf(psha);
      if (existing === -1) claimFreeLane(psha);
    }

    // Emit edges from this commit DOWN to each parent. Parent rows aren't
    // known yet, so we defer and record SHA references; we'll resolve below.
    for (const p of commit.parents) {
      edges.push({
        fromSha: sha,
        toSha: p.sha,
        fromLane: myLane,
        toLane: -1, // filled in second pass
        fromRow: row,
        toRow: -1,
        color,
      });
    }

    row += 1;
  }

  // Resolve edge endpoints now that every commit has a row/lane.
  const resolvedEdges: GraphEdge[] = [];
  for (const e of edges) {
    const meta = commitMeta.get(e.toSha);
    if (!meta) continue; // parent not loaded (history truncated) — drop edge
    resolvedEdges.push({
      ...e,
      toLane: meta.lane,
      toRow: meta.row,
      // Color edge by the parent's lane when it differs (looks more natural
      // for merges, matching what VS Code / GitKraken do).
      color: e.fromLane === meta.lane ? e.color : laneColor(e.fromLane),
    });
  }

  const graphCommits: GraphCommit[] = ordered.map((sha) => {
    const c = commits.get(sha)!;
    const meta = commitMeta.get(sha)!;
    const author = c.commit.author ?? c.commit.committer;
    return {
      sha,
      parents: c.parents.map((p) => p.sha),
      message: c.commit.message.split("\n")[0],
      authorName: author?.name ?? "unknown",
      authorLogin: c.author?.login ?? null,
      authorAvatar: c.author?.avatar_url ?? null,
      date: author?.date ?? "",
      branches: [...(branchesBySha.get(sha) ?? [])],
      lane: meta.lane,
      row: meta.row,
      color: meta.color,
    };
  });

  const branchTips = [...byBranch.entries()]
    .map(([name, cs]) => {
      const tipSha = cs[0]?.sha;
      const meta = tipSha ? commitMeta.get(tipSha) : undefined;
      if (!meta) return null;
      return { name, sha: tipSha, color: meta.color, lane: meta.lane };
    })
    .filter((x): x is { name: string; sha: string; color: string; lane: number } => !!x)
    .sort((a, b) => {
      if (a.name === defaultBranch) return -1;
      if (b.name === defaultBranch) return 1;
      return a.lane - b.lane;
    });

  // Compute final lane count from observed commits (active lanes may have
  // grown beyond what's actually used).
  let laneCount = 0;
  for (const c of graphCommits) {
    if (c.lane + 1 > laneCount) laneCount = c.lane + 1;
  }

  return { commits: graphCommits, edges: resolvedEdges, branchTips, laneCount };
}

/**
 * Topological sort: children before parents (newest commits first). Ties are
 * broken by commit date (most recent first).
 */
function topoOrder(commits: Map<string, GitHubCommit>): string[] {
  // In-degree = number of children inside the loaded set. We start with nodes
  // that no loaded commit lists as a parent (these are branch tips or the
  // newest commits).
  const childCount = new Map<string, number>();
  for (const sha of commits.keys()) childCount.set(sha, 0);
  for (const c of commits.values()) {
    for (const p of c.parents) {
      if (childCount.has(p.sha)) {
        childCount.set(p.sha, (childCount.get(p.sha) ?? 0) + 1);
      }
    }
  }

  const ready: string[] = [];
  for (const [sha, n] of childCount) if (n === 0) ready.push(sha);

  const dateOf = (sha: string) => {
    const c = commits.get(sha);
    const d = c?.commit.author?.date ?? c?.commit.committer?.date;
    return d ? Date.parse(d) : 0;
  };
  // Max-heap by date isn't worth the complexity for ~hundreds of commits;
  // resort the ready queue when we pull from it.
  const out: string[] = [];
  const seen = new Set<string>();
  while (ready.length > 0) {
    ready.sort((a, b) => dateOf(b) - dateOf(a));
    const sha = ready.shift()!;
    if (seen.has(sha)) continue;
    seen.add(sha);
    out.push(sha);
    const c = commits.get(sha);
    if (!c) continue;
    for (const p of c.parents) {
      if (!childCount.has(p.sha)) continue;
      const n = (childCount.get(p.sha) ?? 1) - 1;
      childCount.set(p.sha, n);
      if (n === 0) ready.push(p.sha);
    }
  }

  // Fallback for any commits left over due to cycles (shouldn't happen in git
  // but the loaded subset can technically have missing parents that confuse
  // counts). Append by date.
  if (out.length < commits.size) {
    const remaining = [...commits.keys()].filter((s) => !seen.has(s));
    remaining.sort((a, b) => dateOf(b) - dateOf(a));
    out.push(...remaining);
  }

  return out;
}
