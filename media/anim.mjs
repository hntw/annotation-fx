// Render the header loop from media/header.html (needs tools/serve.sh running on 8793).
//   node media/anim.mjs        media/header.gif  1280x640, one loop, two-pass palette
//   node media/anim.mjs mp4    media/header.mp4  2560x1280 H.264, the loop played 3 times
//   node media/anim.mjs still  media/header.jpg  2560x1280 showcase frame (README fallback, social preview)
import { chromium } from 'playwright';
import fs from 'fs'; import os from 'os'; import path from 'path'; import { execFileSync } from 'child_process';
const mode = process.argv[2] || 'gif', port = process.env.PORT || 8793, FPS = 25;
const Z = mode === 'gif' ? 1 : 2, here = path.dirname(new URL(import.meta.url).pathname);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afx-header-'));
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const p = await b.newPage({ viewport: { width: 1280, height: 640 } });
await p.goto(`http://localhost:${port}/media/header.html?z=${Z}`); await p.evaluate(() => window.ready);
const grab = async (t, file, type) => {
  const url = await p.evaluate(({ t, type }) => { window.render(t); return document.getElementById('c').toDataURL(type, 0.92); }, { t, type });
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
};
const ff = (...a) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...a], { stdio: 'inherit' });
if (mode === 'still') {
  await grab(3.4, path.join(here, 'header.jpg'), 'image/jpeg');
} else {
  const N = Math.round(await p.evaluate(() => window.LOOP) * FPS);
  for (let i = 0; i < N; i++) await grab(i / FPS, path.join(dir, `f${String(i).padStart(3, '0')}.png`), 'image/png');
  const src = ['-framerate', String(FPS), '-i', path.join(dir, 'f%03d.png')];
  if (mode === 'mp4') ff('-stream_loop', '2', ...src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', path.join(here, 'header.mp4'));
  else ff(...src, '-vf', 'split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    '-loop', '0', path.join(here, 'header.gif'));
}
fs.rmSync(dir, { recursive: true, force: true });
await b.close();
console.log('done', mode);
