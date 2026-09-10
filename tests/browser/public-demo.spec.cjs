const { test, expect } = require('./fixtures.cjs');

test.skip(
  process.env.VIBE_PUBLIC_DEMO !== '1',
  'Runs only against the public disposable-demo profile.',
);

async function showPublicLanding(page) {
  await page.goto('/');
  await expect(page.getByText('No account, email, or lasting profile.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Create account', exact: true })).toHaveCount(0);
}

async function startDemo(page) {
  await showPublicLanding(page);
  await page.getByRole('button', { name: 'Start a 2-hour demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
  await page.locator('.discover-demo summary').click();
  await expect(
    page.getByText(
      'This temporary listening space expires after two hours. Its saved playlists and music are deleted when a new demo starts or during daily cleanup.',
    ),
  ).toBeVisible();
  await page.locator('.discover-demo summary').click();
}

async function expectPhoneFit(page, viewport) {
  await page.setViewportSize(viewport);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const name of ['Play', 'Pause', 'Next track', 'More playback controls']) {
    const control = page.getByRole('button', { name, exact: true });
    if (!(await control.count())) continue;
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
}

test('public mode opens a disposable music session without lasting account paths', async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 664 });
  await showPublicLanding(page);

  for (const route of ['/login', '/signup']) {
    await page.goto(route);
    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('button', { name: 'Start a 2-hour demo', exact: true }),
    ).toBeVisible();
  }
  await startDemo(page);

  await page.getByRole('link', { name: 'Local collection', exact: true }).click();
  await page.getByRole('button', { name: 'Play all', exact: true }).click();
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => audio.currentTime))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByLabel('Seek position', { exact: true }).fill('40');
  expect(await page.locator('audio').evaluate((audio) => audio.paused)).toBe(true);
  expect(await page.locator('audio').evaluate((audio) => audio.currentTime)).toBeGreaterThan(10);

  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).last().click();
  await page.getByLabel('Playlist name', { exact: true }).fill('Two hour mix');
  await page.getByRole('button', { name: 'Save playlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Two hour mix', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Two hour mix', exact: true })).toBeVisible();

  const isolated = await browser.newContext({ viewport: { width: 390, height: 664 } });
  const other = await isolated.newPage();
  try {
    await other.goto('/music/library');
    await expect(other).toHaveURL('/');
    await expect(
      other.getByRole('button', { name: 'Start a 2-hour demo', exact: true }),
    ).toBeVisible();
  } finally {
    await isolated.close();
  }

  for (const viewport of [
    { width: 390, height: 664 },
    { width: 320, height: 568 },
  ])
    await expectPhoneFit(page, viewport);
  await page.getByRole('button', { name: 'End demo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Start a 2-hour demo', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
