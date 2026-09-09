const { test, expect } = require('./fixtures.cjs');
const AxeBuilder = require('@axe-core/playwright').default;
const local = require('../../data/catalog.json')[0];
async function provider(page) {
  const state = { catalog: null, batches: [], streams: [], offline: false };
  await page.route('**/api/catalog', async (route) => {
    const response = await route.fetch();
    state.catalog = await response.json();
    await route.fulfill({ response, json: state.catalog });
  });
  const song = (ref) => {
    const index = state.catalog.songs
      .filter((s) => s.source === 'audius')
      .findIndex((s) => s.songId === ref.songId);
    const album = index < 12 ? state.catalog.albums[Math.floor(index / 2)] : null;
    return {
      ...ref,
      songName: 'Track ' + ref.sourceId,
      artistName: 'Independent artist',
      available: true,
      standalone: !album,
      albumName: album ? 'Release ' + album.albumId : null,
      duration: 120,
      style: index % 2 === 0 ? 'Electronic' : 'Rock',
      mood: index % 3 === 0 ? 'Peaceful' : 'Upbeat',
      artwork: '/public/images/favicon.ico',
      sourceUrl: 'https://audius.co/artist/track',
      license: 'Audius Open Music License',
      licenseUrl: 'https://audius.org/open-music-license.pdf',
    };
  };
  await page.route('**/api/catalog/metadata?*', async (route) => {
    if (state.offline)
      return route.fulfill({ status: 503, json: { message: 'Provider unavailable' } });
    const ids = new URL(route.request().url()).searchParams.get('ids').split(',').map(Number);
    state.batches.push(ids);
    await route.fulfill({
      json: { songs: ids.map((id) => song(state.catalog.songs.find((s) => s.songId === id))) },
    });
  });
  await page.route('**/api/catalog/albums/*', async (route) => {
    if (state.offline)
      return route.fulfill({ status: 503, json: { message: 'Provider unavailable' } });
    const id = Number(new URL(route.request().url()).pathname.split('/').pop());
    const albumIndex = state.catalog.albums.findIndex((a) => a.albumId === id);
    const a = state.catalog.albums[albumIndex];
    await route.fulfill({
      json: {
        album: {
          ...a,
          albumName: 'Release ' + id,
          artistName: 'Independent artist',
          artwork: '/public/images/favicon.ico',
          sourceUrl: 'https://audius.co/artist/album',
          trackCount: 2,
        },
        songs: state.catalog.songs
          .filter((s) => s.source === 'audius')
          .slice(albumIndex * 2, albumIndex * 2 + 2)
          .map(song),
      },
    });
  });
  await page.route('**/api/catalog/songs/*/stream', async (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-2));
    state.streams.push(id);
    await route.fulfill({
      json: { url: local.audioPath, song: song(state.catalog.songs.find((s) => s.songId === id)) },
    });
  });
  return state;
}
async function demo(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
}
async function settled(page) {
  await expect(page.locator('.catalog-notice')).toHaveCount(0);
}
async function fit(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const item of await page
    .locator(
      '.music-content,.section-heading,.album-header,.featured-release,.track-actions,.track-row',
    )
    .all())
    expect(await item.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
}
test('Discover, albums, independent saves, playlists and session cache form one listening journey', async ({
  page,
}) => {
  const state = await provider(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await demo(page);
  await settled(page);
  const allIds = state.batches.flat();
  expect(Math.max(...state.batches.map((b) => b.length))).toBeLessThanOrEqual(25);
  expect(new Set(allIds).size).toBe(allIds.length);
  const album = state.catalog.albums[0];
  const track = state.catalog.songs.find((s) => s.source === 'audius');
  const name = 'Track ' + track.sourceId;
  await page.getByRole('link', { name: 'Explore album', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Release ' + album.albumId, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save Release ' + album.albumId, exact: true }).click();
  await page.getByRole('button', { name: 'Play ' + name, exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate((a) => a.currentTime)).toBeGreaterThan(0);
  await expect(page.locator('#playerState')).toHaveText('Playing');
  await expect(page.locator('#trackArt')).toHaveAttribute('data-playing', 'true');
  await page.getByRole('button', { name: 'Save ' + name, exact: true }).click();
  await page.getByRole('button', { name: 'Add ' + name + ' to playlist', exact: true }).click();
  await page.getByRole('button', { name: 'Late-night focus', exact: true }).click();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Songs 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Albums 1', exact: true })).toBeVisible();
  expect(await page.locator('audio').evaluate((a) => a.paused)).toBe(false);
  await page.getByRole('button', { name: 'Unsave ' + name, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No saved songs yet.' })).toBeVisible();
  await page.getByRole('link', { name: 'Late-night focus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play ' + name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#trackArt')).toHaveAttribute('data-playing', 'false');
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'vibe-volume')),
  ).toEqual([]);
  expect(state.streams.length).toBe(1);
  expect(errors).toEqual([]);
});
test('fresh-session provider failure keeps saved references removable and local playback available', async ({
  page,
}) => {
  const state = await provider(page);
  await demo(page);
  await settled(page);
  await page.getByRole('link', { name: 'All tracks', exact: true }).click();
  const ref = state.catalog.songs.find((s) => s.source === 'audius'),
    name = 'Track ' + ref.sourceId;
  await page.getByRole('button', { name: 'Save ' + name, exact: true }).click();
  state.offline = true;
  await page.goto('/music/library');
  await expect(
    page.getByRole('button', { name: 'Play Details unavailable', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Unsave Details unavailable', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No saved songs yet.' })).toBeVisible();
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await page.getByRole('link', { name: 'Local collection', exact: true }).click();
  await page.getByRole('button', { name: 'Play all', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate((a) => a.currentTime)).toBeGreaterThan(0);
});
test('rapid selection and a paused pending load never start an older track', async ({ page }) => {
  // Deliver a response after cancellation to exercise the player's revision guard.
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (url, options) =>
      original(url, String(url).endsWith('/stream') ? { ...options, signal: undefined } : options);
  });
  const state = await provider(page);
  await demo(page);
  await settled(page);
  await page.getByRole('link', { name: 'All tracks', exact: true }).click();
  const tracks = state.catalog.songs.filter((s) => s.source === 'audius').slice(0, 2);
  let firstRequested, release;
  const seen = new Promise((r) => (firstRequested = r)),
    delayed = new Promise((r) => (release = r));
  await page.route(`**/api/catalog/songs/${tracks[0].songId}/stream`, async (route) => {
    firstRequested();
    await delayed;
    await route.fulfill({
      json: {
        url: local.audioPath,
        song: { ...tracks[0], songName: 'Old selection', artistName: 'A' },
      },
    });
  });
  await page.getByRole('button', { name: 'Play Track ' + tracks[0].sourceId, exact: true }).click();
  await seen;
  await page.getByRole('button', { name: 'Play Track ' + tracks[1].sourceId, exact: true }).click();
  const oldResponse = page.waitForResponse((r) =>
    r.url().endsWith(`/songs/${tracks[0].songId}/stream`),
  );
  release();
  await (await oldResponse).finished();
  await expect(page.locator('#trackTitle')).toHaveText('Track ' + tracks[1].sourceId);
  await expect.poll(() => page.locator('audio').evaluate((a) => a.currentTime)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  let releasePause, seenPause;
  const pausedRequest = new Promise((r) => (seenPause = r)),
    waitPause = new Promise((r) => (releasePause = r));
  await page.route(`**/api/catalog/songs/${tracks[1].songId}/stream`, async (route) => {
    seenPause();
    await waitPause;
    await route.fulfill({
      json: { url: local.audioPath, song: { ...tracks[1], songName: 'Should stay paused' } },
    });
  });
  await page.getByRole('button', { name: 'Play Track ' + tracks[1].sourceId, exact: true }).click();
  await pausedRequest;
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const pausedResponse = page.waitForResponse((r) =>
    r.url().endsWith(`/songs/${tracks[1].songId}/stream`),
  );
  releasePause();
  await (await pausedResponse).finished();
  await expect(page.locator('#playerState')).toHaveText('Paused');
  expect(await page.locator('audio').evaluate((a) => a.paused)).toBe(true);
});
test('failed queue stops after one pass even with repeat enabled', async ({ page }) => {
  const state = await provider(page);
  await demo(page);
  await settled(page);
  await page.getByRole('link', { name: 'Explore album', exact: true }).click();
  let requests = 0;
  await page.route('**/api/catalog/songs/*/stream', async (route) => {
    requests++;
    await route.fulfill({ status: 503, json: { message: 'Unavailable' } });
  });
  await page.getByRole('button', { name: 'Repeat off', exact: true }).click();
  await page.getByRole('button', { name: 'Play album', exact: true }).click();
  await expect(page.locator('#playerState')).toHaveText('Queue stopped. Choose a track.');
  expect(requests).toBe(2);
  expect(await page.locator('audio').evaluate((a) => a.paused)).toBe(true);
});
test('record and original waveform respect system reduced motion and offscreen state without a motion button', async ({
  page,
}) => {
  await provider(page);
  await page.goto('/');
  const disk = page.locator('.record-disk');
  await expect
    .poll(() => disk.evaluate((n) => getComputedStyle(n).animationPlayState))
    .toBe('running');
  await expect(page.locator('.motion-toggle')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => disk.evaluate((n) => getComputedStyle(n).animationPlayState))
    .toBe('paused');
  const angle = await disk.evaluate((n) => getComputedStyle(n).transform);
  expect(await disk.evaluate((n) => getComputedStyle(n).transform)).toBe(angle);
  expect(await page.locator('.brand-trace').getAttribute('d')).toContain('83.87-355.18');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 400 });
  await page.locator('.site-header').scrollIntoViewIfNeeded();
  await expect
    .poll(() => disk.evaluate((n) => getComputedStyle(n).animationPlayState))
    .toBe('paused');
});
for (const width of [390, 768, 1440])
  test(`catalog and Library fit at ${width}px, with keyboard and accessibility checks`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await provider(page);
    await demo(page);
    await settled(page);
    await fit(page);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath('discover.png') });
    await page.getByRole('link', { name: 'Explore album', exact: true }).click();
    await fit(page);
    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await page.getByRole('button', { name: 'Create playlist', exact: true }).last().click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await fit(page);
    await page.screenshot({ path: info.outputPath('library.png') });
    if (width === 1440) {
      await page.evaluate(() => (document.documentElement.style.zoom = '2'));
      await fit(page);
    }
  });

test('catalog search combines genre and mood, separates albums and tracks, and returns with filters intact', async ({
  page,
}) => {
  const state = await provider(page);
  await demo(page);
  await settled(page);
  await page.getByLabel('Genre', { exact: true }).selectOption('Electronic');
  await page.getByLabel('Mood', { exact: true }).selectOption('Peaceful');
  await page
    .getByLabel('Search Discover or your Library', { exact: true })
    .fill('Independent artist');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Albums (2)', exact: true })).toBeVisible();
  await expect(page.locator('.track-row')).toHaveCount(17);
  const filtered = page.url();
  await page
    .getByRole('link', {
      name: 'Open album Release ' + state.catalog.albums[0].albumId,
      exact: true,
    })
    .click();
  await page.getByRole('link', { name: 'Back to Discover', exact: true }).click();
  await expect(page).toHaveURL(filtered);
  await expect(page.getByLabel('Genre', { exact: true })).toHaveValue('Electronic');
  await expect(page.getByLabel('Mood', { exact: true })).toHaveValue('Peaceful');
  await page.getByRole('link', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByLabel('Search Discover or your Library', { exact: true })).toHaveValue('');
  await page.getByRole('link', { name: 'All tracks', exact: true }).click();
  await expect(page.locator('.track-row')).toHaveCount(100);
  await page.getByRole('link', { name: 'Outside albums', exact: true }).click();
  await expect(page.locator('.track-row')).toHaveCount(88);
  const albumTrack = state.catalog.songs.find((s) => s.source === 'audius');
  await expect(
    page.getByRole('button', { name: 'Play Track ' + albumTrack.sourceId, exact: true }),
  ).toHaveCount(0);
});
test('an expired audio URL is refreshed once and system reduced motion leaves audio playing', async ({
  page,
}) => {
  const state = await provider(page);
  await demo(page);
  await settled(page);
  await page.getByRole('link', { name: 'All tracks', exact: true }).click();
  const track = state.catalog.songs.find((s) => s.source === 'audius');
  let calls = 0;
  await page.route(`**/api/catalog/songs/${track.songId}/stream`, async (route) => {
    calls++;
    await route.fulfill({
      json: {
        url: calls === 1 ? '/public/expired-audio.mp3' : local.audioPath,
        song: { ...track, songName: 'Recovered audio', artistName: 'Artist' },
      },
    });
  });
  await page.getByRole('button', { name: 'Play Track ' + track.sourceId, exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate((a) => a.currentTime)).toBeGreaterThan(0);
  expect(calls).toBe(2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => page.locator('#trackArt').evaluate((n) => getComputedStyle(n).animationPlayState))
    .toBe('paused');
  expect(await page.locator('audio').evaluate((a) => a.paused)).toBe(false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect
    .poll(() => page.locator('#trackArt').evaluate((n) => getComputedStyle(n).animationPlayState))
    .toBe('running');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});

test('a stalled stream lookup times out and cannot autoplay when its response arrives late', async ({
  page,
}) => {
  await page.clock.install();
  // Model a response already beyond cancellation; the player must still reject stale results.
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (url, options) =>
      original(url, String(url).endsWith('/stream') ? { ...options, signal: undefined } : options);
  });
  const state = await provider(page);
  await demo(page);
  await settled(page);
  await page.getByRole('link', { name: 'All tracks', exact: true }).click();
  const track = state.catalog.songs.find((s) => s.source === 'audius');
  // A one-song Library makes queue exhaustion the intended result of this timeout.
  await page.getByRole('button', { name: 'Save Track ' + track.sourceId, exact: true }).click();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.locator('.track-row')).toHaveCount(1);
  let release, requested;
  const gate = new Promise((r) => {
    release = r;
  });
  const seen = new Promise((r) => {
    requested = r;
  });
  await page.route(`**/api/catalog/songs/${track.songId}/stream`, async (route) => {
    requested();
    await gate;
    await route.fulfill({
      json: { url: local.audioPath, song: { ...track, songName: 'Too late' } },
    });
  });
  await page.getByRole('button', { name: 'Play Track ' + track.sourceId, exact: true }).click();
  await seen;
  try {
    await page.clock.fastForward(15001);
    await expect(page.locator('#playerState')).toHaveText('Queue stopped. Choose a track.');
  } finally {
    const response = page.waitForResponse((r) => r.url().endsWith(`/songs/${track.songId}/stream`));
    release();
    await (await response).finished();
  }
  await page.clock.runFor(100);
  await expect(page.locator('#playerState')).toHaveText('Queue stopped. Choose a track.');
  expect(await page.locator('audio').evaluate((a) => a.paused && !a.hasAttribute('src'))).toBe(
    true,
  );
  await expect(page.locator('#trackTitle')).not.toHaveText('Too late');
});
