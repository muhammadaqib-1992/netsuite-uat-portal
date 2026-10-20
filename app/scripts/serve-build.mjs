// Serves the production build the way the Suitelet does (config injected into index.html) and answers
// the RESTlet's actions with the in-memory mock, so the built bundle can be tested without NetSuite.
// Run: npm run build && npm run serve:build   → http://localhost:4173   (LEVEL=tester|lead to switch)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const indexFile = path.resolve(appDir, '../sdf/src/FileCabinet/SuiteScripts/f3u_uat_portal/app/index.html');
const samplesDir = path.resolve(appDir, '../sample-data');
const captureDir = path.resolve(appDir, 'node_modules/.cache/captures');
const port = Number(process.env.PORT) || 4173;
const API = '/app/site/hosting/restlet.nl?script=1&deploy=1';

const mockOut = path.resolve(appDir, 'node_modules/.cache/mock-api.cjs');
await build({ entryPoints: [path.resolve(appDir, 'src/api/mock.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: mockOut, logLevel: 'warning' });
globalThis.location = { search: process.env.LEVEL ? `?level=${process.env.LEVEL}` : '' };
const api = createRequire(import.meta.url)(mockOut).mockApi();

const GET = {
  bootstrap: () => api.bootstrap(),
  cycles: () => api.cycles(),
  cycle: (p) => api.cycle(Number(p.id)),
  cases: (p) => api.cases(Number(p.cycleId)),
  case: (p) => api.getCase(Number(p.id)),
  exportCases: (p) => api.exportCases(Number(p.cycleId), Number(p.page) || 0),
  exportComments: (p) => api.exportComments(Number(p.cycleId)),
  workbook: (p) => api.workbook(Number(p.cycleId)),
  file: (p) => api.file(Number(p.id)),
  templates: () => api.templates(),
};
const POST = ['saveCase', 'uploadEvidence', 'addComment', 'editComment', 'createCycle', 'updateCycle', 'uploadWorkbook', 'importBatch', 'saveTemplate'];

async function envelope(fn) {
  try {
    return { ok: true, data: (await fn()) ?? null };
  } catch (e) {
    return { ok: false, error: { code: e.code || 'UNEXPECTED_ERROR', message: e.message, extra: e.extra } };
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = fs.readFileSync(indexFile, 'utf8').replace('<!--UAT_CONFIG-->', `<script>window.__UAT_CONFIG__=${JSON.stringify({ apiUrl: API })};</script>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (url.pathname === '/app/site/hosting/restlet.nl') {
      const params = Object.fromEntries(url.searchParams);
      let result;
      if (req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString() || '{}');
        result = POST.includes(body.action) ? await envelope(() => api[body.action](body)) : { ok: false, error: { code: 'UNKNOWN_ACTION', message: body.action } };
      } else {
        result = GET[params.action] ? await envelope(() => GET[params.action](params)) : { ok: false, error: { code: 'UNKNOWN_ACTION', message: params.action } };
      }
      console.log(req.method, params.action ?? '(post)', result.ok ? 'ok' : result.error.code);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }
    if (url.pathname.startsWith('/samples/')) {
      const file = path.join(samplesDir, path.basename(url.pathname));
      if (!fs.existsSync(file)) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      return res.end(fs.readFileSync(file));
    }
    if (url.pathname === '/capture' && req.method === 'POST') {
      // Test helper: the page posts a downloaded file here so it can be inspected.
      fs.mkdirSync(captureDir, { recursive: true });
      const name = path.basename(url.searchParams.get('name') || 'capture.bin');
      fs.writeFileSync(path.join(captureDir, name), await readBody(req));
      console.log('captured', name);
      return res.writeHead(204).end();
    }
    res.writeHead(404).end();
  })
  .listen(port, () => console.log(`Built app on http://localhost:${port} (level: ${process.env.LEVEL || 'team'})`));
