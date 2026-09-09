import { api } from './api.js';
// These maps die with this document. Never write provider descriptions to browser storage.
export function createCatalogCache() {
  const songs = new Map(),
    albums = new Map(),
    pending = new Map(),
    albumPending = new Map();
  let generation = 0;
  const display = (ref) => ({
    ...ref,
    ...(songs.get(ref.songId) ||
      (ref.source === 'audius'
        ? { songName: 'Details unavailable', artistName: 'Audius', available: false }
        : {})),
  });
  async function hydrate(refs) {
    const revision = generation;
    const unique = [...new Map(refs.map((ref) => [ref.songId, ref])).values()];
    for (let i = 0; i < unique.length; i += 25) {
      if (generation !== revision) return refs.map(display);
      // Recheck after each await: another caller may now own the next batch's IDs.
      const batch = unique
        .slice(i, i + 25)
        .filter((r) => r.source === 'audius' && !songs.has(r.songId) && !pending.has(r.songId));
      if (!batch.length) continue;
      const task = api('/catalog/metadata?ids=' + batch.map((r) => r.songId).join(','))
        .then((data) => {
          if (generation === revision) for (const song of data.songs) songs.set(song.songId, song);
        })
        .finally(() => {
          if (generation === revision) for (const ref of batch) pending.delete(ref.songId);
        });
      for (const ref of batch) pending.set(ref.songId, task);
      // Serial batches limit provider traffic and show the visible selection first.
      await task;
    }
    await Promise.all(refs.map((r) => pending.get(r.songId)).filter(Boolean));
    return refs.map(display);
  }
  async function album(ref) {
    if (albums.has(ref.albumId)) return albums.get(ref.albumId);
    if (!albumPending.has(ref.albumId)) {
      const revision = generation;
      albumPending.set(
        ref.albumId,
        api('/catalog/albums/' + ref.albumId)
          .then((data) => {
            if (generation === revision) {
              albums.set(ref.albumId, data);
              for (const song of data.songs) songs.set(song.songId, song);
            }
            return data;
          })
          .finally(() => {
            if (generation === revision) albumPending.delete(ref.albumId);
          }),
      );
    }
    return albumPending.get(ref.albumId);
  }
  function clear() {
    generation++;
    songs.clear();
    albums.clear();
    pending.clear();
    albumPending.clear();
  }
  return {
    hydrate,
    display,
    album,
    clear,
    albumTracks: (ref) => albums.get(ref.albumId)?.songs || [],
    albumDisplay: (ref) =>
      albums.has(ref.albumId)
        ? { ...ref, ...albums.get(ref.albumId).album }
        : {
            ...ref,
            albumName: 'Details unavailable',
            artistName: 'Audius',
          },
    ready: (refs) =>
      refs.filter((r) => r.source === 'local' || songs.get(r.songId)?.available).length,
  };
}
