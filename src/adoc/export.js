import fs from 'node:fs';
import path from 'node:path';
import { PATHS, ROOT, ensureDir, loadConfig, today, writeJson } from '../lib/config.js';
import { attach, closeChrome, launchChrome } from './browser.js';
import { parseAdocExport } from './parse.js';

const config = loadConfig();
const { url: base, portDebug: port, navigateur } = config.adoc;

ensureDir(PATHS.adocDir);
const xlsPath = path.join(PATHS.adocDir, `adherents-${today()}.xls`);

console.log('Adoc : export de la liste des adhérents en cours…');
const listUrl = `${base}membreListe.do?method=listAdherentsEnCours`;
const proc = await launchChrome({ url: listUrl, port, browserPath: navigateur });

const { browser, page } = await attach({ port, base });
try {
  if (!page.url().includes('listAdherentsEnCours')) await page.goto(listUrl);

  const total = await page
    .locator('text=/\\d[\\d\\s,.]* éléments trouvés/')
    .first()
    .textContent({ timeout: 15_000 })
    .catch(() => null);
  if (total) console.log(`  Adoc annonce : ${total.trim()}`);

  // Même requête que le bouton « Exporter », faite depuis la page, sans téléchargement.
  const b64 = await page.evaluate(async () => {
    const f = document.membreListeForm;
    if (!f) throw new Error('Formulaire de la liste des adhérents introuvable : la page d\'Adoc a peut-être changé.');
    const fd = new FormData(f);
    fd.set('method', 'exportAdherent');
    const r = await fetch(f.action, { method: 'POST', body: new URLSearchParams(fd), credentials: 'include' });
    if (!r.ok) throw new Error(`Export Adoc refusé (HTTP ${r.status}).`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });

  const buf = Buffer.from(b64, 'base64');
  const magic = buf.subarray(0, 4).toString('hex');
  if (magic !== 'd0cf11e0' && !magic.startsWith('504b')) {
    throw new Error('Adoc n\'a pas renvoyé un fichier Excel (session expirée ?). Relancez la commande.');
  }
  fs.writeFileSync(xlsPath, buf);
} finally {
  await closeChrome(browser, proc);
}

const parsed = parseAdocExport(fs.readFileSync(xlsPath), config.adoc.colonnes);
writeJson(PATHS.adherents, { date: today(), source: path.relative(ROOT, xlsPath), ...parsed });

const sansTel = parsed.adherents.filter((a) => a.telephones.length === 0).length;
console.log(`  Fichier : ${path.relative(ROOT, xlsPath)}`);
console.log(`  Colonnes de l'export : ${parsed.colonnes.join(' | ')}`);
console.log(`  Utilisées : nom = « ${parsed.colonnesUtilisees.nom} », prénom = « ${parsed.colonnesUtilisees.prenom} »`);
console.log(`  Téléphones : ${parsed.colonnesUtilisees.telephones.map((c) => `« ${c} »`).join(', ')}`);
console.log(`✅ ${parsed.adherents.length} adhérents lus, dont ${sansTel} sans numéro exploitable.`);
process.exit(0);
