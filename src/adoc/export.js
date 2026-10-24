import fs from 'node:fs';
import path from 'node:path';
import { PATHS, ROOT, ensureDir, loadConfig, today, writeJson } from '../lib/config.js';
import { openAdoc, isInsideAdoc } from './browser.js';
import { parseAdocExport } from './parse.js';

const config = loadConfig();
const base = config.adoc.url;
const headless = !process.argv.includes('--visible');

ensureDir(PATHS.adocDir);
const xlsPath = path.join(PATHS.adocDir, `adherents-${today()}.xls`);

console.log('Adoc : export de la liste des adhérents en cours…');
const context = await openAdoc({ headless });
try {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${base}membreListe.do?method=listAdherentsEnCours`);

  if (!isInsideAdoc(page, base)) {
    throw new Error('Session Adoc expirée ou absente.\n→ Lancez `npm run adoc:connexion` puis recommencez.');
  }

  const total = (await page.locator('text=/\\d[\\d\\s,.]* éléments trouvés/').first().textContent().catch(() => ''))
    ?.trim();
  if (total) console.log(`  Adoc annonce : ${total}`);

  const exportLink = page.locator('a[href*="exportAdherent"]').first();
  if ((await exportLink.count()) === 0) {
    throw new Error("Lien « Exporter » introuvable sur la page des adhérents en cours. La page d'Adoc a peut-être changé.");
  }

  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), exportLink.click()]);
  await download.saveAs(xlsPath);
} finally {
  await context.close();
}

const parsed = parseAdocExport(fs.readFileSync(xlsPath), config.adoc.colonnes);
writeJson(PATHS.adherents, { date: today(), source: path.relative(ROOT, xlsPath), ...parsed });

const sansTel = parsed.adherents.filter((a) => a.telephones.length === 0).length;
console.log(`  Fichier : ${path.relative(ROOT, xlsPath)}`);
console.log(`  Colonnes utilisées : nom = « ${parsed.colonnesUtilisees.nom} », prénom = « ${parsed.colonnesUtilisees.prenom} »`);
console.log(`  Colonnes téléphone : ${parsed.colonnesUtilisees.telephones.map((c) => `« ${c} »`).join(', ')}`);
console.log(`✅ ${parsed.adherents.length} adhérents lus, dont ${sansTel} sans numéro exploitable.`);
