const { test } = require('node:test');
const assert = require('node:assert/strict');
const audius = require('../services/audius');
const sample = () => ({
  id: 'sample',
  title: 'Original',
  user: { name: 'A', handle: 'a' },
  is_streamable: true,
  is_stream_gated: false,
  access: { stream: true },
  stream_conditions: null,
  stream: {
    url: 'https://unknown.invalid/tracks/cidstream/test?signature=one',
    mirrors: ['https://v.monophonic.digital'],
  },
});
test('eligibility rejects access gates, opt-outs, deleted and scheduled content', () => {
  assert.equal(audius.eligible(sample()), true);
  for (const patch of [
    { is_stream_gated: true },
    { access: { stream: false } },
    { allowed_api_keys: ['another-app'] },
    { is_unlisted: true },
    { is_delete: true },
    { is_scheduled_release: true },
    { is_available: false },
    { stream_conditions: { token_gate: true } },
  ])
    assert.equal(audius.eligible({ ...sample(), ...patch }), false);
});
test('only exact verified origins and HTTPS links are accepted; mirrors preserve the signed path', () => {
  for (const url of [
    'http://v.monophonic.digital/a',
    'https://v.monophonic.digital.evil.org/a',
    'https://user:pass@v.monophonic.digital/a',
    'javascript:alert(1)',
  ])
    assert.equal(audius.asset(url), null);
  assert.equal(
    audius.stream(sample()),
    'https://v.monophonic.digital/tracks/cidstream/test?signature=one',
  );
  assert.throws(
    () => audius.stream({ ...sample(), stream: { url: 'https://other.invalid/a' } }),
    /unverified audio host/,
  );
  assert.throws(
    () => audius.stream({ ...sample(), stream: { url: 'malformed' } }),
    (error) => error.status === 503 && /usable stream/.test(error.message),
  );
  assert.equal(audius.permalink('//evil.org'), 'https://audius.co');
});
test('public metadata batches are bounded and transient requests retry only once', async () => {
  await assert.rejects(audius.tracks(Array(26).fill('sample')), /25/);
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return calls === 1
      ? new Response('', { status: 429, headers: { 'Retry-After': '0' } })
      : Response.json({ data: [sample()] });
  };
  assert.equal((await audius.tracks(['sample'], { fetcher })).length, 1);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    audius.tracks(['sample'], {
      fetcher: async () => {
        calls++;
        return new Response('', { status: 503, headers: { 'Retry-After': '0' } });
      },
    }),
    /unavailable/,
  );
  assert.equal(calls, 2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    audius.tracks(['sample'], {
      signal: controller.signal,
      fetcher: async (url, options) => {
        options.signal.throwIfAborted();
      },
    }),
    /too long/,
  );
});
test('albumless metadata carries credit without exposing signed audio or user account fields', () => {
  const t = sample();
  t.user.wallet = 'private';
  const data = audius.normalizeTrack(t, { songId: 1, source: 'audius', sourceId: t.id });
  assert.equal(data.standalone, true);
  assert.equal(data.albumName, null);
  assert.equal(data.artistName, 'A');
  assert.ok(data.licenseUrl);
  assert.equal(JSON.stringify(data).includes('signature'), false);
  assert.equal(JSON.stringify(data).includes('private'), false);
});

test('provider failures are bounded, invalid responses are rejected and cancellation stops Retry-After', async (t) => {
  for (const data of [{}, { data: null }, { data: 'wrong' }])
    await assert.rejects(
      audius.tracks(['sample'], { fetcher: async () => Response.json(data) }),
      (e) => e.status === 502,
    );
  await assert.rejects(audius.tracks(['../private']), (e) => e.status === 400);
  await assert.rejects(
    audius.tracks(['sample'], { fetcher: async () => new Response(null, { status: 404 }) }),
    (e) => e.status === 404,
  );
  let calls = 0;
  await assert.rejects(
    audius.tracks(['sample'], {
      fetcher: async () => {
        calls++;
        throw new TypeError('offline');
      },
    }),
    (e) => e.status === 503,
  );
  assert.equal(calls, 2);
  const controller = new AbortController();
  calls = 0;
  const waiting = audius.tracks(['sample'], {
    signal: controller.signal,
    fetcher: async () => {
      calls++;
      controller.abort();
      return new Response(null, { status: 429, headers: { 'Retry-After': '3600' } });
    },
  });
  await assert.rejects(waiting, (e) => e.status === 504);
  assert.equal(calls, 1);
  for (const after of ['not-a-date', new Date(0).toUTCString()]) {
    calls = 0;
    const result = await audius.tracks(['sample'], {
      fetcher: async () =>
        ++calls === 1
          ? new Response(null, { status: 503, headers: { 'Retry-After': after } })
          : Response.json({ data: [sample()] }),
    });
    assert.equal(result[0].id, 'sample');
    assert.equal(calls, 2);
  }
});
test('credit links stay on Audius and normalization handles unavailable tracks, releases and licenses', () => {
  for (const value of [undefined, '//evil.test', '/\\evil.test/track', 'https://evil.test/track'])
    assert.equal(new URL(audius.permalink(value)).origin, 'https://audius.co');
  assert.equal(audius.permalink('/artist/track'), 'https://audius.co/artist/track');
  const reference = { songId: 1, source: 'audius', sourceId: 'sample' };
  assert.equal(audius.normalizeTrack(null, reference).available, false);
  for (const [label, suffix] of [
    ['Attribution CC BY', 'by'],
    ['Attribution ShareAlike CC BY-SA', 'by-sa'],
    ['Attribution-NoDerivatives CC BY-ND', 'by-nd'],
    ['Attribution-NonCommercial CC BY-NC', 'by-nc'],
    ['Attribution-NonCommercial-ShareAlike CC BY-NC-SA', 'by-nc-sa'],
    ['Attribution-NonCommercial-NoDerivatives CC BY-NC-ND', 'by-nc-nd'],
  ]) {
    const song = audius.normalizeTrack(
      { ...sample(), license: label, album_backlink: { playlist_name: 'Release' } },
      reference,
    );
    assert.equal(song.licenseUrl, `https://creativecommons.org/licenses/${suffix}/4.0/`);
    assert.equal(song.standalone, false);
    assert.equal(song.albumName, 'Release');
  }
  const plain = audius.normalizeTrack(
    {
      ...sample(),
      user: null,
      license: 'All rights reserved',
      artwork: {
        '480x480': 'https://unverified.test/a',
        '150x150': 'https://v.monophonic.digital/thumb',
      },
    },
    reference,
  );
  assert.equal(plain.licenseUrl, null);
  assert.equal(plain.artistName, 'Unknown artist');
  assert.equal(plain.artwork, 'https://v.monophonic.digital/thumb');
});
