// Render an Annotation FX overlay to video files for editors and the web.
//   node tools/render.mjs spec.json out/name [--w 1920] [--h 1080] [--fps 30] [--dur auto] [--bg image-or-video]
// spec.json holds AnnotationFX options (boxes in the media's pixels, plus "media": {"w","h"}).
// Writes name.mov (ProRes 4444 with alpha), name.webm (VP9 with alpha) and, with --bg, name_preview.mp4.
import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const [specPath, outBase, ...rest] = process.argv.slice(2);
const arg = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
const W = +arg('w', 1920), H = +arg('h', 1080), fps = +arg('fps', 30), bg = arg('bg', null), port = process.env.PORT || 8793;
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const dir = outBase + '_frames'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(`http://localhost:${port}/tools/frame.html`); await p.evaluate(() => window.ready);
const auto = await p.evaluate((o) => window.len(o), spec);
const dur = arg('dur', 'auto') === 'auto' ? Math.ceil((isFinite(auto) ? auto : 2) + 1) : +arg('dur');
const n = Math.round(dur * fps);
for (let i = 0; i < n; i++) {
  const url = await p.evaluate(({ o, t, W, H }) => window.frame(o, t, W, H), { o: spec, t: i / fps, W, H });
  fs.writeFileSync(path.join(dir, String(i).padStart(5, '0') + '.png'), Buffer.from(url.split(',')[1], 'base64'));
}
await b.close();
const inp = ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, '%05d.png')];
execFileSync('ffmpeg', [...inp, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', outBase + '.mov']);
execFileSync('ffmpeg', [...inp, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-row-mt', '1', outBase + '.webm']);
if (bg) {
  const isVid = /\.(mp4|mov|webm|m4v)$/i.test(bg);
  const bgIn = isVid ? ['-stream_loop', '-1', '-i', bg] : ['-loop', '1', '-framerate', String(fps), '-i', bg];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...bgIn, '-framerate', String(fps), '-i', path.join(dir, '%05d.png'),
    '-filter_complex', `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[b];[b][1:v]overlay=shortest=1,format=yuv420p`,
    '-t', String(dur), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709', '-an', outBase + '_preview.mp4']);
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`rendered ${n} frames (${dur}s) -> ${outBase}.mov / .webm${bg ? ' / _preview.mp4' : ''}`);
