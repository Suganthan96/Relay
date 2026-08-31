import type { Metadata } from "next";

import "@/styles/framer.css";
import "@/styles/breakpoints.css";

const FAVICON = "/images/relay-logo.png";
const OG_IMAGE =
  "https://framerusercontent.com/assets/LaGEDiVbTeEg75rIXlNKdeL8x4.png";

const DESCRIPTION =
  "Relay is a trust layer for autonomous coding agents. It takes a GitHub issue to a ready-to-merge pull request with four Claude agents, gates every handoff on a signed reputation score, and never merges without a human.";

export const metadata: Metadata = {
  title: "Relay - A trust layer for coding agents",
  description: DESCRIPTION,
  metadataBase: new URL("https://cosmoq.framer.website/"),
  alternates: { canonical: "/" },
  robots: { "max-image-preview": "large" },
  icons: { icon: FAVICON, apple: FAVICON },
  openGraph: {
    type: "website",
    url: "https://cosmoq.framer.website/",
    title: "Relay - A trust layer for coding agents",
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay - A trust layer for coding agents",
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export const viewport = { width: "device-width" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
