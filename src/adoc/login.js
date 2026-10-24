import { loadConfig } from '../lib/config.js';
import { openAdoc, isInsideAdoc } from './browser.js';

const config = loadConfig();
const base = config.adoc.url;

console.log("Une fenêtre Chromium va s'ouvrir sur Adoc.");
console.log('Connectez-vous normalement avec votre compte FFT. La fenêtre se fermera toute seule ensuite.\n');

const context = await openAdoc({ headless: false });
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(`${base}accueil.do?method=read`);

const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  if (isInsideAdoc(page, base) && (await page.locator('a[href*="membreListe.do"]').count()) > 0) {
    console.log('✅ Connecté à Adoc. La session est enregistrée pour les prochaines exécutions.');
    await context.close();
    process.exit(0);
  }
  await page.waitForTimeout(1500);
}

console.error('⏱️ Pas de connexion détectée après 10 minutes. Relancez `npm run adoc:connexion`.');
await context.close();
process.exit(1);
