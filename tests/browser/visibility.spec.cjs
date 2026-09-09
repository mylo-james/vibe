const { test, expect } = require('./fixtures.cjs');

test('visibility lifecycle signal pauses and resumes nonessential loops', async ({ page }) => {
  // This tests the app's visibility handler. Actual native tab hiding remains a manual check:
  // Chrome on this host reports document.hidden=false even after a headed tab switch.
  await page.goto('/');
  const state = () =>
    page.locator('.record-disk').evaluate((n) => getComputedStyle(n).animationPlayState);
  await expect.poll(state).toBe('running');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(state).toBe('paused');
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(state).toBe('running');
});
