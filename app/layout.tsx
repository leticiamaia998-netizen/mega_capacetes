import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MegaCapacetes",
  description:
    "Peças, capacetes e acessórios para motocicletas com frete grátis para todo o Brasil.",
  authors: [{ name: "MegaCapacetes" }],
  icons: {
    icon: "/assets/remotox-icon.svg",
    shortcut: "/assets/remotox-icon.svg",
  },
  openGraph: {
    title: "MegaCapacetes",
    description:
      "Peças, capacetes e acessórios para motocicletas com frete grátis para todo o Brasil.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MegaCapacetes",
    description:
      "Peças, capacetes e acessórios para motocicletas com frete grátis para todo o Brasil.",
  },
  other: {
    "codex-preview": "development",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="stylesheet"
          href="/_external/fonts.googleapis.com/css2.family_Space_Grotesk_wght_400_600_700_display_swap.css"
        />
        <link rel="stylesheet" href="/assets/index-DC5PKdK4.css" />
        <link
          rel="preload"
          as="image"
          href="/__l5e/assets-v1/5f51c317-8f3b-41ab-9444-e0b3111d5ab5/hero-banner.webp"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
