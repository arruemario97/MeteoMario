import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const captures = 'assets/captures';
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9' });
await page.route('**://cmp.inmobi.com/**', (route) => route.abort());
await page.route('**://securityannex.net/**', (route) => route.abort());

async function open(url) {
  await page.goto(url, { waitUntil: 'commit', timeout: 20_000 });
  await page.waitForTimeout(5_000);
  await page.waitForTimeout(1_000);
}

async function capture(selector, filename) {
  await captureLocator(page.locator(selector).first(), filename);
}

async function captureLocator(target, filename) {
  await target.waitFor({ state: 'visible', timeout: 20_000 });
  await target.screenshot({ path: `${captures}/${filename}`, animations: 'disabled' });
}

async function captureClip(selector, filename, height) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`No se pudo ver el bloque ${selector}`);
  await page.screenshot({
    path: `${captures}/${filename}`,
    clip: { x: 0, y: Math.max(0, box.y), width: 1440, height },
    animations: 'disabled',
  });
}

async function captureFixed(filename, y, height) {
  await page.screenshot({
    path: `${captures}/${filename}`,
    clip: { x: 0, y, width: 1440, height },
    animations: 'disabled',
  });
}

async function capturePadded(selector, filename, padding) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`No se pudo ver el bloque ${selector}`);
  const x = Math.max(0, box.x - padding.left);
  const y = Math.max(0, box.y - padding.top);
  await page.screenshot({
    path: `${captures}/${filename}`,
    clip: {
      x,
      y,
      width: box.width + padding.left + padding.right,
      height: box.height + padding.top + padding.bottom,
    },
    animations: 'disabled',
  });
}

async function captureFrom(selector, filename, height) {
  const target = page.locator(selector).first();
  await target.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);
  const box = await target.boundingBox();
  if (!box) throw new Error(`No se pudo ver el bloque ${selector}`);
  await page.screenshot({
    path: `${captures}/${filename}`,
    clip: { x: 0, y: box.y, width: 1440, height },
    animations: 'disabled',
  });
}

async function captureTableRange(startSelector, tableSelector, filename, height) {
  const start = page.locator(startSelector).first();
  const table = page.locator(tableSelector).first();
  await start.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  const startBox = await start.boundingBox();
  const tableBox = await table.boundingBox();
  if (!startBox || !tableBox) throw new Error('No se pudo localizar la tabla de Surf-Forecast');
  await page.screenshot({
    path: `${captures}/${filename}`,
    clip: { x: tableBox.x, y: startBox.y, width: tableBox.width, height },
    animations: 'disabled',
  });
}

async function captureCroppedElement(selector, filename, height) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const originalStyle = await target.getAttribute('style');
  await target.evaluate((element, cropHeight) => {
    element.style.height = `${cropHeight}px`;
    element.style.overflow = 'hidden';
  }, height);
  try {
    await captureLocator(target, filename);
  } finally {
    if (originalStyle === null) await target.evaluate((element) => element.removeAttribute('style'));
    else await target.setAttribute('style', originalStyle);
  }
}

try {
  await mkdir(captures, { recursive: true });

  await page.setViewportSize({ width: 1200, height: 1000 });
  await open('https://tablademareas.com/es/guipuzcoa/san-sebastian');
  await capturePadded('#l_brujula_mareas >> xpath=..', 'tide-status.png', { top: 26, right: 0, bottom: 18, left: 22 });
  await capture('#l_grafico_mareas >> xpath=..', 'tide-chart.png');
  await captureLocator(page.locator('.grafico_estado_actual_fondo').filter({ hasText: 'coeficiente de mareas' }).first(), 'tide-coefficient.png');

  await page.setViewportSize({ width: 3300, height: 1200 });
  await open('https://www.windguru.cz/48687');
  await capture('#tabid_0_content_div', 'windguru.png');

  await page.setViewportSize({ width: 1600, height: 1000 });
  await open('https://es.surf-forecast.com/breaks/Zurriola-hondartza/forecasts/latest');
  await captureTableRange('.forecast-table-days__container', '.forecast-table__table--content', 'surf-forecast.png', 540);

  await writeFile(`${captures}/status.json`, JSON.stringify({ updatedAt: new Date().toISOString() }));
} finally {
  await browser.close();
}
