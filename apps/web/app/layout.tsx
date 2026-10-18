import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata = {
  title: "Provenance — codebase memory",
  description:
    "Trace the decisions, people, and incidents behind every code change.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
