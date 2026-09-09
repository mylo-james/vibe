import { api } from './api.js';
export function createPlayer(reportError) {
  const $ = (selector) => document.querySelector(selector);
  const audio = $('#trackAudio'),
    play = $('#playButton'),
    progress = $('#progress-bar');
  const nextButton = $('#nextButton'),
    previousButton = $('#prevButton'),
    shuffleButton = $('#shuffleButton'),
    repeatButton = $('#repeatButton'),
    volume = $('#volume');
  let queue = [],
    order = [],
    position = 0,
    shuffle = false,
    repeat = 'off',
    revision = 0,
    controller,
    timer,
    loading = false,
    refreshed = false;
  const failures = new Set();
  let failedRevision = -1;
  const current = () => queue[order[position]];
  const format = (n) =>
    Number.isFinite(n)
      ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`
      : '0:00';
  function state(label) {
    const ready = Boolean(current());
    play.disabled = previousButton.disabled = nextButton.disabled = !ready;
    progress.disabled = !ready || !Number.isFinite(audio.duration);
    play.setAttribute('aria-label', loading || !audio.paused ? 'Pause' : 'Play');
    play
      .querySelector('path')
      .setAttribute('d', loading || !audio.paused ? 'M8 5v14M16 5v14' : 'M8 5l11 7-11 7z');
    $('#startTime').textContent = format(audio.currentTime);
    $('#endTime').textContent = format(audio.duration);
    progress.value =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? (audio.currentTime / audio.duration) * 100
        : 0;
    if (label) {
      $('#playerState').textContent = label;
      $('#trackArt').dataset.playing = String(label === 'Playing');
      document.dispatchEvent(new Event('vibe:playback'));
    }
  }
  function shuffleIndices(indices) {
    const result = [...indices];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function show(song) {
    $('#trackTitle').textContent = song.songName || 'Loading track…';
    $('#trackArtist').textContent = song.artistName || 'Audius';
    $('#trackArt').textContent =
      song.source === 'audius' ? 'V' : song.style === 'Chiptune' ? '8' : 'V';
    $('#trackArt').dataset.style = song.style || '';
  }
  function deadline(token) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (token !== revision) return;
      controller?.abort();
      ++revision; // A late response must not revive a timed-out selection.
      handleFailure(new Error('This track took too long to start.'));
    }, 15000);
  }
  async function resume() {
    if (!current()) return;
    if (!audio.getAttribute('src') || failures.has(current().songId)) {
      failures.delete(current().songId);
      return load();
    }
    const token = revision;
    loading = true;
    state('Loading');
    deadline(token);
    try {
      await audio.play();
    } catch (error) {
      if (token !== revision || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') {
        clearTimeout(timer);
        loading = false;
        state('Press Play to listen');
        return;
      }
      await handleFailure(error);
    }
  }
  async function load(refresh = false) {
    const song = current();
    if (!song) return;
    controller?.abort();
    clearTimeout(timer);
    const token = ++revision;
    controller = new AbortController();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    loading = true;
    refreshed = refresh;
    show(song);
    state('Loading');
    deadline(token);
    try {
      const data =
        song.source === 'audius'
          ? await api(`/catalog/songs/${song.songId}/stream`, { signal: controller.signal })
          : { url: song.audioPath, song };
      if (token !== revision) return;
      if (!data.url) throw new Error('This track is unavailable.');
      queue[order[position]] = { ...song, ...data.song };
      show(current());
      audio.src = data.url;
      await resume();
    } catch (error) {
      if (token === revision && error.name !== 'AbortError') await handleFailure(error);
    }
  }
  async function handleFailure(error) {
    if (failedRevision === revision) return;
    failedRevision = revision;
    clearTimeout(timer);
    loading = false;
    audio.pause();
    const song = current();
    if (!song) return;
    if (song.source === 'audius' && !refreshed && audio.error && !controller?.signal.aborted)
      return load(true);
    failures.add(song.songId);
    state('Unavailable');
    reportError(
      new Error(
        `“${song.songName || 'This track'}” could not play. ${error.status === 401 ? 'Sign in again.' : 'Try another track or the local collection.'}`,
      ),
    );
    const next = order.findIndex((index, i) => i > position && !failures.has(queue[index].songId));
    if (next >= 0) {
      position = next;
      await load();
    } else {
      loading = false;
      audio.removeAttribute('src');
      audio.load();
      state('Queue stopped. Choose a track.');
    }
  }
  async function select(songs, index = 0) {
    if (!songs.length) return;
    queue = [...songs];
    failures.clear();
    order = queue.map((_, i) => i);
    if (shuffle) order = [index, ...shuffleIndices(order.filter((i) => i !== index))];
    position = shuffle ? 0 : index;
    await load();
  }
  function pause() {
    controller?.abort();
    ++revision;
    clearTimeout(timer);
    loading = false;
    audio.pause();
    state('Paused');
  }
  async function next(ended = false) {
    if (!current()) return;
    if (ended && repeat === 'one') {
      audio.currentTime = 0;
      await resume();
      return;
    }
    if (position + 1 >= order.length) {
      if (repeat !== 'all') {
        pause();
        state('Finished');
        return;
      }
      position = 0;
    } else position++;
    await load();
  }
  play.addEventListener('click', () => (loading || !audio.paused ? pause() : resume()));
  nextButton.addEventListener('click', () => next());
  previousButton.addEventListener('click', () => {
    if (!current()) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      resume();
    } else {
      position = Math.max(0, position - 1);
      load();
    }
  });
  shuffleButton.addEventListener('click', () => {
    const index = order[position];
    shuffle = !shuffle;
    if (queue.length) {
      order = shuffle
        ? [index, ...shuffleIndices(queue.map((_, i) => i).filter((i) => i !== index))]
        : queue.map((_, i) => i);
      position = shuffle ? 0 : index;
    }
    shuffleButton.setAttribute('aria-pressed', String(shuffle));
  });
  repeatButton.addEventListener('click', () => {
    repeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
    repeatButton.setAttribute('aria-label', `Repeat ${repeat}`);
    repeatButton.setAttribute('aria-pressed', String(repeat !== 'off'));
    repeatButton.dataset.mode = repeat;
  });
  volume.addEventListener('input', () => {
    audio.volume = Number(volume.value) / 100;
    try {
      localStorage.setItem('vibe-volume', volume.value);
    } catch {}
  });
  let saved = 30;
  try {
    saved = Number(localStorage.getItem('vibe-volume') ?? 30);
  } catch {}
  volume.value = Number.isFinite(saved) ? Math.max(0, Math.min(100, saved)) : 30;
  audio.volume = Number(volume.value) / 100;
  progress.addEventListener('input', () => {
    if (Number.isFinite(audio.duration))
      audio.currentTime = (Number(progress.value) / 100) * audio.duration;
  });
  for (const event of ['timeupdate', 'loadedmetadata', 'play'])
    audio.addEventListener(event, () => state());
  audio.addEventListener('playing', () => {
    if (audio.paused) return;
    clearTimeout(timer);
    loading = false;
    state('Playing');
  });
  audio.addEventListener('pause', () => {
    if (!loading) state('Paused');
  });
  for (const event of ['waiting', 'stalled'])
    audio.addEventListener(event, () => {
      if (!audio.paused && (event !== 'stalled' || audio.readyState < 3)) {
        state('Buffering');
        deadline(revision);
      }
    });
  audio.addEventListener('ended', () => {
    state('Finished');
    next(true);
  });
  audio.addEventListener('error', () => {
    if (audio.getAttribute('src') && audio.currentSrc === audio.src)
      handleFailure(new Error('Audio unavailable.'));
  });
  return { select, current, pause };
}
