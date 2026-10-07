import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'Frontend/MOOSIC-visual-refresh-final/MOOSIC-visual-refresh/artifacts/moodsic/dist/public');
const output = path.join(root, '.vercel/output');
// Check the build exists before replacing only the generated deployment output.
await readFile(path.join(source, 'index.html'));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, path.join(output, 'static'), { recursive: true });
await writeFile(path.join(output, 'config.json'), `${JSON.stringify({
  version: 3,
  routes: [
    { src: '/(.*)', headers: { 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Content-Type-Options': 'nosniff' }, continue: true },
    { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { handle: 'filesystem' },
    { src: '/.*', dest: '/index.html' },
  ],
}, null, 2)}\n`);
console.log('Prepared .vercel/output. Deploy with vercel deploy --prebuilt --prod.');
