import Link from "next/link";

export function Footer({ landing = false }: { landing?: boolean }) {
  return (
    <footer className={`mt-auto bg-surface${landing ? " ql-public-footer--landing" : ""}`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <Link href="/docs" className="transition-colors hover:text-ink">
            Docs
          </Link>
          <span aria-hidden className="text-line">
            ·
          </span>
          <Link href="/changelog" className="transition-colors hover:text-ink">
            Changelog
          </Link>
          <span aria-hidden className="text-line">
            ·
          </span>
          <Link href="/status" className="transition-colors hover:text-ink">
            Estado
          </Link>
          <span aria-hidden className="text-line">
            ·
          </span>
          <Link href="/legal" className="transition-colors hover:text-ink">
            Legales
          </Link>
          <span aria-hidden className="text-line">
            ·
          </span>
          <Link href="/disclaimer" className="transition-colors hover:text-ink">
            Disclaimer
          </Link>
          <span aria-hidden className="text-line">
            ·
          </span>
          <a
            href="https://github.com/Emelecto/QuantLab"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-ink"
          >
            GitHub
          </a>
        </div>
        <p className="max-w-xl text-[13px] leading-relaxed text-muted">
          QuantLab es una herramienta de investigación. No es asesoría
          financiera ni recomendación de inversión.
        </p>
      </div>
    </footer>
  );
}
