import { test, expect } from "@playwright/test";

test("auth callback keeps destinations on this site and preserves recovery form", async ({ request }) => {
  for (const next of ["@evil.example", "//evil.example", "/\\evil.example", "https://evil.example"]) {
    const response = await request.get(`/auth/callback?next=${encodeURIComponent(next)}`, {maxRedirects:0});
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location).pathname).toBe("/app");
    expect(new URL(response.headers().location).origin).toBe("http://localhost:3100");
  }
  const response = await request.get(`/auth/callback?next=${encodeURIComponent("/app/profile/settings#security")}`, {maxRedirects:0});
  expect(response.headers().location).toBe("http://localhost:3100/app/profile/settings#security");
});

test("login renders percent characters and recovery points to password form", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error=>errors.push(error.message));
  await page.goto("/login?error_description=Error%20al%20100%25%20%2B%20conexi%C3%B3n");
  await expect(page.getByRole("alert").filter({hasText:"Error al 100%"})).toHaveText("Error al 100% + conexión");
  await page.getByRole("button", {name:"¿Olvidaste tu contraseña?"}).click();
  let destination = "";
  await page.route("**/auth/v1/recover*", async route=>{
    destination = new URL(route.request().url()).searchParams.get("redirect_to") ?? "";
    await route.fulfill({status:200,contentType:"application/json",body:"{}"});
  });
  await page.locator("#resetEmail").fill("technical-recovery@quantbattle.example");
  await page.getByRole("button",{name:"Enviar enlace",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("enlace para restablecer");
  expect(new URL(destination).searchParams.get("next")).toBe("/app/profile/settings#security");
  expect(errors).toEqual([]);
});

test("confirmation resend failure allows a second successful attempt", async ({ page }) => {
  await page.route("**/auth/v1/signup*", route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({user:{id:"technical-confirmation",identities:[],email:"technical-confirmation@quantbattle.example"},session:null})}));
  // Estas solicitudes son simuladas: no se crea una cuenta ni se envía correo.
  await page.route("**/rest/v1/profiles*", route=>route.fulfill({status:201,contentType:"application/json",body:"[]"}));
  let attempts = 0;
  await page.route("**/auth/v1/resend*", route=>{
    attempts++;
    return route.fulfill({status:attempts===1?429:200,contentType:"application/json",body:attempts===1?JSON.stringify({msg:"Email rate limit exceeded",code:"over_email_send_rate_limit"}):"{}"});
  });
  await page.goto("/register");
  await page.getByLabel("Correo electrónico",{exact:true}).fill("technical-confirmation@quantbattle.example");
  await page.getByLabel("Nombre de usuario",{exact:true}).fill("technical-confirmation".slice(0,20));
  await page.getByLabel("Contraseña",{exact:true}).fill("mock-password-1234");
  await page.getByLabel("Confirmar contraseña",{exact:true}).fill("mock-password-1234");
  await page.getByRole("button",{name:"Crear cuenta",exact:true}).click();
  const resend = page.getByRole("button",{name:"Reenviar enlace",exact:true});
  await resend.click();
  await expect(page.getByRole("alert").filter({hasText:"No pudimos reenviar"})).toBeVisible();
  await expect(resend).toBeEnabled();
  await resend.click();
  await expect(page.getByRole("status")).toContainText("Enlace reenviado");
  await expect(page.getByRole("alert").filter({hasText:"No pudimos reenviar"})).toHaveCount(0);
  expect(attempts).toBe(2);
});
