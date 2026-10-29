import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog de trading cuantitativo",
  description:
    "Artículos sobre trading cuantitativo, backtesting walk-forward, machine learning y la comunidad QuantBattle.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog de QuantBattle",
    description:
      "Trading cuantitativo, backtesting walk-forward y machine learning, en español.",
    url: "/blog",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <main className="flex min-h-screen flex-col">
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-4xl px-6 py-16">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            Blog de QuantBattle
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Artículos sobre trading cuantitativo, backtesting, machine learning y
            la comunidad QuantBattle.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="qb-glass qb-elev-1 rounded-xl p-5 hover:border-accent/30 transition-colors block"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-ink">
                    {post.title}
                  </h2>
                  <p className="text-sm text-muted mt-1">{post.description}</p>
                  <div className="flex gap-3 mt-2 text-xs text-muted">
                    <span>
                      {new Date(post.date).toLocaleDateString("es", {
                        dateStyle: "medium",
                      })}
                    </span>
                    <span>·</span>
                    <span>{post.readTime}</span>
                  </div>
                </div>
                <span className="text-accent text-sm whitespace-nowrap">
                  Leer →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="border-t border-line">
        <div className="mx-auto w-full max-w-4xl px-6 py-4">
          <p className="text-[11px] text-muted">
            QuantBattle es una herramienta de investigación. No es asesoría
            financiera.
          </p>
        </div>
      </div>
    </main>
  );
}
