import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Transforme un numéro saisi n'importe comment dans Adoc en clés comparables
 * aux identifiants WhatsApp (indicatif + numéro, chiffres seuls : 33612345678).
 *
 * Renvoie un tableau car un numéro sans indicatif peut être ambigu : près de Genève,
 * un « 079 123 45 67 » saisi sans +41 est souvent un portable suisse. On garde alors
 * les deux lectures (France et Suisse) ; la bonne sera celle qu'on retrouve dans WhatsApp.
 */
export function phoneKeys(raw) {
  if (raw === null || raw === undefined) return [];
  let s = String(raw).trim();
  if (!s) return [];

  // Excel transforme parfois 0612345678 en nombre 612345678 (zéro initial perdu).
  let digits = s.replace(/[^\d+]/g, '');
  if (/^\d{9}$/.test(digits)) digits = `0${digits}`;
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (!digits.replace('+', '')) return [];

  const keys = new Set();
  const tryParse = (value, country) => {
    const n = parsePhoneNumberFromString(value, country);
    if (n && n.isValid()) keys.add(n.number.replace('+', ''));
  };

  tryParse(digits, 'FR');
  if (/^07[5-9]\d{7}$/.test(digits)) tryParse(digits, 'CH');
  return [...keys];
}

/** Clé d'un identifiant WhatsApp « 33612345678@c.us » → « 33612345678 ». */
export function waKey(serializedId) {
  if (!serializedId) return null;
  const [user, server] = String(serializedId).split('@');
  if (server && server !== 'c.us' && server !== 's.whatsapp.net') return null;
  return user.replace(/\D/g, '') || null;
}

/** Affichage lisible : 33612345678 → +33 6 12 34 56 78 */
export function formatKey(key) {
  if (!key) return '';
  const n = parsePhoneNumberFromString(`+${key}`);
  return n ? n.formatInternational() : `+${key}`;
}
