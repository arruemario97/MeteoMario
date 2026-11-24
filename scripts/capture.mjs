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
  const target = page.locator(selector).first();
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

try {
  await mkdir(captures, { recursive: true });

  await open('https://tablademareas.com/es/guipuzcoa/san-sebastian');
  await capture('#l_brujula_mareas >> xpath=..', 'tide-status.png');
  await capture('#l_grafico_mareas', 'tide-chart.png');
  await capture('#_coeficiente_mareas >> xpath=..', 'tide-coefficient.png');

  await open('https://www.windguru.cz/48687');
  await captureFixed('windguru.png', 106, 520);

  await open('https://es.surf-forecast.com/breaks/Zurriola-hondartza/forecasts/latest');
  await capture('.surf-forecast-table', 'surf-forecast.png');

  await writeFile(`${captures}/status.json`, JSON.stringify({ updatedAt: new Date().toISOString() }));
} finally {
  await browser.close();
}
