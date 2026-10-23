// Verifica la web publicada. Solo cambia la contraseña de la cuenta técnica.
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

if(process.env.QL_ENABLE_LIVE_UI_TEST !== 'true') throw new Error('Activar QL_ENABLE_LIVE_UI_TEST=true para usar la cuenta técnica.');
const root=resolve('..'), output=resolve(root,'artifacts/judge-readiness');
await mkdir(output,{recursive:true});
const base=process.env.QL_UI_BASE_URL || 'https://quant-lab-nine.vercel.app';
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(()=>localStorage.setItem('ql_onboarded','1'));
const page=await context.newPage();
page.setDefaultTimeout(30000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
  const routes=['/','/docs','/features','/demo','/leaderboard','/community','/pricing','/status','/legal','/legal/terms','/disclaimer','/register'];
  const publicChecks=[];
  for(const path of routes){
    const response=await page.goto(base+path);
    if(response.status()!==200)throw new Error(`Página ${path}: HTTP ${response.status()}`);
    publicChecks.push({path,status:response.status()});
    if(path==='/demo')await expect(page).toHaveURL(/\/docs#evaluacion$/);
  }
  for(const [device,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});
    for(const path of ['/login?error_description=Error%20al%20100%25%20%2B%20conexi%C3%B3n','/features','/status']){
      await page.goto(base+path);
      if(path.startsWith('/login'))await expect(page.getByRole('alert').filter({hasText:'Error al 100%'})).toHaveText('Error al 100% + conexión');
      if(path==='/status')await expect(page.getByText('Operativo',{exact:true}).or(page.getByText('Degradado (lento)',{exact:true}))).toBeVisible({timeout:60000});
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`Desbordamiento ${device}: ${path}`);
      const name=path.startsWith('/login')?'login':path.slice(1);
      await page.screenshot({path:resolve(output,`${name}-${device}.png`),fullPage:true});
    }
  }
  await page.goto(base+'/login');
  await page.getByRole('button',{name:'¿Olvidaste tu contraseña?'}).click();
  let recoveryDestination='';
  await page.route('**/auth/v1/recover*',async route=>{
    recoveryDestination=new URL(route.request().url()).searchParams.get('redirect_to') || '';
    await route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
  await page.locator('#resetEmail').fill('technical-demo@quantlab.example');
  await page.getByRole('button',{name:'Enviar enlace',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('enlace para restablecer');
  if(new URL(recoveryDestination).searchParams.get('next')!=='/app/profile/settings#security')throw new Error('Destino de recuperación incorrecto');
  await page.unroute('**/auth/v1/recover*');
  const manifest=JSON.parse(await readFile(resolve(root,'artifacts/judge-pilot/manifest.json'),'utf8'));
  const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const password=randomBytes(32).toString('base64url');
  const updated=await admin.auth.admin.updateUserById(manifest.user_id,{password});
  if(updated.error)throw updated.error;
  await page.goto(base+'/login');
  await page.getByLabel('Correo electrónico',{exact:true}).fill('technical-demo@quantlab.example');
  await page.getByLabel('Contraseña',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await page.waitForURL(/\/app(?:\/|$)/);
  await page.goto(base+'/app/rankings');
  await expect(page.getByText('Sin actividad en esta clasificación',{exact:true})).toBeVisible();
  await page.screenshot({path:resolve(output,'ranking-mobile.png'),fullPage:true});
  const profileRoute='**/rest/v1/profiles*';
  let rows=1, fail=false;
  await page.route(profileRoute,route=>{
    if(!new URL(route.request().url()).searchParams.get('select')?.includes('tournaments_won'))return route.continue();
    return route.fulfill({status:fail?503:200,contentType:'application/json',body:fail?JSON.stringify({message:'Fallo simulado'}):JSON.stringify(Array.from({length:rows},(_,i)=>({id:`technical-mock-${i}`,username:`technical-mock-${i}`,total_qp_earned:10-i,tournaments_won:1})))});
  });
  for(rows of [1,2]){
    await page.reload();
    for(let i=0;i<rows;i++)await expect(page.getByText(`@technical-mock-${i}`,{exact:true})).toBeVisible();
  }
  fail=true;
  await page.reload();
  await expect(page.getByRole('button',{name:'Reintentar ranking',exact:true})).toBeVisible();
  fail=false;
  await page.getByRole('button',{name:'Reintentar ranking',exact:true}).click();
  await expect(page.getByText('@technical-mock-0',{exact:true})).toBeVisible();
  await page.unroute(profileRoute);
  if(errors.length)throw new Error(`Errores de navegador: ${errors.join('; ')}`);
  const result={completed_at:new Date().toISOString(),base_url:base,public_routes:publicChecks,browser_errors:errors,
    checks:{technical_login:true,percent_message_safe:true,desktop_mobile_no_overflow:true,real_ranking_empty:true,public_demo_is_ml_evidence:true},
    simulated_checks:{password_recovery_destination:true,ranking_one_and_two_rows:true,ranking_error_and_retry:true},emails_sent:0};
  await writeFile(resolve(output,'report.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {await browser.close();}
