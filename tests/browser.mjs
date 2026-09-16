import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(2500);
  assert.match(await page.locator('h1').innerText(), /Abraão/);
  assert.doesNotMatch(await page.locator('body').innerText(), /CRUSHING|TRAILS|SHAPING|DOWNHILL|GUIDÃO/);
  await page.screenshot({ path: 'artifacts/desktop.png' });
  assert.equal(await page.locator('.gpu-fallback:visible').count(), 0);
  assert.ok(await page.locator('canvas').evaluate(canvas => !!canvas.getContext('webgl2')));
  await page.locator('[data-boost]').click();
  assert.ok(await page.locator('.hero').evaluate(el => el.classList.contains('is-boosting')));
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.hero').evaluate(el => el.classList.contains('is-boosting')), false);
  await page.getByRole('link', { name: 'Conheça minha história' }).click();
  await page.waitForTimeout(800);
  assert.equal(new URL(page.url()).hash, '#sobre');
  assert.match(await page.locator('.hero-content').innerText(), /3º ano do ensino médio no IFRO/);
  assert.ok(await page.locator('#sobre img').evaluate(img => img.complete && img.naturalWidth > 0));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  assert.ok(await page.locator('[data-boost]').isDisabled());
  assert.deepEqual(errors, []);
  console.log('PASS: desktop, mobile, WebGL/shaders, photo, navigation, boost expiry, reduced motion; no browser errors.');
} finally { await browser.close(); }
