import {chromium,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
if(process.env.QL_ENABLE_LIVE_UI_TEST!=='true') throw Error('Enable technical account test explicitly');
const manifest=JSON.parse(await readFile('../artifacts/judge-pilot/manifest.json','utf8'));
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const password=randomBytes(32).toString('base64url');
const reset=await admin.auth.admin.updateUserById(manifest.user_id,{password});if(reset.error)throw reset.error;
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);
// Local-only test bridge using real API responses. No deployed CORS changes or fixtures.
await page.route('https://quantlab2.onrender.com/**',async route=>{
 try {
  const response=await route.fetch({timeout:60000});
  await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});
 } catch { if(!page.isClosed()) await route.abort().catch(()=>{}); }
});
await page.addInitScript(()=>localStorage.setItem('ql_onboarded','1'));
const base=process.env.QL_UI_BASE_URL||'http://localhost:3100';const out='../artifacts/visual-redesign';await mkdir(out,{recursive:true});
const productShots=process.env.QL_CAPTURE_PUBLIC_ASSETS==='true'?'public/research/product':out+'/product';await mkdir(productShots,{recursive:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/login');await page.getByLabel('Correo electrónico').fill('technical-demo@quantlab.example');await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.waitForURL(/\/app(?:\/|$)/);
await expect(page.locator('#historial-ml ol')).toBeVisible({timeout:60000});
const rows=page.locator('#historial-ml ol > li');await expect(rows).toHaveCount(3);
await page.screenshot({path:out+'/dashboard-ready.png',fullPage:true});
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:out+'/dashboard-mobile.png',fullPage:true});
const dashboardGeometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
if(dashboardGeometry.scroll>dashboardGeometry.width)throw Error('Dashboard horizontal overflow');
await page.setViewportSize({width:1440,height:1000});
await page.locator('#historial-ml ol').screenshot({path:productShots+'/history.png'});
await page.getByRole('button',{name:/Ver los .* experimentos de esta página/}).click();
if(await rows.count()<=3)throw Error('History did not expand');await page.getByRole('button',{name:'Mostrar solo los tres más recientes'}).click();await expect(rows).toHaveCount(3);
await page.goto(base+'/app/tournaments');await expect(page.getByRole('link',{name:'Ver ronda',exact:true}).first()).toBeVisible({timeout:60000});await page.screenshot({path:out+'/tournaments-ready.png',fullPage:true});
await page.goto(base+'/app/tournaments/61079ded-94e1-4b5d-9434-28492234acc6');await expect(page.getByRole('tab',{name:'Datos',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Descargar/}).first()).toBeVisible({timeout:60000});await page.screenshot({path:out+'/datasets-ready.png',fullPage:true});
await page.getByRole('button',{name:'Descargar train.parquet',exact:true}).locator('xpath=ancestor::div[contains(@class,"ql-glass")][1]').screenshot({path:productShots+'/dataset.png'});
const submit=page.getByRole('tab').filter({hasText:'Enviar'});await submit.click();await expect(page.getByText('Ficha del experimento',{exact:true})).toBeVisible();await page.screenshot({path:out+'/submission-ready.png',fullPage:true});
await expect(page.getByText('Comprobante del envío seleccionado',{exact:true})).toBeVisible();
await page.locator('fieldset').screenshot({path:productShots+'/experiment.png'});
await page.getByRole('heading',{name:'Comprobante del envío seleccionado'}).locator('..').screenshot({path:productShots+'/receipt.png'});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/submission-mobile.png',fullPage:true});
const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
const surfaces=[];
for(const width of [1440,390]) {
 await page.setViewportSize({width,height:900});
 for(const path of ['/app/library','/app/profile/settings','/app/api-keys','/app/academia','/app/strategies','/app/marketplace','/login','/register','/features','/docs']) {
  const response=await page.goto(base+path);await page.locator('h1').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  const measure=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  if(measure.scroll>measure.width)throw Error('Horizontal overflow: '+path+' '+width);
  const name=path.split('/').filter(Boolean).join('-');
  await page.screenshot({path:`${out}/${name}-${width}.png`,fullPage:true});
  surfaces.push({path,width,status:response.status(),...measure});
 }
}
await writeFile(out+'/surface-check.json',JSON.stringify(surfaces,null,2));
await writeFile(out+'/authenticated-check.json',JSON.stringify({historyExpansion:true,errors,dashboardGeometry,geometry},null,2));console.log(JSON.stringify({historyExpansion:true,errors,dashboardGeometry,geometry}));await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();
