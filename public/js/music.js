import { api, clearLegacySession } from './api.js';
import { createPlayer } from './player.js';
import { createCatalogCache } from './catalog-cache.js';
import { element, artwork, externalLink, duration } from './music-ui.js';
const $ = (selector) => document.querySelector(selector);
const content = $('#mainContent'),
  status = $('#status'),
  cache = createCatalogCache();
let user,
  catalog = [],
  albums = [],
  sections = [],
  playlists = [],
  library = [],
  savedAlbums = [],
  currentPlaylist = null;
let navigation = 0,
  searchTimer,
  catalogLoading = true,
  catalogError = '',
  statusTimer;
function message(text) {
  clearTimeout(statusTimer);
  status.textContent = text;
  status.hidden = false;
  statusTimer = setTimeout(() => {
    status.hidden = true;
  }, 7000);
}
function fail(error) {
  if (error.name === 'AbortError') return;
  if (error.status === 401) {
    cache.clear();
    player.pause();
    location.replace('/login');
    return;
  }
  const dialog = document.querySelector('dialog[open]');
  if (!dialog) return message(error.message);
  let notice = dialog.querySelector('.request-error');
  if (!notice) {
    notice = element('p', '', 'notice request-error');
    notice.setAttribute('role', 'alert');
    dialog.append(notice);
  }
  notice.textContent = error.message;
}
async function run(action) {
  try {
    return await action();
  } catch (error) {
    fail(error);
  }
}
function button(text, action, className = 'text-button') {
  const node = element('button', text, className);
  node.type = 'button';
  node.addEventListener('click', () => run(action));
  return node;
}
const player = createPlayer(fail);
function routeLink(label, path, className) {
  const link = element('a', label, className);
  link.href = path;
  link.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    run(() => navigate(link.pathname + link.search));
  });
  return link;
}
function playlistLink(playlist) {
  return routeLink(playlist.playList, `/music/playlist/${playlist.playlistId}`);
}
async function refreshPlaylists() {
  ({ playlistNames: playlists } = await api(`/users/${user.userId}/playlists`));
  $('#sidebarPlaylists').replaceChildren(...playlists.map(playlistLink));
  if (!playlists.length)
    $('#sidebarPlaylists').append(element('p', 'Your first playlist starts here.', 'muted'));
}
async function refreshLibrary() {
  const data = await api(`/users/${user.userId}/library`);
  library = data.library;
  savedAlbums = data.albums;
}
function heading(title, description, level = 'h1') {
  const header = element('header', undefined, 'section-heading'),
    copy = element('div');
  copy.append(element(level, title));
  if (description) copy.append(element('p', description, 'muted'));
  header.append(copy);
  content.append(header);
  return header;
}
function playlistList(list) {
  const container = element('div', undefined, 'playlist-list');
  for (const playlist of list) {
    const link = playlistLink(playlist);
    link.className = 'playlist-tile';
    link.prepend(element('span', 'Your mix', 'playlist-kind'));
    container.append(link);
  }
  return container;
}
function saveButton(item, kind = 'songs') {
  const key = kind === 'songs' ? 'songId' : 'albumId';
  const saved = () => (kind === 'songs' ? library : savedAlbums).some((r) => r[key] === item[key]);
  const name = item.songName || item.albumName || 'unavailable item';
  const control = button('', async () => {
    control.disabled = true;
    try {
      const removing = saved();
      await api(`/users/${user.userId}/library/${kind}/${item[key]}`, {
        method: removing ? 'DELETE' : 'PUT',
      });
      await refreshLibrary();
      message(
        removing
          ? 'Removed from saved music. Your playlists stay as they are.'
          : kind === 'albums'
            ? 'Album saved to Library.'
            : 'Song saved to Library.',
      );
      if (location.pathname === '/music/library') {
        await render();
        content.focus();
      } else
        document.querySelectorAll(`[data-save-${kind}="${item[key]}"]`).forEach((node) => {
          const on = saved();
          node.textContent = on ? 'Saved' : 'Save';
          node.setAttribute('aria-pressed', String(on));
          node.setAttribute('aria-label', `${on ? 'Unsave' : 'Save'} ${name}`);
        });
    } finally {
      control.disabled = false;
    }
  });
  control.dataset['save' + (kind === 'songs' ? 'Songs' : 'Albums')] = item[key];
  control.textContent = saved() ? 'Saved' : 'Save';
  control.setAttribute('aria-pressed', String(saved()));
  control.setAttribute('aria-label', `${saved() ? 'Unsave' : 'Save'} ${name}`);
  return control;
}
function credits(song) {
  const details = element('details', undefined, 'track-credits');
  details.append(element('summary', 'Credits'));
  const copy = element('div');
  copy.append(element('p', song.artistName || 'Details unavailable'));
  if (song.sourceUrl)
    copy.append(
      externalLink(
        song.source === 'audius' ? 'Listen on Audius' : 'Original source',
        song.sourceUrl,
      ),
    );
  if (song.license) {
    const text = song.licenseUrl
      ? externalLink(song.license, song.licenseUrl)
      : element('span', song.license);
    copy.append(text);
  }
  if (song.source === 'audius')
    copy.append(
      externalLink('Streaming license', 'https://audius.org/open-music-license.pdf'),
      externalLink('Audius terms', 'https://audius.co/terms-of-use'),
    );
  details.append(copy);
  return details;
}
function songList(songs, { removable = false } = {}) {
  const list = element('ol', undefined, 'track-list');
  songs.forEach((song, index) => {
    const row = element('li', undefined, 'track-row'),
      play = button('', () => player.select(songs, index), 'track-play');
    row.dataset.songId = song.songId;
    play.setAttribute('aria-label', `Play ${song.songName}`);
    play.disabled = song.available === false;
    const copy = element('span', undefined, 'track-copy');
    copy.append(
      element('strong', song.songName),
      element('span', song.artistName || 'Details unavailable'),
    );
    play.append(element('span', String(index + 1).padStart(2, '0'), 'track-number'), copy);
    const controls = element('div', undefined, 'track-actions');
    controls.append(saveButton(song));
    const action = button(removable ? 'Remove' : 'Add', async () => {
      if (!removable) return openAdd(song);
      await api(`/playlists/${currentPlaylist}/songs/${song.songId}`, { method: 'DELETE' });
      await render();
      content.focus();
      message('Song removed from playlist.');
    });
    action.setAttribute(
      'aria-label',
      `${removable ? 'Remove' : 'Add'} ${song.songName}${removable ? ' from playlist' : ' to playlist'}`,
    );
    controls.append(action);
    row.append(
      play,
      element('time', duration(song.duration), 'track-time'),
      controls,
      credits(song),
    );
    list.append(row);
  });
  return list;
}
function trackCards(songs) {
  const grid = element('div', undefined, 'track-grid');
  for (const song of songs) {
    const card = element('article', undefined, 'track-card');
    const play = button('', () => player.select(songs, songs.indexOf(song)), 'cover-play');
    play.setAttribute('aria-label', `Play ${song.songName}`);
    play.disabled = song.available === false;
    play.append(artwork(song), element('span', 'Play', 'cover-play-label'));
    card.append(play, element('h3', song.songName), element('p', song.artistName, 'muted'));
    const actions = element('div', undefined, 'track-actions');
    actions.append(
      saveButton(song),
      button('Add', () => openAdd(song)),
      credits(song),
    );
    card.append(actions);
    grid.append(card);
  }
  return grid;
}
function albumShelf(refs) {
  const shelf = element('div', undefined, 'album-shelf');
  for (const ref of refs) {
    const album = cache.albumDisplay(ref),
      card = element('article', undefined, 'album-card');
    const link = routeLink('', `/music/album/${ref.albumId}`, 'album-link');
    link.append(
      artwork(album),
      element('h3', album.albumName),
      element('span', album.artistName, 'muted'),
    );
    link.setAttribute('aria-label', `Open album ${album.albumName}`);
    card.append(link, saveButton(album, 'albums'));
    shelf.append(card);
  }
  return shelf;
}
function empty(title, description) {
  const box = element('div', undefined, 'empty-state');
  box.append(
    element('h2', title),
    element('p', description),
    routeLink('Discover music', '/music/discover', 'button'),
  );
  content.append(box);
}
function catalogNotice() {
  if (!catalogLoading && !catalogError) return;
  const notice = element('div', undefined, 'catalog-notice');
  notice.setAttribute('role', 'status');
  notice.append(
    element(
      'p',
      catalogLoading
        ? 'Finding your next vibe…'
        : 'Some Audius details could not load. You can keep listening to loaded tracks, or try again.',
    ),
  );
  if (!catalogLoading)
    notice.append(button('Retry catalog', () => loadCatalog(), 'button button-quiet'));
  notice.append(routeLink('Play the local collection', '/music/discover?filter=local'));
  content.append(notice);
}
function filterLink(text, value, active, params) {
  const next = new URLSearchParams(params);
  next.set('filter', value);
  const link = routeLink(text, '/music/discover?' + next, 'filter-chip');
  if (value === active) link.setAttribute('aria-current', 'true');
  return link;
}
function renderDiscover(params) {
  const query = (params.get('q') || '').trim().toLowerCase(),
    filter = params.get('filter') || 'all';
  const header = heading('Discover', 'Find a sound. Make it yours.');
  const intro = element(
    'p',
    user.demo ? 'Your private demo lasts two hours.' : `Welcome back, ${user.username}.`,
    'demo-note',
  );
  header.append(intro);
  const filters = element('nav', undefined, 'filter-bar');
  filters.setAttribute('aria-label', 'Catalog filters');
  for (const [label, value] of [
    ['Featured', 'all'],
    ['All tracks', 'tracks'],
    ['Albums', 'albums'],
    ['Outside albums', 'singles'],
    ['Local collection', 'local'],
  ])
    filters.append(filterLink(label, value, filter, params));
  content.append(filters);
  if (filter !== 'local') catalogNotice();
  const all = catalog.map(cache.display);
  const genre = params.get('genre') || '',
    mood = params.get('mood') || '';
  const matchesTags = (song) => (!genre || song.style === genre) && (!mood || song.mood === mood);
  const tools = element('div', undefined, 'catalog-tools');
  for (const [key, label, values] of [
    ['genre', 'Genre', all.map((s) => s.style)],
    ['mood', 'Mood', all.map((s) => s.mood)],
  ]) {
    const field = element('label', label),
      select = element('select');
    select.setAttribute('aria-label', label);
    const option = element('option', 'All ' + label.toLowerCase() + 's');
    option.value = '';
    select.append(option);
    for (const value of [...new Set(values.filter(Boolean))].sort()) {
      const option = element('option', value);
      option.value = value;
      select.append(option);
    }
    select.value = params.get(key) || '';
    select.addEventListener('change', () => {
      const next = new URLSearchParams(params);
      next.set(key, select.value);
      run(() => navigate('/music/discover?' + next, { focus: false }));
    });
    field.append(select);
    tools.append(field);
  }
  if (query || genre || mood || filter !== 'all')
    tools.append(routeLink('Clear filters', '/music/discover', 'text-button'));
  content.append(tools);
  const matched = all.filter(
    (s) =>
      (filter === 'local' ? s.source === 'local' : s.source === 'audius') &&
      (filter !== 'singles' || s.standalone) &&
      matchesTags(s) &&
      (!query ||
        [s.songName, s.artistName, s.albumName, s.style, s.mood].some((v) =>
          String(v || '')
            .toLowerCase()
            .includes(query),
        )),
  );
  const filteredAlbums = albums.filter((ref) => {
    const a = cache.albumDisplay(ref);
    if ((genre || mood) && !cache.albumTracks(ref).some(matchesTags)) return false;
    return (
      !query ||
      [a.albumName, a.artistName].some((v) =>
        String(v || '')
          .toLowerCase()
          .includes(query),
      )
    );
  });
  if (filter === 'albums') {
    content.append(albumShelf(filteredAlbums));
    if (!filteredAlbums.length) empty('No matching albums.', 'Try another artist or release.');
    return;
  }
  if (query || genre || mood || filter !== 'all') {
    if (filter === 'all' && filteredAlbums.length) {
      const group = element('section', undefined, 'search-albums');
      group.append(element('h2', `Albums (${filteredAlbums.length})`), albumShelf(filteredAlbums));
      content.append(group);
    }
    heading(
      filter === 'local'
        ? 'The local collection'
        : filter === 'singles'
          ? 'Tracks outside albums'
          : 'All tracks',
      filter === 'local'
        ? 'Ten openly licensed tracks hosted by Vibe, ready when the catalog is unavailable.'
        : `${matched.length} ${matched.length === 1 ? 'match' : 'matches'} in the loaded catalog. ${cache.ready(catalog.filter((s) => s.source === 'audius'))} of ${catalog.filter((s) => s.source === 'audius').length} tracks available.`,
      'h2',
    );
    if (matched.length) {
      content.append(
        button('Play all', () => player.select(matched), 'button'),
        songList(matched),
      );
    } else empty('No matches yet.', 'Try another title, artist, or mood.');
    return;
  }
  const featured = albums[0] && cache.albumDisplay(albums[0]);
  if (featured?.artwork) {
    const hero = element('section', undefined, 'featured-release'),
      copy = element('div');
    const cover = routeLink('', `/music/album/${featured.albumId}`, 'featured-art');
    cover.append(artwork(featured));
    cover.setAttribute('aria-label', `Open album ${featured.albumName}`);
    copy.append(
      element('p', 'Stay for the whole record.', 'feature-intro'),
      element('h2', featured.albumName),
      element('p', featured.artistName, 'feature-artist'),
    );
    const actions = element('div', undefined, 'actions');
    actions.append(
      routeLink('Explore album', `/music/album/${featured.albumId}`, 'button'),
      saveButton(featured, 'albums'),
    );
    copy.append(actions);
    hero.append(cover, copy);
    content.append(hero);
  } else if (catalogLoading) {
    const skeleton = element('div', 'Loading the featured release…', 'catalog-skeleton');
    skeleton.setAttribute('aria-hidden', 'true');
    content.append(skeleton);
  }
  // Keep the featured cover above browsing controls on the small screen too.
  content.append(filters, tools);
  const releases = element('section', undefined, 'catalog-section');
  releases.append(element('h2', 'Start with an album'), albumShelf(albums));
  content.append(releases);
  for (const section of sections) {
    const tracks = section.trackIds
      .map((id) => all.find((s) => s.sourceId === id))
      .filter((s) => s?.available);
    if (!tracks.length) continue;
    const block = element('section', undefined, 'catalog-section');
    block.append(
      element('h2', section.name),
      element('p', section.description, 'muted'),
      trackCards(tracks.slice(0, 4)),
    );
    content.append(block);
  }
  content.append(
    routeLink('Browse all 100 tracks', '/music/discover?filter=tracks', 'button button-quiet'),
  );
  const credit = element('p', undefined, 'catalog-credit');
  credit.append(
    document.createTextNode('Independent music streamed from '),
    externalLink('Audius', 'https://audius.co'),
    document.createTextNode('. Artist and license credits are available on each track. '),
    externalLink('Audius Open Music License', 'https://audius.org/open-music-license.pdf'),
  );
  content.append(credit);
}
async function render() {
  const revision = ++navigation,
    path = location.pathname,
    params = new URLSearchParams(location.search);
  let songs, details, albumData;
  if (path.startsWith('/music/playlist/')) {
    const id = path.split('/').pop();
    [details, { songsList: songs }] = await Promise.all([
      api(`/playlists/${id}`),
      api(`/playlists/${id}/songs`),
    ]);
    try {
      await cache.hydrate(songs);
    } catch {
      catalogError = 'unavailable';
    }
    songs = songs.map(cache.display);
  } else if (path.startsWith('/music/album/')) {
    const id = Number(path.split('/').pop()),
      ref = albums.find((a) => a.albumId === id) || savedAlbums.find((a) => a.albumId === id);
    if (!ref) throw new Error('Album not found.');
    try {
      albumData = await cache.album(ref);
    } catch (error) {
      albumData = { album: cache.albumDisplay(ref), songs: [], error: error.message };
    }
  } else if (path === '/music/library') {
    try {
      await cache.hydrate(library);
    } catch {
      catalogError = 'unavailable';
    }
    if (params.get('tab') === 'albums')
      for (const ref of savedAlbums) {
        try {
          await cache.album(ref);
        } catch {
          catalogError = 'unavailable';
        }
      }
  }
  if (revision !== navigation) return;
  currentPlaylist = path.startsWith('/music/playlist/') ? path.split('/').pop() : null;
  content.replaceChildren();
  content.classList.toggle('library-view', path === '/music/library');
  $('#searchInput').value = params.get('q') || '';
  $('#searchInput').placeholder =
    path === '/music/library' ? 'Search your Library' : 'Search the catalog';
  if (currentPlaylist) {
    const header = heading(details.playlistName, `${songs.length} tracks in your mix`),
      actions = element('div', undefined, 'actions');
    if (songs.length) actions.append(button('Play all', () => player.select(songs), 'button'));
    actions.append(
      button(
        'Rename',
        () => openPlaylist(details.playlistName, currentPlaylist),
        'button button-quiet',
      ),
      button('Delete playlist', () => $('#deleteDialog').showModal(), 'button button-quiet'),
    );
    header.append(actions);
    if (songs.length) content.append(songList(songs, { removable: true }));
    else empty('Your mix starts here.', 'Discover a track and add it to this playlist.');
  } else if (albumData) {
    const { album, songs } = albumData;
    content.append(
      routeLink(
        'Back to Discover',
        history.state?.discoverReturn || '/music/discover',
        'back-link',
      ),
    );
    const hero = element('header', undefined, 'album-header'),
      copy = element('div');
    copy.append(
      element('p', 'Album', 'muted'),
      element('h1', album.albumName),
      element('p', album.artistName),
    );
    const actions = element('div', undefined, 'actions');
    if (songs.length) actions.append(button('Play album', () => player.select(songs), 'button'));
    actions.append(saveButton(album, 'albums'));
    copy.append(actions);
    hero.append(artwork(album), copy);
    content.append(hero);
    if (albumData.error) {
      content.append(
        element('p', albumData.error, 'notice'),
        button('Retry album', () => render(), 'button button-quiet'),
      );
    } else {
      content.append(
        element(
          'p',
          songs.length === album.trackCount
            ? `${songs.length} tracks, in release order`
            : `${songs.length} of ${album.trackCount} release tracks are currently in Vibe. Order is preserved.`,
          'muted',
        ),
        songList(songs),
      );
      if (album.sourceUrl)
        content.append(externalLink('View this release on Audius', album.sourceUrl));
    }
  } else if (path === '/music/library') {
    const tab = ['songs', 'albums', 'playlists'].includes(params.get('tab'))
      ? params.get('tab')
      : 'songs';
    const header = heading(
      'Your Library',
      user.demo
        ? 'Starter playlists are sample mixes. Save songs and albums to build your Library.'
        : 'Saved by you. Ready for another listen.',
    );
    header.append(button('Create playlist', () => openPlaylist(), 'button button-quiet'));
    const tabs = element('nav', undefined, 'library-tabs');
    tabs.setAttribute('aria-label', 'Library collections');
    for (const [key, name, count] of [
      ['songs', 'Songs', library.length],
      ['albums', 'Albums', savedAlbums.length],
      ['playlists', 'Playlists', playlists.length],
    ]) {
      const next = new URLSearchParams(params);
      next.set('tab', key);
      const link = routeLink(`${name} ${count}`, '/music/library?' + next);
      if (key === tab) link.setAttribute('aria-current', 'page');
      tabs.append(link);
    }
    content.append(tabs);
    const sortbar = element('div', undefined, 'library-tools'),
      label = element('label', 'Sort by');
    label.htmlFor = 'librarySort';
    const sort = element('select');
    sort.id = 'librarySort';
    for (const [key, value] of [
      ['recent', 'Recently saved'],
      ['name', 'Name'],
    ]) {
      const option = element('option', value);
      option.value = key;
      sort.append(option);
    }
    sort.value = params.get('sort') || 'recent';
    sort.addEventListener('change', () => {
      params.set('sort', sort.value);
      run(() => navigate('/music/library?' + params, { focus: false }));
    });
    sortbar.append(label, sort);
    content.append(sortbar);
    const query = (params.get('q') || '').toLowerCase();
    const items = (
      tab === 'songs'
        ? library.map(cache.display)
        : tab === 'albums'
          ? savedAlbums.map(cache.albumDisplay)
          : playlists
    ).filter(
      (x) =>
        !query ||
        [x.songName, x.artistName, x.albumName, x.playList].some((v) =>
          String(v || '')
            .toLowerCase()
            .includes(query),
        ),
    );
    if (sort.value === 'name')
      items.sort((a, b) =>
        (a.songName || a.albumName || a.playList || '').localeCompare(
          b.songName || b.albumName || b.playList || '',
        ),
      );
    else items.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
    if (items.length) {
      if (tab === 'songs') {
        content.append(
          button('Play saved songs', () => player.select(items), 'button'),
          songList(items),
        );
      } else content.append(tab === 'albums' ? albumShelf(items) : playlistList(items));
    } else
      empty(
        query ? 'Nothing here matches.' : `No saved ${tab} yet.`,
        query
          ? 'Try another title or artist in this collection.'
          : tab === 'songs'
            ? 'Tap Save on any track. Adding to a playlist is a separate choice.'
            : tab === 'albums'
              ? 'Save a whole release from Discover. Its tracks stay together.'
              : 'Create a playlist, then add the tracks that belong together.',
      );
    if (catalogError && tab !== 'playlists')
      content.append(
        element(
          'p',
          'Saved references remain removable while Audius details are unavailable.',
          'muted',
        ),
        button('Retry details', async () => {
          catalogError = '';
          await render();
        }),
      );
  } else renderDiscover(params);
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const active =
      link.dataset.nav === 'library'
        ? path === '/music/library' || Boolean(currentPlaylist)
        : path.includes('/discover') || path.includes('/album/');
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `${content.querySelector('h1')?.textContent || 'Music'} | Vibe`;
}
async function navigate(path, { replace = false, focus = true } = {}) {
  const discoverReturn =
    location.pathname === '/music/discover'
      ? location.pathname + location.search
      : history.state?.discoverReturn || '/music/discover';
  clearTimeout(searchTimer);
  history[replace ? 'replaceState' : 'pushState']({ discoverReturn }, '', path);
  status.hidden = true;
  await render();
  if (focus) {
    content.scrollTop = 0;
    content.focus();
  }
}
async function loadCatalog() {
  catalogLoading = true;
  catalogError = '';
  try {
    const first = sections
      .flatMap((s) => s.trackIds)
      .map((id) => catalog.find((r) => r.sourceId === id))
      .filter(Boolean);
    await cache.hydrate(first.slice(0, 25));
    if (albums[0]) await cache.album(albums[0]);
    if (location.pathname === '/music/discover') await render();
    await cache.hydrate(catalog);
    for (const album of albums.slice(1)) await cache.album(album);
  } catch (error) {
    catalogError = error.message;
  } finally {
    catalogLoading = false;
    if (location.pathname === '/music/discover') await render();
  }
}
let editId = null,
  pendingSong = null;
function openPlaylist(name = '', id = null) {
  editId = id;
  pendingSong = null;
  $('#dialogTitle').textContent = id ? 'Rename playlist' : 'Create playlist';
  $('#playlistName').value = name;
  $('#dialogError').hidden = true;
  $('#playlistDialog').showModal();
}
$('#newPlaylistButton').addEventListener('click', () => openPlaylist());
$('#closeDialog').addEventListener('click', () => $('#playlistDialog').close());
$('#playlistForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const save = event.submitter;
  save.disabled = true;
  try {
    const name = $('#playlistName').value.trim();
    const result = await api(
      editId ? `/playlists/${editId}/edit` : `/users/${user.userId}/playlists`,
      { method: editId ? 'PUT' : 'POST', body: { playlistName: name } },
    );
    const id = editId || result.playlistId;
    if (pendingSong) {
      editId = id; // Retrying an interrupted add must reuse the playlist just created.
      await api(`/playlists/${id}/songs`, { method: 'POST', body: { songId: pendingSong.songId } });
      pendingSong = null;
    }
    $('#playlistDialog').close();
    await refreshPlaylists();
    await navigate(`/music/playlist/${id}`);
    message('Playlist saved.');
  } catch (error) {
    $('#dialogError').textContent = error.message;
    $('#dialogError').hidden = false;
  } finally {
    save.disabled = false;
  }
});
function openAdd(song) {
  $('#addSongDialog .request-error')?.remove();
  $('#addSongTitle').textContent = song.songName;
  const choices = $('#playlistChoices');
  choices.replaceChildren();
  if (!playlists.length)
    choices.append(
      button(
        'Create your first playlist',
        () => {
          $('#addSongDialog').close();
          openPlaylist();
          pendingSong = song;
        },
        'button',
      ),
    );
  for (const playlist of playlists)
    choices.append(
      button(
        playlist.playList,
        async () => {
          await api(`/playlists/${playlist.playlistId}/songs`, {
            method: 'POST',
            body: { songId: song.songId },
          });
          $('#addSongDialog').close();
          message(`Added to ${playlist.playList}.`);
        },
        'playlist-choice',
      ),
    );
  $('#addSongDialog').showModal();
}
$('#closeAddDialog').addEventListener('click', () => $('#addSongDialog').close());
$('#cancelDelete').addEventListener('click', () => $('#deleteDialog').close());
$('#confirmDelete').addEventListener('click', () =>
  run(async () => {
    await api(`/playlists/${currentPlaylist}/delete`, { method: 'DELETE' });
    $('#deleteDialog').close();
    await refreshPlaylists();
    await navigate('/music/library?tab=playlists');
    message('Playlist deleted.');
  }),
);
$('#logoutButton').addEventListener('click', () =>
  run(async () => {
    await api('/logout', { method: 'POST' });
    cache.clear();
    player.pause();
    location.href = '/';
  }),
);
window.addEventListener('pagehide', () => {
  cache.clear();
  player.pause();
});
for (const link of document.querySelectorAll('[data-nav]'))
  link.addEventListener('click', (event) => {
    event.preventDefault();
    run(() => navigate(link.pathname));
  });
function search(replace = false) {
  const libraryPage = location.pathname === '/music/library';
  const params = new URLSearchParams(
    libraryPage || location.pathname === '/music/discover' ? location.search : '',
  );
  params.set('q', $('#searchInput').value.trim());
  return navigate((libraryPage ? '/music/library' : '/music/discover') + '?' + params, {
    replace,
    focus: false,
  });
}
$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  run(() => search());
});
$('#searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => run(() => search(true)), 300);
});
window.addEventListener('popstate', () => {
  clearTimeout(searchTimer);
  run(render);
});
clearLegacySession();
run(async () => {
  ({ user } = await api('/session'));
  $('#welcome').textContent = user.username;
  let data;
  try {
    data = await api('/catalog');
  } catch (error) {
    catalogLoading = false;
    catalogError = error.message;
    content.replaceChildren();
    heading('Your music could not load', error.message);
    content.append(button('Try again', () => location.reload(), 'button'));
    return;
  }
  catalog = data.songs;
  albums = data.albums;
  sections = data.sections;
  await Promise.all([refreshPlaylists(), refreshLibrary()]);
  await render();
  await loadCatalog();
});
