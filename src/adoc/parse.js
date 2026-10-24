import * as XLSX from 'xlsx';
import { phoneKeys } from '../lib/phone.js';

const RE_NOM = /^nom( d'usage| de famille)?$/i;
const RE_PRENOM = /^pr[ée]nom/i;
const RE_TEL = /(t[ée]l[ée]?phone|^t[ée]l\b|portable|mobile|gsm)/i;
const RE_PAS_TEL = /fax/i;

function clean(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

/** Repère la ligne d'en-tête : la première qui contient une colonne « Nom » et une colonne « Prénom ». */
function findHeaderRow(rows) {
  return rows.findIndex(
    (row) => row.some((c) => RE_NOM.test(clean(c))) && row.some((c) => RE_PRENOM.test(clean(c))),
  );
}

/**
 * Lit l'export Excel d'Adoc et renvoie les colonnes détectées et les adhérents
 * avec leurs numéros normalisés.
 *
 * `overrides` (config.adoc.colonnes) permet de forcer les noms de colonnes
 * si la détection automatique se trompe.
 */
export function parseAdocExport(buffer, overrides = {}) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false });

  const headerIndex = findHeaderRow(rows);
  if (headerIndex === -1) {
    throw new Error(
      "Impossible de trouver la ligne d'en-tête (colonnes « Nom » et « Prénom ») dans l'export Adoc.",
    );
  }
  const header = rows[headerIndex].map(clean);

  const col = (name) => {
    const i = header.findIndex((h) => h.toLowerCase() === String(name).toLowerCase());
    if (i === -1) throw new Error(`Colonne « ${name} » absente de l'export. Colonnes : ${header.join(' | ')}`);
    return i;
  };

  const nomIdx = overrides.nom ? col(overrides.nom) : header.findIndex((h) => RE_NOM.test(h));
  const prenomIdx = overrides.prenom ? col(overrides.prenom) : header.findIndex((h) => RE_PRENOM.test(h));
  const telIdx = overrides.telephones?.length
    ? overrides.telephones.map(col)
    : header.map((h, i) => [h, i]).filter(([h]) => RE_TEL.test(h) && !RE_PAS_TEL.test(h)).map(([, i]) => i);

  if (!telIdx.length) {
    throw new Error(
      `Aucune colonne de téléphone reconnue. Indiquez-les dans config.json (adoc.colonnes.telephones). Colonnes : ${header.join(' | ')}`,
    );
  }

  const adherents = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const nom = clean(row[nomIdx]);
    const prenom = clean(row[prenomIdx]);
    if (!nom && !prenom) continue;
    const telephones = new Set();
    for (const i of telIdx) for (const k of phoneKeys(row[i])) telephones.add(k);
    adherents.push({ nom, prenom, telephones: [...telephones] });
  }

  return {
    feuille: sheetName,
    colonnes: header,
    colonnesUtilisees: {
      nom: header[nomIdx],
      prenom: header[prenomIdx],
      telephones: telIdx.map((i) => header[i]),
    },
    adherents,
  };
}
