import { fork } from 'node:child_process';
import { join } from 'node:path';
import { assertLocalOrigin, childEnvironment } from './preflight.mjs';

export async function startBackend(config) {
  const child = fork(join(config.hloa.root, 'tools/offline-rehearsal/src/cli.ts'), [], {
    cwd: config.hloa.root, execArgv: ['--import', 'tsx'], env: childEnvironment(globalThis.process.env),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  const pending = new Map();
  let sequence = 0;
  let stderr = '';
  const exit = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', (error) => resolve({ code: null, error: error.message }));
  });
  child.stdout.resume();
  child.stderr.on('data', (data) => { stderr = (stderr + data.toString()).slice(-4000); });
  child.on('message', (message) => {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    if (message.ok) waiter.resolve(message.result); else waiter.reject(new Error(message.error));
  });
  child.on('exit', () => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(`TEST child exited before reply. ${stderr}`)); }
    pending.clear();
  });
  child.on('error', (error) => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    pending.clear();
  });
  const within = async (promise, milliseconds) => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('TEST child did not exit.')), milliseconds); })]); }
    finally { clearTimeout(timer); }
  };
  const terminate = async () => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    try { await within(exit, 3000); }
    catch { child.kill('SIGKILL'); await within(exit, 3000); }
  };
  const request = (action, extra = {}) => new Promise((resolve, reject) => {
    if (!child.connected) { reject(new Error('TEST child is disconnected.')); return; }
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('TEST child command timed out.')); }, 20000);
    pending.set(id, { resolve, reject, timer });
    child.send({ id, action, ...extra }, (error) => { if (error) { clearTimeout(timer); pending.delete(id); reject(error); } });
  });
  let info;
  let stopPromise;
  const stop = () => {
    stopPromise ||= (async () => {
      try {
        const proof = await request('close');
        const result = await within(exit, 5000);
        if (result.code !== 0 || !proof.closed || !proof.listenersClosed) throw new Error('TEST teardown was not clean.');
        for (const origin of info.origins) {
          assertLocalOrigin(origin);
          let refused = false;
          try { await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(1000), redirect: 'error' }); }
          catch (error) { refused = error.cause?.code === 'ECONNREFUSED'; }
          if (!refused) throw new Error('A TEST listener remains reachable or teardown is uncertain.');
        }
        return { ...proof, processExited: true, listenersRefusedConnections: true, forcedKill: false };
      } catch (error) {
        await terminate();
        throw error;
      }
    })();
    return stopPromise;
  };
  try {
    info = await request('start', { options: { mode: config.mode, uiOrigin: config.uiOrigin, boundaryPort: config.boundaryPort } });
    if (assertLocalOrigin(info.boundaryUrl) !== config.boundaryOrigin || info.databaseMode !== 'memory://' || info.mode !== config.mode
      || info.schedulersEnabled !== false || info.origins.some((origin) => assertLocalOrigin(origin) !== origin)) throw new Error('TEST runtime safety handshake failed.');
    return { info, request, stop };
  } catch (error) { await terminate(); throw error; }
}
