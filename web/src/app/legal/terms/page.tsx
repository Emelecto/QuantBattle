import type { ReactNode } from "react";

/**
 * /legal/terms — Términos de Servicio de QuantBattle.
 * Server component estático. Español colombiano.
 */

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-8">
      <div className="flex items-baseline gap-3">
        <span className="metric text-[12px] text-muted">{n}</span>
        <h2 className="text-lg font-semibold tracking-tight text-ink">
          {title}
        </h2>
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

export const metadata = {
  title: "Términos de Servicio — QuantBattle",
};

export default function TermsPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pt-16 pb-20">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Términos de Servicio
      </h1>
      <p className="metric mt-3 text-[12px] text-muted">
        Última actualización: 25 de agosto de 2026
      </p>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
        Estos términos regulan el uso de QuantBattle, una plataforma de
        investigación cuantitativa. Al crear una cuenta o usar el servicio,
        aceptas este documento.
      </p>

      <div className="mt-10 space-y-10">
        <Section n="01" title="Naturaleza del servicio">
          <p>
            QuantBattle es una herramienta de investigación. Permite diseñar,
            probar y publicar estrategias de trading con validación fuera de
            muestra, y consultar reportes generados a partir de datos
            históricos.
          </p>
          <p>
            QuantBattle{" "}
            <strong className="text-ink">no presta asesoría financiera</strong>,
            bursátil ni de inversión, no recomienda comprar, vender o mantener
            instrumento alguno, no custodia fondos de los usuarios y no ejecuta
            órdenes en su nombre. Toda decisión tomada a partir de los
            reportes, métricas o contenido de la plataforma es responsabilidad
            exclusiva del usuario.
          </p>
        </Section>

        <Section n="02" title="QP: puntos virtuales sin valor monetario">
          <p>
            La plataforma opera con una unidad interna llamada QP, que se usa
            para funciones como suscribirse a estrategias del marketplace.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Los QP son puntos virtuales.{" "}
              <strong className="text-ink">
                No tienen valor monetario
              </strong>{" "}
              ni poder adquisitivo alguno.
            </li>
            <li>
              No pueden comprarse, venderse, canjearse por dinero, bienes o
              servicios, ni transferirse entre usuarios.
            </li>
            <li>
              No constituyen moneda, valores, instrumentos financieros ni
              activos criptográficos, y no generan ningún derecho de reembolso.
            </li>
            <li>
              Los saldos, los costes internos en QP y las reglas para obtenerlos
              son parte del servicio; QuantBattle puede ajustarlos para preservar
              la integridad de la plataforma, anunciando dentro de ella los
              cambios sustanciales.
            </li>
          </ul>
        </Section>

        <Section n="03" title="Cuenta y claves API">
          <p>
            Para usar el servicio se requiere una cuenta registrada con un
            correo electrónico válido. Eres responsable de mantener la
            confidencialidad de tu contraseña y de tus claves API de QuantBattle
            (las credenciales con prefijo <code className="metric rounded border border-line bg-surface-solid px-1 py-0.5 text-[12px] text-ink">qbt_</code>).
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Toda actividad realizada con tus credenciales o claves se presume
              autorizada por ti.
            </li>
            <li>
              Está prohibido compartir tus claves o incrustarlas en código,
              comentarios, descripciones u otro contenido publicado.
            </li>
            <li>
              Si sospechas que una clave fue comprometida, revócala de inmediato
              desde tu cuenta y avísale al soporte.
            </li>
          </ul>
          <p>
            QuantBattle puede suspender cuentas o revocar claves comprometidas, o
            que se usen para abusar del servicio.
          </p>
        </Section>

        <Section n="04" title="Contenido publicado por los usuarios">
          <p>
            Los comentarios, estrategias, código, descripciones y demás
            contenido que publiques conservan tu autoría. Al publicarlos,
            otorgas a QuantBattle una licencia no exclusiva, mundial y gratuita
            para alojarlos, reproducirlos y mostrarlos dentro de la plataforma,
            con el único fin de operar y mejorar el servicio.
          </p>
          <p>
            QuantBattle puede revisar, editar, limitar o retirar cualquier
            publicación que incumpla estos términos o afecte la convivencia de
            la comunidad. La moderación es{" "}
            <strong className="text-ink">discrecional</strong> y puede aplicarse
            sin aviso previo.
          </p>
          <p>Está prohibido publicar:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>spam o publicidad no solicitada;</li>
            <li>
              contenido dirigido a manipular rankings, métricas, torneos, votos
              o el marketplace;
            </li>
            <li>
              datos falsos, tergiversados o resultados que no provengan de la
              ejecución real del servicio;
            </li>
            <li>código malicioso o diseñado para explotar la plataforma;</li>
            <li>
              contenido ilegal conforme al ordenamiento colombiano o que
              suplante la identidad de terceros.
            </li>
          </ul>
        </Section>

        <Section n="05" title="Fuentes de datos de terceros">
          <p>
            Las cotizaciones e información de mercado procesadas por QuantBattle
            provienen de fuentes públicas como Binance, Bybit y Yahoo Finance.
            QuantBattle no controla esas fuentes y{" "}
            <strong className="text-ink">
              no garantiza su disponibilidad, exactitud, integridad ni
              oportunidad
            </strong>
            . Interrupciones, cambios o errores en ellas pueden afectar
            backtests, métricas y reportes. Dichas marcas pertenecen a sus
            respectivos titulares y no patrocinan ni se asocian con QuantBattle.
          </p>
        </Section>

        <Section n="06" title="Limitación de responsabilidad">
          <p>
            El servicio se ofrece «tal cual» y «según disponibilidad». En la
            máxima medida permitida por la ley aplicable, QuantBattle no responde
            por daños indirectos, incidentales, especiales o lucro cesante, ni
            por pérdidas de trading derivadas del uso de la plataforma, de sus
            métricas o del contenido publicado por otros usuarios.
          </p>
          <p>
            Los resultados de backtest son simulaciones históricas. El
            desempeño pasado —incluso validado fuera de muestra— no garantiza
            resultados futuros.
          </p>
        </Section>

        <Section n="07" title="Ley aplicable y jurisdicción">
          <p>
            Estos términos se rigen por las leyes de la República de Colombia.
            Cualquier controversia relacionada con el servicio será resuelta
            por los jueces competentes de la República de Colombia, renunciando
            las partes a cualquier otro fuero que pudiera corresponderles.
          </p>
        </Section>

        <Section n="08" title="Cambios a estos términos">
          <p>
            QuantBattle puede actualizar estos términos. La versión vigente se
            publica siempre en esta página con su fecha de actualización, y los
            cambios sustanciales se anunciarán dentro de la plataforma con una
            antelación razonable.
          </p>
          <p>
            El uso continuado del servicio después de entrar en vigencia una
            nueva versión implica su aceptación. Si no estás de acuerdo con los
            cambios, debes dejar de usar el servicio.
          </p>
        </Section>
      </div>

      <p className="metric mt-12 text-[11px] text-muted">
        Esto no es asesoría legal profesional.
      </p>
    </section>
  );
}
