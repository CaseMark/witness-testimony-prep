import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Testimony Prep Tool | Case.dev",
  description: "Prepare witnesses for cross-examination with AI-generated questions and practice sessions",
  keywords: ["testimony", "witness preparation", "cross-examination", "legal", "deposition"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
