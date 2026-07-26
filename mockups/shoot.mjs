// Screenshot all mockup HTML pages -> mockups/shots/*.png
import { chromium } from 'playwright';
import { readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(dir, 'shots'), { recursive: true });
const browser = await chromium.launch();
const files = readdirSync(dir).filter(f => /^\d+.*\.html$/.test(f)).sort();
for (const f of files) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto('file://' + join(dir, f));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(dir, 'shots', f.replace('.html', '.png')), fullPage: true });
  console.log('shot', f);
  await page.close();
}
await browser.close();
