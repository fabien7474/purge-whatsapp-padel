/** « Émilie  BALAS-Durand » → ['emilie', 'balas', 'durand'] */
export function nameTokens(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 1);
}

/**
 * Le nom affiché sur WhatsApp contient-il à la fois le prénom et le nom de l'adhérent ?
 * Exige les deux pour éviter les faux positifs sur les prénoms courants.
 */
export function nameMatches(displayName, nom, prenom) {
  const shown = new Set(nameTokens(displayName));
  const last = nameTokens(nom);
  const first = nameTokens(prenom);
  if (!shown.size || !last.length || !first.length) return false;
  return last.every((t) => shown.has(t)) && first.some((t) => shown.has(t));
}
