"use client";

import { useCallback, useState } from "react";
import {
  GitHubError,
  getBranches,
  getCommitsForBranch,
  type GitHubBranch,
  type GitHubCommit,
  type GitHubRepo,
} from "@/lib/github";
import { buildGraph, type GraphData } from "@/lib/graph";
import { useToken } from "@/lib/token";
import { BranchGraph } from "./BranchGraph";
import { Legend } from "./Legend";

type Props = {
  repo: GitHubRepo;
  owner: string;
  /** If true, expand and start loading on mount. */
  autoExpand?: boolean;
};

type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; step: string }
  | { kind: "ready"; graph: GraphData; branchCount: number; commitCount: number }
  | { kind: "error"; message: string };

const COMMITS_PER_BRANCH = 30;
const MAX_BRANCHES_TO_FETCH = 25;

export function RepoCard({ repo, owner, autoExpand = false }: Props) {
  const [expanded, setExpanded] = useState(autoExpand);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const { token } = useToken();

  const load = useCallback(async () => {
    setState({ kind: "loading", step: "Fetching branches…" });
    try {
      const branches = await getBranches(owner, repo.name, token ?? undefined);
      if (branches.length === 0) {
        setState({
          kind: "ready",
          graph: { commits: [], edges: [], branchTips: [], laneCount: 0 },
          branchCount: 0,
          commitCount: 0,
        });
        return;
      }

      // Cap branches to keep API usage sane. Default branch always included;
      // others picked in alphabetical order (deterministic).
      const sorted = [...branches].sort((a, b) => {
        if (a.name === repo.default_branch) return -1;
        if (b.name === repo.default_branch) return 1;
        return a.name.localeCompare(b.name);
      });
      const picked = sorted.slice(0, MAX_BRANCHES_TO_FETCH);

      setState({
        kind: "loading",
        step: `Fetching commits for ${picked.length} branch${picked.length === 1 ? "" : "es"}…`,
      });

      const commitsByBranch = new Map<string, GitHubCommit[]>();
      // Parallelize commit fetches per branch.
      await Promise.all(
        picked.map(async (b: GitHubBranch) => {
          try {
            const cs = await getCommitsForBranch(
              owner,
              repo.name,
              b.commit.sha,
              token ?? undefined,
              COMMITS_PER_BRANCH,
            );
            commitsByBranch.set(b.name, cs);
          } catch {
            // Skip individual branch failures rather than failing the whole repo.
          }
        }),
      );

      const graph = buildGraph(picked, commitsByBranch, repo.default_branch);
      const commitCount = new Set(
        [...commitsByBranch.values()].flat().map((c) => c.sha),
      ).size;
      setState({
        kind: "ready",
        graph,
        branchCount: branches.length,
        commitCount,
      });
    } catch (err) {
      const message =
        err instanceof GitHubError
          ? `GitHub error (${err.status}): ${err.message}`
          : err instanceof Error
          ? err.message
          : "Unknown error";
      setState({ kind: "error", message });
    }
  }, [owner, repo.default_branch, repo.name, token]);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && state.kind === "idle") load();
  }

  return (
    <div className="rounded-lg border border-border bg-bg-soft overflow-hidden">
      <button
        onClick={toggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-bg-softer transition-colors"
      >
        <span
          className="mt-1 text-text-muted text-xs"
          style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
        >
          ▶
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <a
              href={repo.html_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-accent hover:underline truncate"
            >
              {repo.name}
            </a>
            {repo.fork && (
              <span className="text-[10px] uppercase rounded border border-border px-1.5 py-px text-text-muted">
                fork
              </span>
            )}
            {repo.archived && (
              <span className="text-[10px] uppercase rounded border border-yellow-700 bg-yellow-900/30 px-1.5 py-px text-yellow-400">
                archived
              </span>
            )}
            {repo.language && (
              <span className="text-xs text-text-muted">{repo.language}</span>
            )}
            <span className="text-xs text-text-muted">
              ★ {repo.stargazers_count}
            </span>
            <span className="text-xs text-text-muted">
              updated {new Date(repo.pushed_at).toLocaleDateString()}
            </span>
          </div>
          {repo.description && (
            <div className="mt-1 text-sm text-text-muted truncate">
              {repo.description}
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4">
          {state.kind === "loading" && (
            <div className="text-sm text-text-muted">
              <span className="inline-block animate-pulse">●</span> {state.step}
            </div>
          )}
          {state.kind === "error" && (
            <div className="flex items-start justify-between gap-3 rounded border border-red-900/50 bg-red-900/20 px-3 py-2 text-sm text-red-400">
              <span>{state.message}</span>
              <button
                onClick={load}
                className="shrink-0 rounded border border-red-900/50 px-2 py-0.5 text-xs hover:bg-red-900/30"
              >
                Retry
              </button>
            </div>
          )}
          {state.kind === "ready" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-text-muted">
                  {state.branchCount} branch{state.branchCount === 1 ? "" : "es"}
                  {" · "}
                  {state.commitCount} unique commit{state.commitCount === 1 ? "" : "s"}
                  {" loaded"}
                  {state.branchCount > MAX_BRANCHES_TO_FETCH &&
                    ` (showing first ${MAX_BRANCHES_TO_FETCH})`}
                </div>
                <button
                  onClick={load}
                  className="text-xs text-text-muted hover:text-text"
                >
                  ⟳ Refresh
                </button>
              </div>
              <Legend branchTips={state.graph.branchTips} />
              <BranchGraph graph={state.graph} repoUrl={repo.html_url} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
