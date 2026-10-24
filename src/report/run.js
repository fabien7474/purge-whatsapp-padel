import fs from 'node:fs';
import path from 'node:path';
import { PATHS, ROOT, ensureDir, readJson, readNumberList, today } from '../lib/config.js';
import { formatKey } from '../lib/phone.js';
import { STATUTS, matchMembers, summarize } from './match.js';
import { renderHtml } from './html.js';

const adoc = readJson(PATHS.adherents, 'Lancez `npm run adoc:export` d\'abord.');
const wa = readJson(PATHS.membres, 'Lancez `npm run wa:membres` d\'abord.');

const lignes = matchMembers({
  adherents: adoc.adherents,
  membres: wa.membres,
  listeBlanche: readNumberList(PATHS.listeBlanche),
});
const ordre = ['a_retirer', 'a_verifier', 'conserve', 'ok'];
lignes.sort(
  (a, b) => ordre.indexOf(a.statut) - ordre.indexOf(b.statut) || (a.nomWhatsApp || '').localeCompare(b.nomWhatsApp || ''),
);
const totaux = summarize(lignes);

ensureDir(PATHS.rapportsDir);
const stamp = today();

// CSV pour Excel (séparateur « ; » et BOM pour les accents)
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = [
  ['Statut', 'Numéro', 'Nom WhatsApp', 'Admin', 'Adhérent Adoc', 'Raison'].map(csvCell).join(';'),
  ...lignes.map((l) =>
    [STATUTS[l.statut], formatKey(l.numero), l.nomWhatsApp, l.admin ? 'oui' : '', l.adherent, l.raison]
      .map(csvCell)
      .join(';'),
  ),
].join('\r\n');
const csvPath = path.join(PATHS.rapportsDir, `rapport-${stamp}.csv`);
fs.writeFileSync(csvPath, `﻿${csv}`, 'utf8');

const htmlPath = path.join(PATHS.rapportsDir, `rapport-${stamp}.html`);
fs.writeFileSync(
  htmlPath,
  renderHtml({ lignes, totaux, groupe: wa.groupe, dateAdoc: adoc.date, dateWa: wa.date, nbAdherents: adoc.adherents.length }),
  'utf8',
);

// Liste à valider avant retrait : on garde l'éventuelle version précédente.
if (fs.existsSync(PATHS.aRetirer)) fs.copyFileSync(PATHS.aRetirer, PATHS.aRetirer.replace(/\.txt$/, '.precedent.txt'));
const aRetirer = lignes.filter((l) => l.statut === 'a_retirer');
fs.writeFileSync(
  PATHS.aRetirer,
  [
    `# Membres du groupe « ${wa.groupe} » absents des adhérents Adoc (${stamp}).`,
    '# Relisez cette liste : supprimez la ligne de quiconque doit rester (ou mettez un # devant).',
    '# Ajoutez éventuellement des numéros « À vérifier » que vous avez confirmés.',
    '# Ensuite : npm run wa:retirer (simulation), puis npm run wa:retirer -- --appliquer',
    '',
    ...aRetirer.map((l) => `${formatKey(l.numero).padEnd(20)} # ${l.nomWhatsApp || '(sans nom)'}`),
    '',
  ].join('\n'),
  'utf8',
);

const rel = (p) => path.relative(ROOT, p);
console.log(`Groupe « ${wa.groupe} » (${lignes.length} membres) comparé à ${adoc.adherents.length} adhérents Adoc :`);
for (const k of ordre) console.log(`  ${STATUTS[k].padEnd(12)} ${totaux[k]}`);
console.log(`\nRapport  : ${rel(htmlPath)}  (et ${rel(csvPath)} pour Excel)`);
console.log(`À valider : ${rel(PATHS.aRetirer)}  (${aRetirer.length} numéros)`);
