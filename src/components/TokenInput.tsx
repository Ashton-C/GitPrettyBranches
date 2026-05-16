"use client";

import { useState } from "react";
import { useToken } from "@/lib/token";

export function TokenInput() {
  const { token, setToken } = useToken();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const isSet = Boolean(token);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setDraft(token ?? "");
          setOpen((v) => !v);
        }}
        className={`text-xs rounded-md border px-2 py-1 transition-colors ${
          isSet
            ? "border-green-700 bg-green-900/30 text-green-400"
            : "border-border bg-bg-soft text-text-muted hover:text-text"
        }`}
        title="GitHub token settings"
      >
        {isSet ? "● Token set" : "○ Add token"}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-md border border-border bg-bg-soft p-3 shadow-xl">
          <div className="text-xs text-text-muted mb-2">
            Paste a GitHub personal access token to lift the 60 req/hr
            unauthenticated cap. Only <code>public_repo</code> read scope is
            needed. The token is stored in your browser&apos;s localStorage and
            sent only to api.github.com.
          </div>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ghp_..."
            className="w-full rounded border border-border bg-bg px-2 py-1 text-sm font-mono text-text outline-none focus:border-accent"
          />
          <div className="mt-2 flex justify-end gap-2 text-xs">
            <button
              onClick={() => {
                setToken("");
                setOpen(false);
              }}
              className="rounded border border-border px-2 py-1 text-text-muted hover:text-text"
            >
              Clear
            </button>
            <button
              onClick={() => {
                setToken(draft.trim());
                setOpen(false);
              }}
              className="rounded border border-accent bg-accent/10 px-2 py-1 text-accent"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
