// TEST-only server: serves verified built bytes, never recompiles the app or loads .env files.
import { preview } from 'vite';
import { readManifest } from './built-preview-core.mjs';
if (process.env.BUILT_PREVIEW_MODE !== 'TEST_SYNTHETIC') throw new Error('Explicit TEST mode required.');
const m = readManifest(process.env.BUILT_PREVIEW_MANIFEST, process.env.CMR_EXPECTED_SHA, process.env.BUILT_PREVIEW_CASE);
const runtimeOverride = m.receiverOrigin + '/__qa-external-application?route=runtime-only';
if (process.env.VITE_APPLICATION_URL !== runtimeOverride || runtimeOverride === m.expectedDestination) throw new Error('Intentional runtime override missing.');
const url = new URL(m.uiOrigin);
const server = await preview({ root: m.sourceDir, configFile: m.sourceDir + '/vite.config.js', envDir: false,
  build: { outDir: m.bundleDir }, preview: { host: '127.0.0.1', port: Number(url.port), strictPort: true } });
for (const event of ['SIGTERM', 'SIGINT']) process.on(event, () => server.httpServer.close(() => process.exit(0)));
