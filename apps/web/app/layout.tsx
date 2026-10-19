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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Comic+Neue:ital,wght@0,400;0,700;1,400;1,700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Patrick+Hand&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Space+Grotesk:wght@500;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
