"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UsernameForm({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim().replace(/^@/, "");
    if (!v) return;
    router.push(`/${encodeURIComponent(v)}`);
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="github username (e.g. torvalds)"
        className="flex-1 rounded-md border border-border bg-bg-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        spellCheck={false}
        autoComplete="off"
      />
      <button
        type="submit"
        className="rounded-md border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20"
      >
        Visualize →
      </button>
    </form>
  );
}
