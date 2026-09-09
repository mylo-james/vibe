const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { once } = require('node:events');
const { testEnvironment } = require('./database.cjs');
async function start(env) {
  const child = spawn(process.execPath, ['-r', 'dotenv/config', 'bin/www'], {
    env: { ...testEnvironment(), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text) => {
    stderr += text;
  });
  child.stdout.resume();
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(signal, null, 'Startup must fail without hanging');
    return { code, stderr };
  } finally {
    clearTimeout(timeout);
  }
}
test('startup rejects an absent signing secret before connecting or listening', async () => {
  const r = await start({ JWT_SECRET: '' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Set JWT_SECRET/);
});
test('startup reports an unavailable database and exits', async () => {
  const r = await start({ DB_HOST: '/tmp/vibe-no-such-database-socket' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Database connection failed/);
});
test('startup exits cleanly when its configured port is already occupied', async () => {
  const occupied = net.createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  try {
    const r = await start({ HOST: '127.0.0.1', PORT: String(occupied.address().port) });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /EADDRINUSE/);
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
});
