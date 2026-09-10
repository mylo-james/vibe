const { test, expect } = require('./fixtures.cjs');
test.beforeEach(async ({ page }) => {
  await page.route('**/api/catalog/metadata?*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Provider fixture unavailable' } }),
  );
  await page.route('**/api/catalog/albums/*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Provider fixture unavailable' } }),
  );
});
const AxeBuilder = require('@axe-core/playwright').default;
async function demo(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
}
function watch(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}
async function accessible(page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(violations).toEqual([]);
}
async function fits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const pane of await page
    .locator('.music-content, .section-heading, .section-heading .actions')
    .all()) {
    expect(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
}
test('listener can build, find, rename, remove and delete a playlist with safe text and browser history', async ({
  page,
}) => {
  const errors = watch(page);
  await demo(page);
  await page.getByRole('link', { name: 'Local collection', exact: true }).click();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('link', { name: /^Playlists \d+$/, exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  const literal = '<img src=x onerror=alert(1)>';
  await page.getByLabel('Playlist name', { exact: true }).fill(literal);
  await page.getByRole('button', { name: 'Save playlist' }).click();
  await expect(page.getByRole('heading', { name: literal, exact: true })).toBeVisible();
  expect(await page.locator('#mainContent img').count()).toBe(0);
  const playlistURL = page.url();
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await page.getByRole('link', { name: 'Local collection', exact: true }).click();
  await page.getByLabel('Search Discover or your Library').fill('Holizna');
  await expect(page.locator('.track-row')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Add Chills to playlist', exact: true }),
  ).toHaveText('+');
  await page.getByRole('button', { name: 'Add Chills to playlist', exact: true }).click();
  await page.getByRole('button', { name: literal, exact: true }).click();
  await expect(page.locator('#status')).toContainText('Added');
  await page.goto(playlistURL);
  await expect(page.locator('.track-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Playlist name', { exact: true }).fill('Night shift');
  await page.getByRole('button', { name: 'Save playlist' }).click();
  await expect(page.getByRole('heading', { name: 'Night shift', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your Library' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Night shift', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Your Library' })).toBeVisible();
  await page.goto(playlistURL);
  await expect(page.getByRole('button', { name: 'Remove Chills from playlist' })).toHaveText('×');
  await page.getByRole('button', { name: 'Remove Chills from playlist' }).click();
  await expect(page.getByRole('heading', { name: 'Your mix starts here.' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete playlist', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete playlist', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your Library' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Night shift', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('real audio plays, pauses, seeks, shuffles, repeats and survives in-app navigation', async ({
  page,
}) => {
  const errors = watch(page);
  await demo(page);
  await page.getByRole('link', { name: 'Local collection', exact: true }).click();
  await page.getByRole('button', { name: 'Play all', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate((a) => a.currentTime)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByLabel('Seek position').fill('40');
  expect(await page.locator('audio').evaluate((a) => a.paused)).toBe(true);
  expect(await page.locator('audio').evaluate((a) => a.currentTime)).toBeGreaterThan(10);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Next track' }).click();
  await expect(page.locator('#trackTitle')).toHaveText('Sherwood');
  await page.getByRole('button', { name: 'Previous track' }).click();
  await expect(page.locator('#trackTitle')).toHaveText('Chills');
  await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Shuffle', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Next track' }).click();
  await expect(page.locator('#trackTitle')).not.toHaveText('Chills');
  const title = await page.locator('#trackTitle').textContent();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.locator('#trackTitle')).toHaveText(title);
  expect(await page.locator('audio').evaluate((a) => a.paused)).toBe(false);
  await page.getByRole('button', { name: 'Repeat off', exact: true }).click();
  await page.getByRole('button', { name: 'Repeat all', exact: true }).click();
  await page.locator('audio').evaluate((a) => {
    a.currentTime = a.duration - 0.1;
  });
  await expect.poll(() => page.locator('audio').evaluate((a) => a.currentTime)).toBeLessThan(3);
  await expect(page.locator('#trackTitle')).toHaveText(title);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(errors).toEqual([]);
});
test('signup, logout, failed login and successful login show usable states', async ({ page }) => {
  const errors = watch(page);
  const name = 'browser' + Date.now();
  await page.goto('/signup');
  await page.getByLabel('Username', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(name + '@example.test');
  await page.getByLabel('Confirm email', { exact: true }).fill(name + '@example.test');
  await page.getByLabel('Password', { exact: true }).fill('a browser test passphrase');
  await page.getByLabel('Confirm password', { exact: true }).fill('mismatched passphrase');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Passwords must match');
  await page.getByLabel('Confirm password', { exact: true }).fill('a browser test passphrase');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('#welcome')).toHaveText(name);
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No saved songs yet.' })).toBeVisible();
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await page.getByRole('link', { name: 'Local collection', exact: true }).click();
  await page.getByRole('button', { name: 'Add Chills to playlist', exact: true }).click();
  await page.getByRole('button', { name: 'Create your first playlist', exact: true }).click();
  await page.getByLabel('Playlist name', { exact: true }).fill('First save');
  await page.getByRole('button', { name: 'Save playlist' }).click();
  await expect(page.getByRole('heading', { name: 'First save', exact: true })).toBeVisible();
  await expect(page.locator('.track-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('link', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(name + '@example.test');
  await page.getByLabel('Password', { exact: true }).fill('incorrect');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await page.getByLabel('Password', { exact: true }).fill('a browser test passphrase');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('#welcome')).toHaveText(name);
  expect(await page.evaluate(() => localStorage.getItem('VIBE_ACCESS_TOKEN'))).toBeNull();
  expect((await page.context().cookies()).find((c) => c.name === 'vibe_session').httpOnly).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['phone', { width: 390, height: 844 }],
]) {
  test(`${label}: landing, player, dialog, credits and auth are accessible and fit the viewport`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await accessible(page);
    await fits(page);
    await page.screenshot({ path: testInfo.outputPath(label + '-landing.png'), fullPage: true });
    await demo(page);
    await page.getByRole('link', { name: 'Local collection', exact: true }).click();
    await accessible(page);
    await fits(page);
    await page.screenshot({ path: testInfo.outputPath(label + '-music.png'), fullPage: true });
    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await page.getByRole('link', { name: /^Playlists \d+$/, exact: true }).click();
    await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
    await accessible(page);
    await page.getByLabel('Playlist name', { exact: true }).fill('Keyboard mix');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.goto('/credits');
    await accessible(page);
    await fits(page);
    await page.goto('/signup');
    await accessible(page);
    await fits(page);
  });
}

test('phone playlist controls remain reachable and browser errors offer navigation', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page);
  await page.getByRole('link', { name: 'Local collection', exact: true }).click();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('link', { name: 'Playlists 6', exact: true }).click();
  await page.getByRole('link', { name: 'Press start', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Press start', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play Level 1', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate((a) => a.currentTime)).toBeGreaterThan(0);
  await expect(page.locator('#trackTitle')).toHaveText('Level 1');
  await page.getByRole('button', { name: 'Next track', exact: true }).click();
  await expect(page.locator('#trackTitle')).toHaveText('Level 2');
  await accessible(page);
  await fits(page);
  await page.screenshot({ path: testInfo.outputPath('phone-playlist.png'), fullPage: true });
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to music' }).click();
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
});

test('blocked browser storage does not prevent the cookie-based demo from opening', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    });
  });
  const errors = watch(page);
  await demo(page);
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Local collection', exact: true }).click();
  await page.getByRole('button', { name: 'Play Chills', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate((a) => a.currentTime)).toBeGreaterThan(0);
  await page.getByLabel('Volume', { exact: true }).fill('65');
  expect(await page.locator('audio').evaluate((a) => a.volume)).toBeCloseTo(0.65);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(errors).toEqual([]);
});

test('demo network failure restores its button and reports a useful error', async ({ page }) => {
  await page.route('**/api/demo', (route) => route.abort('failed'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.locator('#error')).toContainText('Connection lost');
  await expect(page.getByRole('button', { name: 'Try the demo', exact: true })).toBeEnabled();
  await expect(page).toHaveURL('/');
});

for (const [url, submit] of [
  ['/login', 'Log in'],
  ['/signup', 'Create account'],
])
  test(`${url} keeps failed submissions editable and does not navigate on API errors`, async ({
    page,
  }) => {
    await page.route('**/api/' + (url === '/login' ? 'login' : 'sign-up'), (route) =>
      route.fulfill({ status: 503, json: { message: 'Service temporarily unavailable' } }),
    );
    await page.goto(url);
    if (url === '/signup') {
      await page.getByLabel('Username', { exact: true }).fill('failuretest');
      await page.getByLabel('Confirm email', { exact: true }).fill('failure@example.test');
      await page.getByLabel('Confirm password', { exact: true }).fill('a long test passphrase');
    }
    await page.getByLabel('Email', { exact: true }).fill('failure@example.test');
    await page.getByLabel('Password', { exact: true }).fill('a long test passphrase');
    await page.getByRole('button', { name: submit, exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Service temporarily unavailable');
    await expect(page.getByRole('button', { name: submit, exact: true })).toBeEnabled();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('failure@example.test');
    await expect(page).toHaveURL(url);
  });
