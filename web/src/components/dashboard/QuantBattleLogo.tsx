/**
 * QuantBattle Logo — marca SVG minimalista.
 * Un cubo abierto con un haz de luz interno que evoca
 * datos/quant sin ser literal. Monocromo, funciona en dark.
 */
export function QuantBattleLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="QuantBattle"
      role="img"
    >
      {/* Cubo base — wireframe */}
      <path
        d="M16 3L28 9.5V22.5L16 29L4 22.5V9.5L16 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Cara izquierda */}
      <path
        d="M4 9.5L16 16L16 29"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity="0.45"
      />
      {/* Cara derecha */}
      <path
        d="M28 9.5L16 16"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity="0.45"
      />
      {/* Haz interno — acento */}
      <path
        d="M16 7L22 10.5V17.5L16 21L10 17.5V10.5L16 7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* Punto central — "núcleo de datos" */}
      <circle cx="16" cy="14" r="1.8" fill="currentColor" />
    </svg>
  );
}
