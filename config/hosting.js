function exactHttpsOrigin(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.origin !== value || url.protocol !== 'https:' || url.username || url.password)
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function allowedOrigins(env = process.env) {
  const canonical = exactHttpsOrigin(env.VIBE_PUBLIC_ORIGIN);
  const preview =
    env.VERCEL_ENV === 'preview' ? exactHttpsOrigin(env.VIBE_PREVIEW_ORIGIN) : undefined;
  return [canonical, preview].filter(Boolean);
}

function trustProxy(env = process.env) {
  return env.VERCEL === '1' ? 1 : 'loopback';
}

function configuredRequestOrigin(req, env = process.env) {
  if (!req.secure) return undefined;
  const host = req.get('host');
  return allowedOrigins(env).find((origin) => new URL(origin).host === host);
}

function allowsWriteOrigin(req, env = process.env) {
  const origin = req.get('Origin');
  if (!origin) return true;
  if (env.NODE_ENV === 'production' || env.VERCEL === '1')
    return origin === configuredRequestOrigin(req, env);
  return origin === `${req.protocol}://${req.get('host')}`;
}

function cookieIsSecure(req, env = process.env) {
  return env.NODE_ENV === 'production' || req.secure;
}

const serverlessPool = {
  max: 3,
  min: 0,
  idle: 5_000,
  acquire: 10_000,
  evict: 1_000,
};

module.exports = {
  allowedOrigins,
  allowsWriteOrigin,
  configuredRequestOrigin,
  cookieIsSecure,
  serverlessPool,
  trustProxy,
};
