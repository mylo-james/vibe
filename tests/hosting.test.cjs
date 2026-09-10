const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const {
  allowedOrigins,
  allowsWriteOrigin,
  serverlessPool,
  trustProxy,
} = require('../config/hosting');

const production = {
  NODE_ENV: 'production',
  VERCEL: '1',
  VIBE_PUBLIC_ORIGIN: 'https://vibe.mjames.dev',
  DATABASE_URL: 'postgres://vibe_test:vibe_test@127.0.0.1:5432/vibe_test',
  JWT_SECRET: 'test-only-jwt-secret',
};

function request(app, { headers, method = 'POST', path = '/api/not-a-route' }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('listening', () => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          method,
          path,
          headers,
        },
        (res) => {
          res.resume();
          res.once('end', () => {
            server.close((error) => (error ? reject(error) : resolve(res)));
          });
        },
      );
      req.once('error', reject);
      req.end('{}');
    });
  });
}

function restoreEnvironment(previous) {
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key];
  }
  Object.assign(process.env, previous);
}

test('production origins require exact HTTPS canonical or explicitly configured preview aliases', () => {
  assert.deepEqual(allowedOrigins(production), ['https://vibe.mjames.dev']);
  assert.deepEqual(
    allowedOrigins({
      ...production,
      VERCEL_ENV: 'preview',
      VIBE_PREVIEW_ORIGIN: 'https://vibe-preview-123.vercel.app',
    }),
    ['https://vibe.mjames.dev', 'https://vibe-preview-123.vercel.app'],
  );
  assert.deepEqual(
    allowedOrigins({
      ...production,
      VERCEL_ENV: 'preview',
      VIBE_PREVIEW_ORIGIN: 'http://bad.example',
    }),
    ['https://vibe.mjames.dev'],
  );
});

test('Vercel trusts exactly one proxy hop while local operation remains loopback-only', () => {
  assert.equal(trustProxy(production), 1);
  assert.equal(trustProxy({ NODE_ENV: 'development' }), 'loopback');
});

test('local HTTP writes preserve same-origin behavior', async () => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: 'development',
    DATABASE_URL: production.DATABASE_URL,
    JWT_SECRET: production.JWT_SECRET,
  });
  delete require.cache[require.resolve('../app')];
  const app = require('../app');
  try {
    const headers = { Host: '127.0.0.1:4331', Origin: 'http://127.0.0.1:4331' };
    assert.equal(
      allowsWriteOrigin(
        { protocol: 'http', get: (name) => headers[name === 'host' ? 'Host' : 'Origin'] },
        process.env,
      ),
      true,
    );
    assert.equal((await request(app, { headers })).statusCode, 404);
  } finally {
    restoreEnvironment(previous);
    delete require.cache[require.resolve('../app')];
  }
});

test('production HTTPS headers require the configured host and origin', async () => {
  const previous = { ...process.env };
  Object.assign(process.env, production);
  delete require.cache[require.resolve('../app')];
  const app = require('../app');
  try {
    const headers = {
      Host: 'vibe.mjames.dev',
      Origin: 'https://vibe.mjames.dev',
      'X-Forwarded-Proto': 'https',
    };
    assert.equal(
      allowsWriteOrigin(
        { secure: true, get: (name) => headers[name === 'host' ? 'Host' : 'Origin'] },
        production,
      ),
      true,
    );
    assert.equal((await request(app, { headers })).statusCode, 404);
    assert.equal(
      (
        await request(app, {
          headers: { ...headers, Origin: 'https://untrusted.example' },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await request(app, {
          headers: { ...headers, Host: 'vibe-preview-123.vercel.app' },
        })
      ).statusCode,
      403,
    );
  } finally {
    restoreEnvironment(previous);
    delete require.cache[require.resolve('../app')];
  }
});

test('a production forwarded HTTPS session serializes a Secure cookie', async () => {
  const previous = { ...process.env };
  Object.assign(process.env, production);
  delete require.cache[require.resolve('../auth')];
  const { setSession } = require('../auth');
  const cookieApp = express();
  cookieApp.set('trust proxy', trustProxy());
  cookieApp.get('/session', (req, res) => {
    setSession(req, res, { id: 1 });
    res.status(204).end();
  });
  try {
    const response = await request(cookieApp, {
      method: 'GET',
      path: '/session',
      headers: { Host: 'vibe.mjames.dev', 'X-Forwarded-Proto': 'https' },
    });
    const cookie = response.headers['set-cookie'][0];
    assert.match(cookie, /^vibe_session=/);
    assert.match(cookie, /; HttpOnly/);
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /; SameSite=Lax/);
    assert.match(cookie, /; Path=\//);
  } finally {
    restoreEnvironment(previous);
    delete require.cache[require.resolve('../auth')];
  }
});

test('the production Sequelize instance receives the bounded pool configuration', () => {
  const Sequelize = require('sequelize');
  const config = require('../config/database').production;
  const sequelize = new Sequelize(production.DATABASE_URL, config);
  try {
    assert.deepEqual(sequelize.options.pool, serverlessPool);
  } finally {
    sequelize.close();
  }
});
