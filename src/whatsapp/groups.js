/** « 🎾 Padel – Annecy Tennis » → « padelannecytennis » : sans emoji, accents, majuscules ni espaces. */
export function normalizeGroupName(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Groupes qui correspondent au nom configuré : nom exact, sinon même nom à la mise en forme près,
 * sinon groupes dont le nom contient le nom configuré.
 */
export function matchGroups(groups, wanted) {
  const exact = groups.filter((g) => g.name === wanted);
  if (exact.length) return exact;
  const w = normalizeGroupName(wanted);
  if (!w) return [];
  const same = groups.filter((g) => normalizeGroupName(g.name) === w);
  if (same.length) return same;
  return groups.filter((g) => normalizeGroupName(g.name).includes(w));
}

/** Groupes à purger : config.whatsapp.groupes (liste) ou, à défaut, config.whatsapp.groupe. */
export function configuredGroups(waConfig) {
  const g = waConfig.groupes ?? waConfig.groupe;
  return (Array.isArray(g) ? g : [g]).map((x) => String(x ?? '').trim()).filter(Boolean);
}

/**
 * Fusionne les membres de plusieurs groupes : une seule entrée par personne, avec la liste
 * des groupes où elle se trouve. Admin, « moi » et « contact » valent s'ils sont vrais dans un des groupes.
 * `groupes` : [{ nom, id, membres: [...] }]
 */
export function mergeMembers(groupes) {
  const byKey = new Map();
  for (const g of groupes) {
    for (const m of g.membres) {
      const key = m.numero ?? m.lid ?? m.id;
      const e = byKey.get(key) ?? { ...m, nom: '', admin: false, moi: false, contact: false, groupes: [] };
      e.nom ||= m.nom;
      e.admin ||= Boolean(m.admin);
      e.moi ||= Boolean(m.moi);
      e.contact ||= Boolean(m.contact);
      e.groupes.push({ nom: g.nom, groupeId: g.id, id: m.id });
      byKey.set(key, e);
    }
  }
  return [...byKey.values()];
}

/** Données lues par wa:membres, y compris l'ancien format à un seul groupe. */
export function groupsFromSnapshot(wa) {
  return wa.groupes ?? [{ nom: wa.groupe, id: wa.groupeId, membres: wa.membres }];
}
