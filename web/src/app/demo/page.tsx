import { redirect } from "next/navigation";

/** La demostración pública corresponde al piloto ML reproducible del semillero. */
export default function DemoPage() {
  redirect("/docs#evaluacion");
}
