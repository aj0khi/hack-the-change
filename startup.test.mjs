import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

test('entry file listens when imported by a hosting wrapper', { timeout: 5000 }, async () => {
  const wrapper = `
    import { Server } from 'node:net';
    const listen = Server.prototype.listen;
    Server.prototype.listen = function (...args) {
      args[0] = 0;
      this.once('listening', () => console.log('READY:' + this.address().port));
      return listen.apply(this, args);
    };
    await import('./server.mjs');
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', wrapper], {
    cwd: new URL('.', import.meta.url),
    env: { PATH: process.env.PATH, PORT: '8766', APP_ORIGIN: 'http://localhost:8766', VERIFICATION_DB: ':memory:', DEMO_CREDENTIAL_DB: ':memory:' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout });
  let errors = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { errors += chunk; });
  try {
    const ready = await Promise.race([
      (async () => {
        for await (const line of lines) {
          if (line.startsWith('READY:')) return line;
        }
        throw new Error(`Server exited before listening: ${errors}`);
      })(),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`Server did not listen within 3 seconds: ${errors}`)), 3000);
        timer.unref();
      }),
    ]);
    const port = Number(ready.slice('READY:'.length));
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /Proofly/);
    assert.match(homeHtml, /href="design-system\.css"/);
    const employer = await fetch(`http://127.0.0.1:${port}/employer`);
    assert.equal(employer.status, 200);
    assert.match(await employer.text(), /href="\/design-system\.css"/);
    const stylesheet = await fetch(`http://127.0.0.1:${port}/design-system.css`);
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get('content-type'), /text\/css/);
    assert.match(await stylesheet.text(), /--ink:/);
  } finally {
    lines.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
  }
});
