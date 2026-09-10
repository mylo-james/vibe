const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { portfolioEmbedOrigin } = require('../config/portfolio-embed');

test('embedding accepts one exact configured portfolio origin and fails closed', () => {
  const origin = 'https://my-machine.example.ts.net:8447';
  assert.equal(portfolioEmbedOrigin({ VIBE_PORTFOLIO_ORIGIN: origin }), origin);
  assert.equal(
    portfolioEmbedOrigin({ VIBE_PORTFOLIO_ORIGIN: 'https://mjames.dev', NODE_ENV: 'production' }),
    'https://mjames.dev',
  );
  for (const raw of [
    undefined,
    '',
    '*',
    'http://mjames.dev',
    'https://evil.example',
    origin + '/',
    origin + '/page',
    origin + '?x=1',
    'https://user@my-machine.example.ts.net:8447',
  ]) {
    assert.equal(portfolioEmbedOrigin({ VIBE_PORTFOLIO_ORIGIN: raw }), undefined);
  }
  assert.equal(
    portfolioEmbedOrigin({ VIBE_PORTFOLIO_ORIGIN: origin, NODE_ENV: 'production' }),
    undefined,
  );
  assert.equal(
    portfolioEmbedOrigin({
      VIBE_PORTFOLIO_ORIGIN: 'https://preview.mjames.dev',
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
    }),
    'https://preview.mjames.dev',
  );
  for (const deployment of [undefined, 'production']) {
    assert.equal(
      portfolioEmbedOrigin({
        VIBE_PORTFOLIO_ORIGIN: 'https://preview.mjames.dev',
        NODE_ENV: 'production',
        VERCEL_ENV: deployment,
      }),
      undefined,
    );
  }
});

test('actual HTTP responses use the exact ancestor policy only when opted in', async () => {
  const previous = process.env.VIBE_PORTFOLIO_ORIGIN;
  try {
    for (const origin of [
      '',
      'https://my-machine.example.ts.net:8447',
      'https://mjames.dev',
      'https://untrusted.example',
    ]) {
      process.env.VIBE_PORTFOLIO_ORIGIN = origin;
      delete require.cache[require.resolve('../app')];
      const app = require('../app');
      const server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
        assert.equal(response.status, 200);
        const expected =
          origin.endsWith('.ts.net:8447') || origin === 'https://mjames.dev' ? origin : '';
        const policy = response.headers.get('content-security-policy');
        assert.equal(
          policy.match(/frame-ancestors ([^;]+)/)[1],
          "'self'" + (expected ? ' ' + expected : ''),
        );
        assert.equal(response.headers.get('x-frame-options'), expected ? null : 'SAMEORIGIN');
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    }
  } finally {
    if (previous === undefined) delete process.env.VIBE_PORTFOLIO_ORIGIN;
    else process.env.VIBE_PORTFOLIO_ORIGIN = previous;
  }
});
