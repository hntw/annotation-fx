// Check the timing demos (scroll-in and type-in cues) and the speed chip: node test/timing.mjs
import { chromium } from 'playwright';
const port = process.env.PORT || 8793;
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
for (const [name, vw] of [['desk', 1280], ['phone', 390]]) {
  const ctx = await b.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { window.__ev = []; document.addEventListener('annotationfx:mark', e => __ev.push([e.target.id, e.detail.mark, +e.detail.time.toFixed(2)])); });
  await p.evaluate(() => document.getElementById('timing').scrollIntoView());
  await p.click('#typeAgain');
  await p.waitForTimeout(900);
  await p.screenshot({ path: `out/timing-${name}-0.png` });
  for (let i = 1; i <= 3; i++) {
    await p.evaluate(i => { const s = document.getElementById('scroller'); s.scrollTop = i * 150; }, i);
    await p.waitForTimeout(1600);
    await p.screenshot({ path: `out/timing-${name}-${i}.png` });
  }
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `out/timing-${name}-end.png` });
  const ev = await p.evaluate(() => __ev);
  console.log(name, JSON.stringify(ev), errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
  if (name === 'desk') {
    await p.evaluate(() => document.getElementById('try').scrollIntoView());
    await p.click('#speed .chip:nth-child(4)');
    await p.waitForTimeout(700);
    await p.screenshot({ path: `out/timing-snap.png` });
    console.log('code', (await p.textContent('#code')).replace(/\n/g, ' '));
  }
  await ctx.close();
}
await b.close();
