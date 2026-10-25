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
