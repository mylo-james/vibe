export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function artwork(item, className = '') {
  const frame = element('span', undefined, 'cover-art ' + className);
  if (item?.artwork) {
    const img = element('img');
    img.src = item.artwork;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener(
      'error',
      () => {
        img.remove();
        frame.textContent = 'V';
      },
      { once: true },
    );
    frame.append(img);
  } else frame.textContent = 'V';
  return frame;
}
export function playlistArtwork(song) {
  const frame = artwork(song, 'playlist-cover');
  frame.setAttribute('aria-hidden', 'true');
  frame.dataset.style = song?.style || '';
  const fallback = () => {
    const record = element('span', song?.style === 'Chiptune' ? '8' : 'V', 'playlist-record');
    frame.replaceChildren(record);
  };
  const image = frame.querySelector('img');
  if (image) image.addEventListener('error', fallback, { once: true });
  else fallback();
  return frame;
}
export function externalLink(label, href) {
  const link = element('a', label);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}
export const duration = (value) =>
  Number.isFinite(value)
    ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`
    : '--';
