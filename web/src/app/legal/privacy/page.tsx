import type { ReactNode } from "react";

/**
 * /legal/privacy — Política de Privacidad de QuantBattle.
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
  title: "Política de Privacidad — QuantBattle",
};

export default function PrivacyPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pt-16 pb-20">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Política de Privacidad
      </h1>
      <p className="metric mt-3 text-[12px] text-muted">
        Última actualización: 25 de agosto de 2026
      </p>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
        Esta política explica qué datos recoge QuantBattle, cómo los trata y qué
        derechos tienes. Tratamos los datos personales conforme a la Ley 1581
        de 2012 y sus decretos reglamentarios (régimen colombiano de protección
        de datos).
      </p>

      <div className="mt-10 space-y-10">
        <Section n="01" title="Datos que recogemos">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink">Cuenta:</strong> correo electrónico,
              gestionado a través de la autenticación de Supabase, y nombre de
              usuario público.
            </li>
            <li>
              <strong className="text-ink">Contenido que publicas
              voluntariamente:</strong> estrategias (título, descripción,
              símbolos, parámetros), su código fuente y comentarios.
            </li>
            <li>
              <strong className="text-ink">Participaciones:</strong>{" "}
              submissions a torneos y sus resultados agregados.
            </li>
            <li>
              <strong className="text-ink">Actividad social:</strong> follows,
              votos y demás interacciones que aparecen en tu perfil y en el
              feed público.
            </li>
          </ul>
          <p>
            Tu perfil y todo lo que publiques son visibles para otros usuarios
            de la plataforma: publica solo lo que quieras compartir.
          </p>
        </Section>

        <Section n="02" title="Cookies y sesión">
          <p>
            Usamos únicamente cookies estrictamente necesarias para mantener tu
            sesión iniciada, gestionadas por Supabase Auth. No usamos cookies
            publicitarias ni cookies de seguimiento de terceros. Si borras
            esas cookies desde tu navegador, se cerrará tu sesión.
          </p>
        </Section>

        <Section n="03" title="Uso de los datos">
          <p>
            Usamos tus datos para autenticarte, guardar y mostrar el contenido
            que publicas, calcular rankings, operar torneos y el marketplace,
            moderar la comunidad y comunicar novedades del servicio.
          </p>
          <p>
            <strong className="text-ink">
              No vendemos, alquilamos ni cedemos tus datos personales
            </strong>{" "}
            a terceros con fines comerciales o publicitarios.
          </p>
        </Section>

        <Section n="04" title="Proveedores y fuentes de datos">
          <p>El servicio opera con los siguientes proveedores:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink">Supabase:</strong> autenticación y
              base de datos.
            </li>
            <li>
              <strong className="text-ink">Vercel:</strong> alojamiento de la
              aplicación web.
            </li>
            <li>
              <strong className="text-ink">Render:</strong> infraestructura del
              worker de backtesting.
            </li>
          </ul>
          <p>
            Las cotizaciones provienen de Binance, Bybit y Yahoo Finance como
            fuentes públicas de datos de mercado. Se consultan desde servidores
            de QuantBattle, sin asociarlas a tu identidad; cada plataforma aplica
            sus propias políticas de privacidad sobre sus servicios.
          </p>
        </Section>

        <Section n="05" title="Tus derechos y eliminación de cuenta">
          <p>
            Puedes conocer, actualizar y rectificar tus datos personales, y
            solicitar la eliminación de tu cuenta, escribiendo al canal de
            soporte de QuantBattle. Atendemos las solicitudes dentro de los
            plazos previstos por la ley; luego de eliminar la cuenta solo se
            conservan los datos cuya retención exija la norma o datos
            anonimizados con fines estadísticos.
          </p>
        </Section>

        <Section n="06" title="Menores de edad">
          <p>
            El servicio está dirigido exclusivamente a mayores de 18 años y no
            permitimos el registro de menores. Si detectamos una cuenta creada
            por un menor de edad, la eliminaremos junto con sus datos.
          </p>
        </Section>

        <Section n="07" title="Cambios a esta política">
          <p>
            Podemos actualizar esta política para reflejar cambios en el
            servicio. La versión vigente se publica siempre en esta página con
            su fecha de actualización, y anunciaremos dentro de la plataforma
            cualquier cambio sustancial.
          </p>
        </Section>
      </div>

      <p className="metric mt-12 text-[11px] text-muted">
        Esto no es asesoría legal profesional.
      </p>
    </section>
  );
}
