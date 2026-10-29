import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPostBySlug, markdownToHtml, getAllPosts } from "@/lib/blog";
import "./blog-article.css";

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  const url = `/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.date || undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const htmlContent = await markdownToHtml(post.content);

  return (
    <main className="flex min-h-screen flex-col">
      <article className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <Link
          href="/blog"
          className="text-sm text-muted hover:text-accent transition-colors"
        >
          ← Volver al blog
        </Link>

        <header className="mt-6 mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            {post.title}
          </h1>
          <p className="text-base text-muted mt-3">{post.description}</p>
          <div className="flex gap-3 mt-4 text-sm text-muted">
            <span>
              {new Date(post.date).toLocaleDateString("es", {
                dateStyle: "long",
              })}
            </span>
            <span>·</span>
            <span>{post.readTime}</span>
          </div>
        </header>

        <div
          className="qb-blog-article prose prose-headings:text-ink prose-p:text-muted prose-strong:text-ink prose-a:text-accent prose-li:text-muted max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </article>

      <div className="border-t border-line">
        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          <p className="text-[11px] text-muted">
            QuantBattle es una herramienta de investigación. No es asesoría
            financiera.
          </p>
        </div>
      </div>
    </main>
  );
}
