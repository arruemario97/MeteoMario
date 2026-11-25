import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const captures = 'assets/captures';
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9' });
await page.route('**://cmp.inmobi.com/**', (route) => route.abort());
await page.route('**://securityannex.net/**', (route) => route.abort());

async function open(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: 45_000 });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(attempt * 1_000);
    }
  }
  if (lastError) throw lastError;
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

async function captureSurfForecast(url, filename) {
  await open(url);
  const table = page.locator('.forecast-table__table--content').first();
  const unitsButton = table.locator('.switch-units--table');
  await unitsButton.click();
  const metric = page.locator('input[name="units"][value="Metric"]:visible');
  await metric.waitFor({ state: 'visible' });
  if (!(await metric.isChecked())) await metric.locator('xpath=..').click();
  if (await metric.isVisible()) await unitsButton.click();
  await metric.waitFor({ state: 'hidden' });

  // In its metric preset Surf-Forecast still renders wave and tide heights in metres.
  await table.evaluate((element) => {
    const swellUnits = element.querySelectorAll('.forecast-table__header-container--swell .heightu');
    const wind = element.querySelector('.forecast-table__header-container--wind');
    if (!swellUnits.length || swellUnits[0].textContent.trim() !== 'm' || !wind?.textContent.includes('km/h')) {
      throw new Error('Surf-Forecast did not switch to the metric preset');
    }

    const toCentimetres = (height) => {
      const metres = height.textContent.trim().replace(',', '.');
      if (/^-?\d+(?:\.\d+)?$/.test(metres)) {
        height.textContent = String(Math.round(Number(metres) * 100));
      }
    };

    element.querySelectorAll('.swell-icon__val').forEach(toCentimetres);
    swellUnits.forEach((unit) => { unit.textContent = 'cm'; });
    element.querySelectorAll('.tide-time').forEach((tide) => {
      const height = tide.querySelector('.tide-time__height');
      const unit = tide.querySelector('.tide-time__units');
      if (height && unit?.textContent.trim() === 'm') {
        toCentimetres(height);
        unit.textContent = ' cm';
      }
    });

    // Match the existing graph ticks and express their labels in centimetres.
    const scale = element.querySelector('.forecast-table__scale');
    if (scale) {
      const ticks = [[2, 1000], [23, 500], [35, 300], [43, 200], [52, 100], [75, 0]];
      const marks = ticks.map(([y]) => `M27 ${y}H32`).join(' ');
      const labels = ticks.map(([y, cm]) => {
        const baseline = Math.max(7, Math.min(75, y + 2));
        return `<text x="25" y="${baseline}">${cm}</text>`;
      }).join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 76">
        <path d="M31 2V75 ${marks}" fill="none" stroke="#111"/>
        <g fill="#111" font-family="sans-serif" font-size="8" text-anchor="end">${labels}</g>
      </svg>`;
      scale.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
      scale.alt = 'Escala de olas en centímetros';
    }
  });

  const start = table.locator('.forecast-table-days__container').first();
  const lowTideRow = table.locator('.forecast-table__header-container--low-tide').locator('xpath=ancestor::tr');
  await start.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await table.locator('.forecast-table__scale').evaluate((image) => image.decode());
  const startBox = await start.boundingBox();
  const tableBox = await table.boundingBox();
  const tideBox = await lowTideRow.boundingBox();
  if (!startBox || !tableBox || !tideBox) throw new Error('No se pudo localizar la tabla de Surf-Forecast');
  const height = Math.ceil(tideBox.y + tideBox.height + 1 - startBox.y);
  if (startBox.y + height > page.viewportSize().height) {
    throw new Error('La fila de marea baja queda fuera de la captura de Surf-Forecast');
  }
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

  await page.setViewportSize({ width: 1600, height: 1280 });
  const surfForecast = 'https://es.surf-forecast.com/breaks/Zurriola-hondartza/forecasts/latest';
  await captureSurfForecast(surfForecast, 'surf-hourly.png');
  await captureSurfForecast(`${surfForecast}/six_day`, 'surf-six-day.png');

  await writeFile(`${captures}/status.json`, JSON.stringify({ updatedAt: new Date().toISOString() }));
} finally {
  await browser.close();
}
