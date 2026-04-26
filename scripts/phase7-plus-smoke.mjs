import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3200';
const username = process.env.SMOKE_ADMIN_USER ?? 'admin';
const password = process.env.SMOKE_ADMIN_PASS ?? 'admin';
const screenshotDir =
  process.env.SMOKE_SCREENSHOT_DIR ??
  'docs/e2e-smoke/screenshots/2026-04-26-phase7-plus';
const reportPath =
  process.env.SMOKE_JSON_REPORT ??
  'docs/e2e-smoke/2026-04-26-phase7-plus-smoke-result.json';
const executablePath =
  process.env.SMOKE_BROWSER_EXECUTABLE ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined);

const routes = [
  ['01-dashboard-plus', '/dashboard'],
  ['04-topology', '/topology'],
  ['06-topology-viz', '/topology-viz'],
  ['07-tasks', '/tasks'],
  ['08-history', '/history'],
  ['09-mqtt-messages', '/mqtt/messages'],
  ['10-mqtt-nodes', '/mqtt/nodes'],
  ['11-logs', '/logs'],
  ['12-archives', '/archives'],
  ['13-site-config', '/site-config'],
  ['14-settings', '/settings'],
];

async function snapshot(page, name) {
  await page.screenshot({
    path: path.join(screenshotDir, `${name}.png`),
    fullPage: true,
  });
}

async function main() {
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });

  const browser = await chromium.launch({
    channel: executablePath ? undefined : 'chrome',
    executablePath,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const httpErrors = [];
  const sseRequests = [];
  const routeResults = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('requestfailed', (request) => {
    requestFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? 'unknown',
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      httpErrors.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
      });
    }
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/sync/events/stream')) {
      sseRequests.push({
        url: request.url(),
        hasAuthorization: Boolean(request.headers().authorization),
      });
    }
  });

  await page.goto(`${baseUrl}/topology`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor({
    timeout: 10_000,
  });
  const redirectBeforeLogin = await page.evaluate(() =>
    sessionStorage.getItem('admin_redirect_after_login'),
  );
  await snapshot(page, '02-login-dialog');

  await page.getByPlaceholder('ADMIN_USER 环境变量值').fill(username);
  await page.getByPlaceholder('ADMIN_PASS 环境变量值').fill(password);
  await page.getByRole('dialog').getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/topology', { timeout: 15_000 });
  await page.getByText('异地拓扑').first().waitFor({ timeout: 10_000 });
  await snapshot(page, '03-login-success');

  for (const [name, route] of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(route === '/logs' || route === '/mqtt/nodes' ? 2500 : 1200);
    await snapshot(page, name);
    routeResults.push({
      name,
      route,
      url: page.url(),
      title: await page.title(),
    });
  }

  const result = {
    baseUrl,
    browser: executablePath ?? 'chrome channel',
    redirectBeforeLogin,
    routeCount: routeResults.length,
    routeResults,
    sseRequests,
    consoleErrors,
    pageErrors,
    requestFailures,
    httpErrors,
    screenshots: screenshotDir,
    generatedAt: new Date().toISOString(),
  };

  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await browser.close();

  console.log(JSON.stringify(result, null, 2));

  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
