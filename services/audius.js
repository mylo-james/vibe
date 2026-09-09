// Public, read-only Audius adapter. No audio proxy, account writes or metadata cache.
const origins = new Set(require('../data/audius-origins.json'));
const API = 'https://api.audius.co/v1';
const { httpError } = require('../utils');
function eligible(t) {
  return (
    t?.is_streamable === true &&
    t.is_stream_gated === false &&
    t.access?.stream === true &&
    !t.is_unlisted &&
    !t.is_scheduled_release &&
    !t.is_delete &&
    t.is_available !== false &&
    (!t.allowed_api_keys || t.allowed_api_keys.length === 0) &&
    !t.stream_conditions
  );
}
function asset(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && origins.has(u.origin)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function artwork(a) {
  return asset(a?.['480x480']) || asset(a?.['150x150']);
}
function permalink(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
    return 'https://audius.co';
  try {
    const url = new URL(value, 'https://audius.co');
    return url.origin === 'https://audius.co' && !url.username && !url.password
      ? url.href
      : 'https://audius.co';
  } catch {
    return 'https://audius.co';
  }
}
async function read(path, { signal, fetcher = fetch } = {}) {
  // A single deadline covers both attempts, including any Retry-After delay.
  const deadline = AbortSignal.timeout(15000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetcher(API + path, {
        signal: combined,
        cache: 'no-store',
        redirect: 'error',
      });
      if (res.ok) {
        const body = await res.json();
        if (!Array.isArray(body.data))
          throw httpError(502, 'Audius returned an unexpected response.');
        return body.data;
      }
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        const after = res.headers.get('retry-after');
        const wait = after
          ? /^\d+(\.\d+)?$/.test(after)
            ? Number(after) * 1000
            : Math.max(0, Date.parse(after) - Date.now())
          : 350;
        await require('node:timers/promises').setTimeout(Number.isFinite(wait) ? wait : 350, null, {
          signal: combined,
        });
        continue;
      }
      throw httpError(
        res.status === 404 ? 404 : 503,
        'Audius is unavailable. Try again, or play the local collection.',
      );
    } catch (error) {
      if (combined.aborted)
        throw httpError(504, 'Audius took too long. Try again, or play the local collection.');
      if (error.status || attempt)
        throw error.status ? error : httpError(503, 'Audius could not be reached.');
    }
  }
}
async function tracks(ids, options) {
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 25 ||
    ids.some((id) => !/^[a-zA-Z0-9]{1,32}$/.test(id))
  )
    throw httpError(400, 'Request between 1 and 25 catalog IDs.');
  return read('/tracks?' + ids.map((id) => 'id=' + encodeURIComponent(id)).join('&'), options);
}
function licenseUrl(label) {
  const suffix = {
    'Attribution CC BY': 'by',
    'Attribution ShareAlike CC BY-SA': 'by-sa',
    'Attribution-NoDerivatives CC BY-ND': 'by-nd',
    'Attribution-NonCommercial CC BY-NC': 'by-nc',
    'Attribution-NonCommercial-ShareAlike CC BY-NC-SA': 'by-nc-sa',
    'Attribution-NonCommercial-NoDerivatives CC BY-NC-ND': 'by-nc-nd',
  }[label];
  return suffix
    ? `https://creativecommons.org/licenses/${suffix}/4.0/`
    : label
      ? null
      : 'https://audius.org/open-music-license.pdf';
}
function normalizeTrack(t, ref) {
  if (!t || !eligible(t)) return { ...ref, available: false, songName: 'Details unavailable' };
  return {
    ...ref,
    available: true,
    songName: t.title,
    artistName: t.user?.name || 'Unknown artist',
    artistUrl: permalink('/' + encodeURIComponent(t.user?.handle || '')),
    sourceUrl: permalink(t.permalink),
    duration: t.duration,
    style: t.genre,
    mood: t.mood,
    artwork: artwork(t.artwork),
    license: t.license || 'Audius Open Music License',
    licenseUrl: licenseUrl(t.license),
    albumName: t.album_backlink?.playlist_name || null,
    standalone: !t.album_backlink,
  };
}
function stream(t) {
  if (!eligible(t)) throw httpError(410, 'This track is no longer available for playback.');
  let primary;
  try {
    primary = new URL(t.stream?.url);
  } catch {
    throw httpError(503, 'Audius did not return a usable stream. Choose another track.');
  }
  const urls = [
    t.stream?.url,
    ...(t.stream?.mirrors || []).map((origin) => {
      const base = asset(origin);
      return base ? new URL(primary.pathname + primary.search, base).href : null;
    }),
  ];
  const url = urls.map(asset).find(Boolean);
  if (!url)
    throw httpError(
      503,
      'This track is on an unverified audio host. Choose another track or the local collection.',
    );
  return url;
}
module.exports = { read, tracks, eligible, asset, artwork, permalink, normalizeTrack, stream };
