"use client";

import { useEffect, useMemo, useState } from "react";
import { useToken } from "@/lib/token";
import {
  GitHubError,
  getUser,
  getUserRepos,
  type GitHubRepo,
  type GitHubUser,
} from "@/lib/github";
import { RepoCard } from "@/components/RepoCard";

type State =
  | { kind: "loading" }
  | { kind: "ready"; user: GitHubUser; repos: GitHubRepo[] }
  | { kind: "error"; message: string; status?: number };

type Filter = "all" | "sources" | "active";
type Sort = "updated" | "stars" | "name";

export function UserPageClient({ username }: { username: string }) {
  const { token } = useToken();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated");

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const [user, repos] = await Promise.all([
          getUser(username, token ?? undefined),
          getUserRepos(username, token ?? undefined),
        ]);
        if (!cancelled) setState({ kind: "ready", user, repos });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof GitHubError) {
          setState({ kind: "error", message: err.message, status: err.status });
        } else {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, token]);

  const filteredRepos = useMemo(() => {
    if (state.kind !== "ready") return [];
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    return state.repos
      .filter((r) => {
        if (filter === "sources" && r.fork) return false;
        if (filter === "active" && Date.parse(r.pushed_at) < ninetyDaysAgo)
          return false;
        if (query && !r.name.toLowerCase().includes(query.toLowerCase()))
          return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === "stars") return b.stargazers_count - a.stargazers_count;
        if (sort === "name") return a.name.localeCompare(b.name);
        return Date.parse(b.pushed_at) - Date.parse(a.pushed_at);
      });
  }, [state, query, filter, sort]);

  if (state.kind === "loading") {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center text-text-muted">
        <div className="animate-pulse">Loading {username}…</div>
      </div>
    );
  }

  if (state.kind === "error") {
    const rateLimited =
      state.status === 403 && /rate limit/i.test(state.message);
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-md border border-red-900/50 bg-red-900/20 p-4 text-sm">
          <div className="font-medium text-red-400">
            {state.status === 404
              ? `User "${username}" not found.`
              : "Failed to load user."}
          </div>
          <div className="mt-2 text-red-300/80">{state.message}</div>
          {rateLimited && (
            <div className="mt-3 text-text-muted">
              You&apos;ve hit the unauthenticated rate limit. Click{" "}
              <strong>Add token</strong> in the top right to use a personal
              access token.
            </div>
          )}
        </div>
      </div>
    );
  }

  const { user, repos } = state;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* User card */}
      <div className="mb-6 flex items-center gap-4 rounded-lg border border-border bg-bg-soft p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user.avatar_url}
          alt={user.login}
          width={64}
          height={64}
          className="h-16 w-16 rounded-full border border-border"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <a
              href={user.html_url}
              target="_blank"
              rel="noreferrer"
              className="text-lg font-semibold text-accent hover:underline"
            >
              {user.name || user.login}
            </a>
            <span className="font-mono text-sm text-text-muted">
              @{user.login}
            </span>
          </div>
          {user.bio && (
            <div className="mt-1 text-sm text-text-muted">{user.bio}</div>
          )}
          <div className="mt-2 text-xs text-text-muted">
            {user.public_repos} repos · {user.followers} followers ·{" "}
            {user.following} following
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter repos…"
          className="flex-1 min-w-[200px] rounded-md border border-border bg-bg-soft px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "sources", label: "Sources" },
            { value: "active", label: "Active (90d)" },
          ]}
        />
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: "updated", label: "Updated" },
            { value: "stars", label: "Stars" },
            { value: "name", label: "Name" },
          ]}
        />
      </div>

      {/* Repos */}
      {filteredRepos.length === 0 ? (
        <div className="rounded-md border border-border bg-bg-soft p-6 text-center text-sm text-text-muted">
          {repos.length === 0
            ? "This user has no public repositories."
            : "No repositories match your filters."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredRepos.map((r, i) => (
            <RepoCard
              key={r.id}
              repo={r}
              owner={user.login}
              autoExpand={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-bg-soft p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded px-2 py-1 ${
            value === o.value
              ? "bg-accent/15 text-accent"
              : "text-text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
