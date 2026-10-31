// TEST-only receiving website. No lender endpoint, credentials, persistence or outbound requests.
import { createServer } from 'node:http';
if (process.env.QA_RECEIVER_MODE !== 'TEST_SYNTHETIC') throw new Error('Explicit synthetic receiver mode required.');
const raw = process.env.QA_RECEIVER_PORT;
if (!/^\d+$/.test(raw || '') || Number(raw) < 1024 || Number(raw) > 65535) throw new Error('Invalid test receiver port.');
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  res.setHeader('content-type', 'text/html');
  if (req.method !== 'GET') { res.writeHead(405); res.end('TEST receiver accepts navigation only'); return; }
  if (pathname === '/__qa-health') { res.end('TEST_SYNTHETIC'); return; }
  if (pathname === '/__qa-external-application') {
    const mode = req.headers['x-qa-receiver-mode'];
    if (mode === 'login') { res.writeHead(302, { location: '/__qa-login' }); res.end(); return; }
    res.writeHead(mode === 'unavailable' ? 503 : 200);
    res.end('<h1>' + (mode === 'unavailable' ? 'Synthetic destination unavailable' : 'Synthetic application page') + '</h1>'); return;
  }
  if (pathname === '/__qa-login') { res.end('<h1>Synthetic staff login</h1>'); return; }
  res.writeHead(404); res.end('Unknown TEST route');
});
server.listen(Number(raw), '127.0.0.1');
for (const event of ['SIGTERM', 'SIGINT']) process.on(event, () => server.close(() => process.exit(0)));
