import { TokenInput } from "@/components/TokenInput";
import { UsernameForm } from "@/components/UsernameForm";

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="font-mono text-sm">
          <span className="text-accent">git</span>
          <span className="text-text">pretty</span>
          <span className="text-text-muted">branches</span>
        </div>
        <TokenInput />
      </header>

      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          See every branch.
          <br />
          <span className="text-text-muted">For every repo.</span>
        </h1>
        <p className="mt-4 max-w-xl text-text-muted">
          Enter a GitHub username. We&apos;ll render zoomable branch and commit
          graphs for each public repo — like VS Code&apos;s source view, but
          for an entire account.
        </p>
        <div className="mt-8 flex w-full justify-center">
          <UsernameForm />
        </div>
        <div className="mt-4 text-xs text-text-muted">
          Try{" "}
          {[
            "torvalds",
            "gaearon",
            "sindresorhus",
            "tj",
          ].map((u, i) => (
            <span key={u}>
              {i > 0 && " · "}
              <a
                href={`/${u}`}
                className="text-accent hover:underline"
              >
                {u}
              </a>
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-20 text-sm text-text-muted">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature
            title="All branches"
            body="Every branch tip, with merge lines colored consistently across the graph."
          />
          <Feature
            title="Zoomable"
            body="Cmd/Ctrl + scroll to zoom. Drag to pan the page. Click a commit to open it on GitHub."
          />
          <Feature
            title="On-demand"
            body="Repos load only when you expand them. Bring your own GitHub token for the 5000 req/hr cap."
          />
        </div>
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-soft p-4">
      <div className="font-medium text-text">{title}</div>
      <div className="mt-1 text-xs">{body}</div>
    </div>
  );
}
