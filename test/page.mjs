// Screenshot the demo page at desktop and phone width and print console errors: node test/page.mjs
import { chromium } from 'playwright';
const port = process.env.PORT || 8793;
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
for (const [name, vw, dark] of [['desk', 1280, false], ['phone', 390, false], ['desk-dark', 1280, true]]) {
  const ctx = await b.newContext({ viewport: { width: vw, height: 900 }, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(3500);
  // scroll through so tiles start, then back
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 700) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(250); }
  await p.waitForTimeout(2600);
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.querySelectorAll('canvas.annotationfx').length, document.getElementById('vid').readyState, document.getElementById('vid').currentTime]);
  await p.screenshot({ path: `out/page-${name}.png`, fullPage: true });
  console.log(name, 'scrollW/innerW', sw[0], sw[1], 'canvases', sw[2], 'video', sw[3], sw[4].toFixed(2), errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
  await ctx.close();
}
await b.close();
