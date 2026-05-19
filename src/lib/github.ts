export type GitHubUser = {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
  html_url: string;
};

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  pushed_at: string;
  fork: boolean;
  archived: boolean;
};

export type GitHubBranch = {
  name: string;
  commit: { sha: string; url: string };
  protected: boolean;
};

export type GitHubCommit = {
  sha: string;
  parents: { sha: string }[];
  commit: {
    author: { name: string; email: string; date: string } | null;
    committer: { name: string; email: string; date: string } | null;
    message: string;
  };
  author: { login: string; avatar_url: string } | null;
};

const API = "https://api.github.com";

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function gh<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: headers(token) });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && body.message) msg = body.message;
    } catch {}
    throw new GitHubError(msg, res.status);
  }
  return (await res.json()) as T;
}

export async function getUser(login: string, token?: string) {
  return gh<GitHubUser>(`/users/${encodeURIComponent(login)}`, token);
}

export async function getUserRepos(
  login: string,
  token?: string,
  max = 100,
): Promise<GitHubRepo[]> {
  const out: GitHubRepo[] = [];
  let page = 1;
  while (out.length < max) {
    const batch = await gh<GitHubRepo[]>(
      `/users/${encodeURIComponent(login)}/repos?per_page=100&page=${page}&sort=pushed`,
      token,
    );
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return out.slice(0, max);
}

export async function getBranches(
  owner: string,
  repo: string,
  token?: string,
): Promise<GitHubBranch[]> {
  const out: GitHubBranch[] = [];
  let page = 1;
  while (true) {
    const batch = await gh<GitHubBranch[]>(
      `/repos/${owner}/${repo}/branches?per_page=100&page=${page}`,
      token,
    );
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
    page += 1;
    if (page > 5) break;
  }
  return out;
}

export async function getCommitsForBranch(
  owner: string,
  repo: string,
  sha: string,
  token?: string,
  perPage = 30,
): Promise<GitHubCommit[]> {
  return gh<GitHubCommit[]>(
    `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(sha)}&per_page=${perPage}`,
    token,
  );
}

export type RateLimit = {
  resources: { core: { limit: number; remaining: number; reset: number } };
};

export async function getRateLimit(token?: string) {
  return gh<RateLimit>("/rate_limit", token);
}
