import fs from 'node:fs';
import path from 'node:path';
import { PATHS, ROOT, ensureDir, loadConfig, today, writeJson } from '../lib/config.js';
import { parseAdocExport } from './parse.js';

// Lit l'export Excel des adhérents fait à la main dans Adoc.
// Usage : npm run adoc:importer -- chemin/vers/export.xls
//         (sans chemin : le fichier .xls/.xlsx le plus récent du dossier data/adoc/)

const config = loadConfig();
let source = process.argv[2];

if (!source) {
  ensureDir(PATHS.adocDir);
  const candidates = fs
    .readdirSync(PATHS.adocDir)
    .filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith('adherents-'))
    .map((f) => path.join(PATHS.adocDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  source = candidates[0];
  if (!source) {
    throw new Error(
      'Aucun export trouvé.\n→ Indiquez le fichier : npm run adoc:importer -- ~/Téléchargements/export.xls\n  ou déposez-le dans le dossier data/adoc/.',
    );
  }
}
if (!fs.existsSync(source)) throw new Error(`Fichier introuvable : ${source}`);

const parsed = parseAdocExport(fs.readFileSync(source), config.adoc.colonnes);

// On garde une copie datée dans data/ (exclu de Git) pour pouvoir refaire le rapport.
ensureDir(PATHS.adocDir);
const copie = path.join(PATHS.adocDir, `adherents-${today()}${path.extname(source).toLowerCase()}`);
if (path.resolve(source) !== path.resolve(copie)) fs.copyFileSync(source, copie);
writeJson(PATHS.adherents, { date: today(), source: path.relative(ROOT, copie), ...parsed });

const sansTel = parsed.adherents.filter((a) => a.telephones.length === 0).length;
console.log(`Export lu : ${source} (feuille « ${parsed.feuille} »)`);
console.log(`  Colonnes de l'export : ${parsed.colonnes.join(' | ')}`);
console.log(`  Utilisées : nom = « ${parsed.colonnesUtilisees.nom} », prénom = « ${parsed.colonnesUtilisees.prenom} »`);
console.log(`  Téléphones : ${parsed.colonnesUtilisees.telephones.map((c) => `« ${c} »`).join(', ')}`);
console.log(`✅ ${parsed.adherents.length} adhérents lus, dont ${sansTel} sans numéro exploitable.`);
