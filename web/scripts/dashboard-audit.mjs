import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

if (process.env.QL_ENABLE_LIVE_UI_TEST !== 'true') throw new Error('Activar explícitamente QL_ENABLE_LIVE_UI_TEST=true para usar la cuenta técnica.');

const root = resolve('..');
const manifest = JSON.parse(await readFile(resolve(root, 'artifacts/judge-pilot/manifest.json'), 'utf8'));
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const password=randomBytes(32).toString('base64url');
const reset=await admin.auth.admin.updateUserById(manifest.user_id,{password});
if(reset.error) throw reset.error;
const base=process.env.QL_UI_BASE_URL || 'https://quant-lab-nine.vercel.app';
const output=resolve(root,'artifacts/dashboard-audit',process.env.QL_AUDIT_STAGE || 'before');
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(()=>localStorage.setItem('ql_onboarded','1'));
const page=await context.newPage();
page.setDefaultTimeout(30000);
await page.goto(base+'/login');
await page.getByLabel('Correo electrónico',{exact:true}).fill('technical-demo@quantlab.example');
await page.getByLabel('Contraseña',{exact:true}).fill(password);
await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
await page.waitForURL(/\/app(?:\/|$)/);
const paths=['/app','/app/tournaments','/app/strategies','/app/strategies/new','/app/marketplace','/app/marketplace/my-subscriptions','/app/academia','/app/library','/app/api-keys','/app/api-keys/instructions','/app/profile','/app/profile/settings','/app/profile/badges','/app/profile/referrals','/app/wallet','/app/rankings'];
const reports=[];
for(const path of process.env.QL_FLOWS_ONLY === 'true' ? [] : paths){
 const errors=[];const failures=[];
 const onError=e=>errors.push(e.message);
 const onResponse=r=>{if(r.status()>=400)failures.push({status:r.status(),url:r.url().split('?')[0]});};
 page.on('pageerror',onError);page.on('response',onResponse);
 try {
  const response=await page.goto(base+path);
  await page.waitForTimeout(path==='/app'?5000:1800);
  const body=await page.locator('body').innerText();
  const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,emptyIcons:[...document.querySelectorAll('.ql-dash-bottomnav a,.ql-back-nav-button')].filter(x=>!x.querySelector('svg')).length}));
  reports.push({path,status:response.status(),url:page.url(),errors,failures,geometry,body:body.slice(0,9000)});
  if(path==='/app')await page.screenshot({path:resolve(output,'desktop.png'),fullPage:true});
 }catch(e){reports.push({path,error:e.message});}
 page.off('pageerror',onError);page.off('response',onResponse);
 console.log(JSON.stringify(reports.at(-1)));
}
await page.setViewportSize({width:390,height:844});
for(const path of process.env.QL_FLOWS_ONLY === 'true' ? [] : ['/app','/app/profile/settings','/app/api-keys','/app/library']){
 await page.goto(base+path);await page.waitForTimeout(1800);
 reports.push({path,mobile:true,...await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,emptyIcons:[...document.querySelectorAll('.ql-dash-bottomnav a,.ql-back-nav-button')].filter(x=>!x.querySelector('svg')).length}))});
 if(path==='/app')await page.screenshot({path:resolve(output,'mobile.png'),fullPage:true});
}
if(process.env.QL_FLOWS_ONLY !== 'true')await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));
if(process.env.QL_AUDIT_STAGE === 'after') {
 const {expect} = await import('@playwright/test');
 await page.goto(base+'/app');
 await expect(page.getByRole('heading',{name:'Tu espacio de investigación'})).toBeVisible();
 await expect(page.getByRole('link',{name:/Torneo ML · practice/}).first()).toBeVisible({timeout:60000});
 await expect(page.getByText('Validado; esperando cierre',{exact:true})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Más secciones'}).click();
 await expect(page.locator('#mobile-more').getByRole('link',{name:'API Keys',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('#mobile-more')).toHaveCount(0);
 await page.goto(base+'/app/profile/settings#security');
 await page.getByLabel('Nueva contraseña',{exact:true}).fill('temporary-test-1234');
 await page.getByLabel('Confirmar contraseña',{exact:true}).fill('mismatched-value');
 await page.getByRole('button',{name:'Actualizar contraseña'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Las contraseñas no coinciden.'})).toBeVisible();
 const changedPassword=randomBytes(32).toString('base64url');
 await page.getByLabel('Nueva contraseña',{exact:true}).fill(changedPassword);
 await page.getByLabel('Confirmar contraseña',{exact:true}).fill(changedPassword);
 await page.getByRole('button',{name:'Actualizar contraseña'}).click();
 await expect(page.getByRole('status').filter({hasText:'Contraseña actualizada.'})).toBeVisible({timeout:30000});
 const verifier=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const verified=await verifier.auth.signInWithPassword({email:'technical-demo@quantlab.example',password:changedPassword});
 if(verified.error || verified.data.user?.id !== manifest.user_id)throw new Error('La nueva contraseña no permitió iniciar sesión');
 await page.goto(base+'/app/api-keys');
 await expect(page.getByText('Error interno del servidor',{exact:true})).toHaveCount(0);
 const keyName=`Prueba técnica dashboard ${Date.now()}`;
 try {
  await page.getByRole('textbox',{name:'Nombre de la clave'}).fill(keyName);
  await page.getByRole('button',{name:'Crear clave',exact:true}).click();
  const row=page.getByRole('listitem').filter({hasText:keyName});
  await expect(row).toBeVisible();
  await row.getByRole('button',{name:'Revocar',exact:true}).click();
  await expect(row.getByText('revocada',{exact:true})).toBeVisible();
  const saved=await admin.from('api_keys').select('revoked_at').eq('user_id',manifest.user_id).eq('name',keyName).single();
  if(saved.error || !saved.data?.revoked_at)throw new Error('La revocación no se guardó');
 } finally {
  // Solo desactiva la clave desechable creada por esta ejecución.
  await admin.from('api_keys').update({revoked_at:new Date().toISOString()}).eq('user_id',manifest.user_id).eq('name',keyName).is('revoked_at',null);
 }
 await page.goto(base+'/app');
 await page.route('**/rest/v1/token_ledger*',r=>r.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({message:'Fallo simulado para comprobar recuperación'})}));
 await page.reload();
 await expect(page.getByText('No se pudo cargar el ranking.',{exact:true})).toBeVisible({timeout:30000});
 await page.unroute('**/rest/v1/token_ledger*');
 await page.getByRole('button',{name:'Reintentar ranking'}).click();
 await expect(page.getByText('No se pudo cargar el ranking.',{exact:true})).toHaveCount(0);
 await expect(page.getByText('No hay datos para este período.',{exact:true})).toBeVisible({timeout:30000});
 await writeFile(resolve(output,'flow-checks.json'),JSON.stringify({mobile_navigation:true,selected_ml_receipt:true,password_mismatch_rejected:true,password_changed_and_login_verified:true,api_key_created_and_revoked:true,ranking_failure_and_retry:true},null,2));
}
await browser.close();
