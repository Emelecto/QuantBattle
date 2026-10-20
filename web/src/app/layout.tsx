import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { TopBarGate, FooterGate } from "@/components/TopBarGate";
import { ToastProvider } from "@/components/ui/Toast";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { getSiteUrl } from "@/lib/site";

const SITE_URL = getSiteUrl();
const SITE_TITLE = "QuantLab — Investigación cuantitativa y torneos de machine learning";
const SITE_DESCRIPTION =
  "Prototipo de investigación en español: experimenta con modelos, participa en torneos de predicciones y compara resultados reproducibles.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · QuantLab",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "trading cuantitativo",
    "backtesting",
    "walk-forward",
    "out-of-sample",
    "overfitting",
    "estrategias de trading",
    "torneos de trading",
    "quant",
  ],
  authors: [{ name: "QuantLab" }],
  creator: "QuantLab",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: "/",
    siteName: "QuantLab",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "QuantLab" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#06090f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-ink">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "QuantLab",
              url: SITE_URL,
              description: SITE_DESCRIPTION,
              inLanguage: "es",
            }),
          }}
        />
        <AnalyticsProvider />
        <ToastProvider>
          <TopBarGate />
          <main className="flex flex-1 flex-col">{children}</main>
          <FooterGate />
        </ToastProvider>
      </body>
    </html>
  );
}
