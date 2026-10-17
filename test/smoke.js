// Draws every style x mark across the timeline on a do-nothing canvas and counts throws (node test/smoke.js)
const A = require('../annotationfx.js');
const grad = { addColorStop() {} };
function fakeCtx() {
  const st = { font: '10px x', globalAlpha: 1 };
  return new Proxy(st, {
    get(o, k) {
      if (k === 'measureText') return (t) => ({ width: String(t).length * 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { o[k] = v; return true; }
  });
}
let n = 0, fails = 0, nan = 0;
const sizes = [[1920, 1080], [390, 300], [1, 1]];
const box = [600, 400, 500, 160];
const cases = [];
for (const st of A.styles) {
  for (const mark of A.marks) {
    cases.push({ style: st.id, mark, box, to: [100, 100, 200, 80], media: undefined });
    cases.push({ style: st.id, mark, box, note: 'endless forms\nmost beautiful', space: 'css' });
  }
  cases.push({ style: st.id, marks: [{ mark: 'circle', box: [10, 10, 40, 20] }, { mark: 'arrow', box: [1700, 900, 200, 150], note: 'edge' }], hold: 0.5, out: 'erase' });
}
cases.push({ style: 'darwin', mark: 'circle', box: [{ t: 0, x: 0, y: 0, w: 10, h: 10 }, { t: 2, x: 100, y: 100, w: 50, h: 50 }], note: 'tracked' });
cases.push({ style: 'darwin', mark: 'circle', box: [0, 0, 0, 0], note: '' });
for (const o of cases) for (const [w, h] of sizes) for (let t = 0; t <= 5; t += 0.25) {
  n++;
  const ctx = fakeCtx();
  const realArc = null;
  try { A.draw(ctx, t, w, h, o); } catch (e) { fails++; if (fails < 8) console.log('FAIL', JSON.stringify({ style: o.style, mark: o.mark, w, h, t }), e.stack.split('\n').slice(0, 3).join(' | ')); }
}
// geometry sanity: built items have finite points
for (const st of A.styles) for (const mark of A.marks) {
  const m = A._internal.resolveList({ style: st.id, mark, note: 'a note here', box })[0];
  const items = A._internal.build(fakeCtx(), m, { x: 600, y: 400, w: 500, h: 160 }, 1920, 1080, 1, { x: 100, y: 100, w: 200, h: 80 });
  for (const it of items) if (it.pts && it.pts.some(p => !isFinite(p[0]) || !isFinite(p[1]))) { nan++; if (nan < 5) console.log('NaN points', st.id, mark, it.k, it.pen); }
  for (const it of items) if (!(isFinite(it.a) && isFinite(it.b))) { nan++; if (nan < 5) console.log('bad time', st.id, mark, it.k); }
}
console.log('styles', A.styles.length, 'marks', A.marks.length, 'frames', n, 'throws', fails, 'bad', nan, 'length', A.length(cases[0]).toFixed(2));
process.exit(fails || nan ? 1 : 0);
