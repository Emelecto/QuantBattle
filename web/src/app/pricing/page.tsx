import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

export default function PricingPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Acceso al prototipo de investigación</h1>
      <p className="mt-6 text-base leading-relaxed text-muted">QuantLab se encuentra en evaluación académica en el semillero DeepFin de la Universidad EIA. Los torneos ML de práctica son gratuitos, usan datos sintéticos y no distribuyen premios QP.</p>
      <p className="mt-4 text-base leading-relaxed text-muted">Los pagos están desactivados en esta entrega. Los QP existentes son puntos virtuales sin valor monetario. Los planes comerciales y la evaluación de mercados reales requieren un desarrollo y una validación posteriores.</p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link href="/app/tournaments" className={buttonClasses("primary", "md")}>Explorar torneos</Link>
        <Link href="/docs#evaluacion" className={buttonClasses("secondary", "md")}>Ver evidencia técnica</Link>
      </div>
    </section>
  );
}
