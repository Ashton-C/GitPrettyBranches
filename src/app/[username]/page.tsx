import Link from "next/link";
import { TokenInput } from "@/components/TokenInput";
import { UserPageClient } from "./UserPageClient";

export default async function UserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const decoded = decodeURIComponent(username);

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3 font-mono text-sm">
          <Link href="/" className="text-accent hover:underline">
            ←
          </Link>
          <span>
            <span className="text-accent">git</span>
            <span className="text-text">pretty</span>
            <span className="text-text-muted">branches</span>
          </span>
          <span className="text-text-muted">/</span>
          <span className="text-text">{decoded}</span>
        </div>
        <TokenInput />
      </header>

      <UserPageClient username={decoded} />
    </main>
  );
}
