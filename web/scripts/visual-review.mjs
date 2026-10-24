import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out='../artifacts/visual-redesign'; await mkdir(out,{recursive:true});
const browser=await chromium.launch(); const report=[];
for(const width of [1440,768,390]) {
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3100');await page.evaluate(()=>document.fonts.ready);
 for(const img of await page.locator('.research-product-view img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode());}
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:`${out}/landing-${width}.png`,fullPage:true});
 const layout=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,h1:document.querySelector('h1').innerText}));
 await page.getByText('Qué debes tener en cuenta',{exact:true}).first().click();
 const expanded=await page.locator('details').first().getAttribute('open');
 report.push({width,...layout,detailsOpen:expanded!==null,errors}); await page.close();
}
await writeFile(`${out}/landing-check.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
