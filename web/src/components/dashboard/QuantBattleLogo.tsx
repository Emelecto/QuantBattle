/** Marca de QuantBattle, recortada al centro para mostrarse en formato cuadrado. */
export function QuantBattleLogo({ className, size }: { className?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-block",
        flex: "none",
        width: size,
        height: size,
        padding: 0,
        backgroundImage: 'url("/quantbattle-logo.jpg")',
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    />
  );
}
