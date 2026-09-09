const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let api, ApiError, clearLegacySession, createCatalogCache;
before(async () => {
  ({ api, ApiError, clearLegacySession } = await import('../public/js/api.js'));
  ({ createCatalogCache } = await import('../public/js/catalog-cache.js'));
});
const ref = (songId) => ({ songId, source: 'audius', sourceId: 'ref' + songId });
const metadata = (r) => ({ ...r, songName: 'Original ' + r.songId, available: true });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
test('API sends same-origin JSON, supports empty responses and reports transport/server failures', async (t) => {
  const calls = [];
  const fetcher = t.mock.method(globalThis, 'fetch', async (...args) => {
    calls.push(args);
    return new Response(null, { status: 204 });
  });
  assert.equal(await api('/example', { method: 'DELETE', body: { title: '<literal>' } }), null);
  assert.equal(calls[0][0], '/api/example');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(calls[0][1].body, JSON.stringify({ title: '<literal>' }));
  fetcher.mock.mockImplementation(async () => new Response('bad gateway', { status: 502 }));
  await assert.rejects(
    api('/example'),
    (e) => e instanceof ApiError && e.status === 502 && /Something went wrong/.test(e.message),
  );
  fetcher.mock.mockImplementation(async () =>
    Response.json({ message: 'Please sign in' }, { status: 401 }),
  );
  await assert.rejects(api('/example'), (e) => e.status === 401 && e.message === 'Please sign in');
  fetcher.mock.mockImplementation(async () => {
    throw new TypeError('network');
  });
  await assert.rejects(api('/example'), (e) => e.status === 0 && /Connection lost/.test(e.message));
  const aborted = new DOMException('cancelled', 'AbortError');
  fetcher.mock.mockImplementation(async () => {
    throw aborted;
  });
  await assert.rejects(api('/example'), (e) => e === aborted);
});
test('legacy token cleanup tolerates unavailable storage without preventing cookie sign-in', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    assert.doesNotThrow(() => clearLegacySession());
    const removed = [];
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        removeItem(key) {
          removed.push(key);
        },
      },
    });
    clearLegacySession();
    assert.deepEqual(removed, ['VIBE_TOKEN', 'VIBE_USER_ID']);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
test('catalog hydrates distinct IDs in bounded batches and keeps local items off the provider', async (t) => {
  const batches = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const ids = new URL(url, 'https://vibe.test').searchParams.get('ids').split(',').map(Number);
    batches.push(ids);
    return Response.json({ songs: ids.map((id) => metadata(ref(id))) });
  });
  const cache = createCatalogCache(),
    refs = Array.from({ length: 30 }, (_, i) => ref(i + 1));
  const local = { songId: 100, source: 'local', songName: 'Local' };
  const result = await cache.hydrate([...refs, refs[0], local]);
  assert.equal(result.length, 32);
  assert.equal(result.at(-1).songName, 'Local');
  assert.ok(batches.every((ids) => ids.length <= 25));
  assert.equal(new Set(batches.flat()).size, batches.flat().length);
  assert.equal(cache.ready([...refs, local]), 31);
  await cache.hydrate(refs);
  assert.equal(batches.length, 2);
});
test('overlapping catalog requests coalesce and failed loads remain retryable', async (t) => {
  const first = deferred();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return first.promise;
  });
  const cache = createCatalogCache();
  const a = cache.hydrate([ref(1)]),
    b = cache.hydrate([ref(1)]);
  first.resolve(Response.json({ songs: [metadata(ref(1))] }));
  assert.deepEqual(await a, await b);
  assert.equal(calls, 1);
  cache.clear();
  assert.equal(cache.display(ref(1)).available, false);
  const failure = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 503 }),
  );
  await assert.rejects(cache.hydrate([ref(1)]), (e) => e.status === 503);
  failure.mock.mockImplementation(async () => Response.json({ songs: [metadata(ref(1))] }));
  assert.equal((await cache.hydrate([ref(1)]))[0].available, true);
});
test('clearing a pending catalog load prevents its queued batches and stale data from returning', async (t) => {
  const first = deferred();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls++;
    if (calls === 1) return first.promise;
    const ids = new URL(url, 'https://vibe.test').searchParams.get('ids').split(',').map(Number);
    return Response.json({ songs: ids.map((id) => metadata(ref(id))) });
  });
  const cache = createCatalogCache(),
    refs = Array.from({ length: 30 }, (_, i) => ref(i + 1));
  const stale = cache.hydrate(refs);
  cache.clear();
  first.resolve(Response.json({ songs: refs.slice(0, 25).map(metadata) }));
  await stale;
  assert.equal(calls, 1, 'A cleared session must not issue the next old batch');
  assert.equal(cache.ready(refs), 0);
  await cache.hydrate(refs);
  assert.equal(cache.ready(refs), 30);
});
test('album requests coalesce, clear stale results and recover after provider errors', async (t) => {
  let calls = 0;
  const pending = deferred();
  const fetcher = t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return pending.promise;
  });
  const cache = createCatalogCache(),
    album = { albumId: 1, source: 'audius', sourceId: 'release' };
  const data = {
    album: { ...album, albumName: 'Release' },
    songs: [metadata(ref(1)), metadata(ref(2))],
  };
  const a = cache.album(album),
    b = cache.album(album);
  pending.resolve(Response.json(data));
  assert.deepEqual(await a, await b);
  assert.equal(calls, 1);
  assert.equal(cache.albumDisplay(album).albumName, 'Release');
  assert.equal(cache.albumTracks(album).length, 2);
  await cache.album(album);
  assert.equal(calls, 1);
  cache.clear();
  assert.equal(cache.albumTracks(album).length, 0);
  fetcher.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(cache.album(album));
  fetcher.mock.mockImplementation(async () => Response.json(data));
  await cache.album(album);
  assert.equal(cache.albumTracks(album).length, 2);
  cache.clear();
  const stale = deferred();
  fetcher.mock.mockImplementation(async () => stale.promise);
  const request = cache.album(album);
  cache.clear();
  stale.resolve(Response.json(data));
  await request;
  assert.equal(cache.albumTracks(album).length, 0);
});
