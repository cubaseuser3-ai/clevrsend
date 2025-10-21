import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('🔍 Checking clevrsend.vercel.app...');
await page.goto('https://clevrsend.vercel.app', { waitUntil: 'networkidle' });

// Collect console logs
const logs = [];
page.on('console', msg => {
  const text = msg.text();
  logs.push(text);
});

// Wait for app to initialize
await page.waitForTimeout(3000);

console.log('\n📋 All console logs:');
logs.forEach(log => {
  if (log.includes('v1.') || log.includes('version') || log.includes('Version') || log.includes('Frontend') || log.includes('Backend')) {
    console.log('  ✅', log);
  }
});

// Check visible version text on page
const bodyText = await page.textContent('body');
const versionMatches = bodyText.match(/v?1\.[0-9]+\.[0-9]+/g);
if (versionMatches) {
  console.log('\n🏷️  Version strings found on page:', [...new Set(versionMatches)]);
}

// Take screenshot
await page.screenshot({ path: '/Users/mytech/Downloads/MyTech Apps/Alternative/ClevrSend/version-check.png', fullPage: false });
console.log('\n📸 Screenshot saved!');

await browser.close();
