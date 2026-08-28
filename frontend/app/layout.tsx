import type { Metadata } from "next";

import "@/styles/framer.css";
import "@/styles/breakpoints.css";

const FAVICON =
  "https://framerusercontent.com/images/1VtXtUrlVK0Y1WHlW4GIfnhxFho.png";
const OG_IMAGE =
  "https://framerusercontent.com/assets/LaGEDiVbTeEg75rIXlNKdeL8x4.png";

const DESCRIPTION =
  "COSMOQ is a modern Framer template built for AI startups and enterprises. Launch fast, scale easily, and showcase your AI products, workflows, and services with clarity, style, and impact—all in one powerful, responsive design.";

export const metadata: Metadata = {
  title: "COSMOQ - Automation and AI Agent Template",
  description: DESCRIPTION,
  metadataBase: new URL("https://cosmoq.framer.website/"),
  alternates: { canonical: "/" },
  robots: { "max-image-preview": "large" },
  icons: { icon: FAVICON, apple: FAVICON },
  openGraph: {
    type: "website",
    url: "https://cosmoq.framer.website/",
    title: "COSMOQ - Automation and AI Agent Template",
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "COSMOQ - Automation and AI Agent Template",
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
