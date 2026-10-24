"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Clases del input de contraseña.
 *
 * Mismo look que `inputClasses` (.ql-input del tema v2) pero con hueco a la
 * derecha para el botón del ojo. Se declara `pl-3 pr-11` en vez de `px-3` para
 * no depender del orden de conflictos de Tailwind.
 */
const passwordInputClasses = cn(
  "ql-input h-11 w-full rounded-md pl-3 pr-11 text-base",
  "outline-none",
);

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M2.4 12S6 5.5 12 5.5 21.6 12 21.6 12 18 18.5 12 18.5 2.4 12 2.4 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M10.6 6.7A7.9 7.9 0 0 1 12 6.6c6 0 9.6 6.5 9.6 6.5a17.6 17.6 0 0 1-2.6 3.4" />
      <path d="M6.4 7.9A17.4 17.4 0 0 0 2.4 13.1S6 19.6 12 19.6a8.6 8.6 0 0 0 3.6-.8" />
      <path d="M10.1 11.2a2.7 2.7 0 0 0 3.8 3.8" />
      <path d="M3.5 3.5l17 17" />
    </svg>
  );
}

/**
 * Campo de contraseña con botón mostrar/ocultar.
 *
 * Accesible: el botón tiene `aria-label` dinámico, `aria-pressed` y
 * `aria-controls` apuntando al input. El SVG va inline (sin librerías).
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  required = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  minLength?: number;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={passwordInputClasses}
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          aria-controls={id}
          title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          className={cn(
            "absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md",
            "text-muted transition-colors hover:text-ink",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
          )}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}
