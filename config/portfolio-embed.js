// An optional, exact parent origin. Default and invalid configuration stay same-origin only.
function portfolioEmbedOrigin(env = process.env) {
  const raw = env.VIBE_PORTFOLIO_ORIGIN;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const publicPortfolio = raw === 'https://mjames.dev';
    const previewPortfolio = env.VERCEL_ENV === 'preview' && raw === 'https://preview.mjames.dev';
    const privatePortfolio = env.NODE_ENV !== 'production' && url.hostname.endsWith('.ts.net');
    if (
      url.origin !== raw ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (!publicPortfolio && !previewPortfolio && !privatePortfolio)
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
module.exports = { portfolioEmbedOrigin };
