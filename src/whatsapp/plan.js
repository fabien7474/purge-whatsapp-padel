import fs from 'node:fs';
import { phoneKeys } from '../lib/phone.js';

/** Lit le journal des retraits déjà faits (une ligne par numéro : date, numéro, statut, détail). */
export function readJournal(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [date, numero, statut, detail = ''] = line.split('\t');
      return { date, numero, statut, detail };
    });
}

/** Nombre de retraits réussis dans les dernières 24 h, et heure à laquelle le plus ancien sortira de cette fenêtre. */
export function recentRemovals(journal, now = Date.now()) {
  const dates = journal
    .filter((j) => j.statut === 'retire')
    .map((j) => Date.parse(j.date))
    .filter((d) => now - d < 24 * 3600 * 1000)
    .sort((a, b) => a - b);
  return { count: dates.length, libereA: dates.length ? new Date(dates[0] + 24 * 3600 * 1000) : null };
}

export function appendJournal(file, numero, statut, detail = '') {
  fs.appendFileSync(file, `${new Date().toISOString()}\t${numero}\t${statut}\t${detail}\n`, 'utf8');
}

/**
 * Prépare le retrait à partir de la liste validée (a-retirer.txt) et de l'état actuel du groupe.
 * Ne retire jamais : un admin, le compte connecté, un numéro de la liste blanche,
 * ni quelqu'un qui n'est plus dans le groupe.
 * Les personnes enregistrées dans les contacts du téléphone sont retirées en dernier.
 */
export function planRemoval({ lignes, membres, journal = [], listeBlanche = [], max = Infinity }) {
  const blanche = new Set(listeBlanche.flatMap(phoneKeys));
  const dejaFaits = new Set(journal.filter((j) => j.statut === 'retire').map((j) => j.numero));
  const parNumero = new Map(membres.filter((m) => m.numero).map((m) => [m.numero, m]));

  const demandes = [...new Set(lignes.flatMap((l) => phoneKeys(l).slice(0, 1)))];
  const plan = { aRetirer: [], dejaPartis: [], proteges: [], dejaFaits: [], reportes: [] };

  const eligibles = [];
  for (const numero of demandes) {
    const m = parNumero.get(numero);
    if (dejaFaits.has(numero) && !m) plan.dejaFaits.push(numero);
    else if (!m) plan.dejaPartis.push(numero);
    else if (m.moi) plan.proteges.push({ numero, raison: 'compte connecté' });
    else if (m.admin) plan.proteges.push({ numero, raison: 'admin du groupe' }); // admin d'au moins un des groupes
    else if (blanche.has(numero)) plan.proteges.push({ numero, raison: 'liste blanche' });
    else {
      eligibles.push({
        numero,
        id: m.id,
        nom: m.nom,
        contact: Boolean(m.contact),
        groupes: m.groupes ?? [{ nom: null, groupeId: null, id: m.id }],
      });
    }
  }

  // Inconnus d'abord, contacts du téléphone en dernier (tri stable : l'ordre de la liste est conservé).
  eligibles.sort((a, b) => Number(a.contact) - Number(b.contact));
  plan.aRetirer = eligibles.slice(0, max);
  plan.reportes = eligibles.slice(max).map((e) => e.numero);
  return plan;
}
