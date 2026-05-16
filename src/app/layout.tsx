import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitPrettyBranches",
  description:
    "Visualize every branch and commit across a GitHub user's public repos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text antialiased">
        {children}
      </body>
    </html>
  );
}
