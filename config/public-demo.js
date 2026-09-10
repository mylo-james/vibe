function publicDemoEnabled(env = process.env) {
  return env.VIBE_PUBLIC_DEMO === '1';
}

module.exports = { publicDemoEnabled };
