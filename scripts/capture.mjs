import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const captures = 'assets/captures';
const weatherUrl = 'https://weather.com/es-ES/es/gipuzkoa/city/san-sebastian';
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

async function captureTideChart() {
  const chart = page.locator('#l_grafico_mareas').locator('..');
  const grid = chart.locator('#grid_mareas');
  await chart.waitFor({ state: 'visible' });
  if (!(await grid.isVisible())) {
    await page.waitForFunction(() => typeof gm !== 'undefined' && typeof gm.MostrarEsconderGrid === 'function');
    await chart.dispatchEvent('click');
  }
  await grid.waitFor({ state: 'visible' });
  await grid.locator('img').evaluate((image) => image.decode());
  await captureLocator(chart, 'tide-chart.png');
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

  // Keep Surf-Forecast's native metre labels and scale in metric mode.
  await table.evaluate((element) => {
    const swellUnit = element.querySelector('.forecast-table__header-container--swell .heightu');
    const tideUnit = element.querySelector('.tide-time__units');
    const wind = element.querySelector('.forecast-table__header-container--wind');
    if (
      swellUnit?.textContent.trim() !== 'm' ||
      (tideUnit && tideUnit.textContent.trim() !== 'm') ||
      !wind?.textContent.includes('km/h')
    ) {
      throw new Error('Surf-Forecast did not render the forecast in metres and km/h');
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

async function setWeatherMetric(metricReading) {
  const consent = page.locator('iframe[title="SP Consent Message"]');
  await consent.waitFor({ state: 'visible', timeout: 4_000 }).catch(() => {});
  if (await consent.isVisible()) {
    await consent.contentFrame().getByRole('button', { name: 'Rechazar todo', exact: true }).click();
  }

  const settings = page.getByTestId('header-settings-button');
  const metric = page.getByRole('radio', { name: '°C', exact: true });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (!(await metric.isVisible())) await settings.click({ timeout: 8_000 });
      if ((await metric.getAttribute('aria-checked', { timeout: 5_000 })) !== 'true') {
        await metric.dispatchEvent('click', {}, { timeout: 5_000 });
      }
      await metricReading.waitFor({ state: 'visible', timeout: 12_000 });
      if (await metric.isVisible()) await settings.click({ timeout: 5_000 });
      await metric.waitFor({ state: 'hidden', timeout: 5_000 });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

async function captureWeatherHourly() {
  await page.setViewportSize({ width: 3800, height: 1250 });
  await open(`${weatherUrl}/today`);

  const scroller = page.locator('main [data-scroll-container="true"]').filter({
    has: page.getByText('Ahora', { exact: true }),
  }).first();
  const chart = scroller.locator('..');
  await chart.waitFor({ state: 'visible' });
  await setWeatherMetric(page.locator('main').getByText(/\d+\s*km\/h/).first());
  await chart.evaluate((element) => {
    const scroll = element.querySelector('[data-scroll-container="true"]');
    const style = getComputedStyle(scroll);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const contentWidth = scroll.firstElementChild.offsetWidth + padding;
    // Expand the carousel to its native content width for a single panoramic capture.
    element.style.width = `${contentWidth + element.offsetWidth - element.clientWidth}px`;
    element.querySelectorAll(':scope > button').forEach((button) => { button.style.display = 'none'; });
    scroll.scrollLeft = 0;
  });
  if (await scroller.evaluate((element) => element.scrollWidth > element.clientWidth + 1)) {
    throw new Error('Parte de la previsión horaria queda fuera de la captura');
  }
  await captureLocator(chart, 'weather-hourly.png');
}

async function captureWeatherDaily() {
  await page.setViewportSize({ width: 1400, height: 1250 });
  await open(`${weatherUrl}/tenday`);

  const forecast = page.getByTestId('daily-forecast');
  const header = forecast.getByText('Día', { exact: true }).locator('xpath=../..');
  const days = forecast.locator('h3 > button[aria-expanded]');
  await days.nth(9).waitFor({ state: 'visible' });
  await setWeatherMetric(days.first().getByText(/\d+\s*km\/h/));

  const lastDay = days.nth(9).locator('xpath=../..');
  const headerBox = await header.boundingBox();
  const lastBox = await lastDay.boundingBox();
  if (!headerBox || !lastBox) throw new Error('No se encontraron los diez días de previsión');
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.screenshot({
    path: `${captures}/weather-ten-day.png`,
    fullPage: true,
    clip: {
      x: headerBox.x,
      y: headerBox.y + scrollY,
      width: headerBox.width,
      height: lastBox.y + lastBox.height - headerBox.y,
    },
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
  await captureTideChart();
  await captureLocator(page.locator('.grafico_estado_actual_fondo').filter({ hasText: 'coeficiente de mareas' }).first(), 'tide-coefficient.png');

  await page.setViewportSize({ width: 3300, height: 1200 });
  await open('https://www.windguru.cz/48687');
  await capture('#tabid_0_content_div', 'windguru.png');

  await page.setViewportSize({ width: 1600, height: 1280 });
  const surfForecast = 'https://es.surf-forecast.com/breaks/Zurriola-hondartza/forecasts/latest';
  await captureSurfForecast(surfForecast, 'surf-hourly.png');
  await captureSurfForecast(`${surfForecast}/six_day`, 'surf-six-day.png');
  await captureWeatherHourly();
  await captureWeatherDaily();

  await writeFile(`${captures}/status.json`, JSON.stringify({ updatedAt: new Date().toISOString() }));
} finally {
  await browser.close();
}
