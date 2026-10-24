import { phoneKeys } from '../lib/phone.js';
import { nameMatches } from '../lib/names.js';

export const STATUTS = {
  ok: 'Adhérent',
  conserve: 'Conservé',
  a_verifier: 'À vérifier',
  a_retirer: 'À retirer',
};

/**
 * Rapproche chaque membre du groupe WhatsApp de la liste des adhérents Adoc.
 *
 * - ok          : numéro trouvé chez un adhérent de la saison
 * - conserve    : moi, ou numéro de la liste blanche
 * - a_verifier  : numéro masqué, admin non trouvé, ou nom WhatsApp qui ressemble à un adhérent
 *                 (souvent quelqu'un qui a changé de numéro, ou inscrit avec le numéro d'un proche)
 * - a_retirer   : rien ne le relie à un adhérent
 */
export function matchMembers({ adherents, membres, listeBlanche = [] }) {
  const parNumero = new Map();
  for (const a of adherents) {
    for (const k of a.telephones) {
      if (!parNumero.has(k)) parNumero.set(k, []);
      parNumero.get(k).push(a);
    }
  }
  const blanche = new Set(listeBlanche.flatMap(phoneKeys));
  const label = (a) => `${a.prenom} ${a.nom}`.trim();

  return membres.map((m) => {
    const base = { numero: m.numero, nomWhatsApp: m.nom, admin: m.admin };

    if (m.moi) return { ...base, statut: 'conserve', raison: 'Compte utilisé par le bot' };
    if (m.numero && blanche.has(m.numero)) return { ...base, statut: 'conserve', raison: 'Liste blanche' };
    if (!m.numero) return { ...base, statut: 'a_verifier', raison: 'Numéro masqué par WhatsApp' };

    const trouves = parNumero.get(m.numero);
    if (trouves) return { ...base, statut: 'ok', raison: '', adherent: trouves.map(label).join(', ') };

    const sosies = adherents.filter((a) => nameMatches(m.nom, a.nom, a.prenom));
    if (sosies.length) {
      return {
        ...base,
        statut: 'a_verifier',
        raison: 'Nom proche d\'un adhérent, mais numéro différent',
        adherent: sosies.map(label).join(', '),
      };
    }
    if (m.admin) return { ...base, statut: 'a_verifier', raison: 'Admin du groupe, numéro absent d\'Adoc' };
    return { ...base, statut: 'a_retirer', raison: 'Numéro absent des adhérents de la saison' };
  });
}

export function summarize(lignes) {
  const out = Object.fromEntries(Object.keys(STATUTS).map((k) => [k, 0]));
  for (const l of lignes) out[l.statut] += 1;
  return out;
}
