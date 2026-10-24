import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';
import { PATHS } from '../lib/config.js';
import { waKey } from '../lib/phone.js';

const { Client, LocalAuth } = pkg;

/**
 * Démarre une session WhatsApp Web liée au téléphone de l'admin (comme un ordinateur
 * de plus dans « Appareils connectés »). La session est gardée dans .wwebjs_auth/.
 */
export async function startWhatsApp({ allowQr = true } = {}) {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: PATHS.waAuth, clientId: 'padel' }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });

  const ready = new Promise((resolve, reject) => {
    client.on('qr', (qr) => {
      if (!allowQr) {
        reject(new Error('Session WhatsApp absente ou expirée.\n→ Lancez `npm run wa:connexion` puis recommencez.'));
        return;
      }
      console.log('\nSur le téléphone admin : WhatsApp › Réglages › Appareils connectés › Connecter un appareil, puis scannez :\n');
      qrcode.generate(qr, { small: true });
    });
    client.on('auth_failure', (msg) => reject(new Error(`Échec d'authentification WhatsApp : ${msg}`)));
    client.on('ready', resolve);
  });

  await client.initialize();
  await ready;
  return client;
}

/** Retrouve le groupe par nom exact (config.whatsapp.groupe) ou par identifiant « …@g.us ». */
export async function findGroup(client, nameOrId) {
  if (/@g\.us$/.test(nameOrId)) return client.getChatById(nameOrId);
  const chats = await client.getChats();
  const groups = chats.filter((c) => c.isGroup);
  const matches = groups.filter((g) => g.name === nameOrId);
  if (matches.length === 1) return matches[0];
  const list = groups
    .map((g) => `  - ${g.name}  (${g.participants?.length ?? '?'} membres, id ${g.id._serialized})`)
    .join('\n');
  throw new Error(
    matches.length
      ? `Plusieurs groupes s'appellent « ${nameOrId} ». Mettez son identifiant dans config.json :\n${list}`
      : `Groupe « ${nameOrId} » introuvable. Corrigez whatsapp.groupe dans config.json. Groupes visibles :\n${list}`,
  );
}

/** Identifiants du compte connecté (numéro et identifiant masqué « lid »). */
export async function myIds(client) {
  const me = client.info.wid._serialized;
  const [{ lid } = {}] = await client.getContactLidAndPhone([me]).catch(() => []);
  return new Set([me, lid].filter(Boolean));
}

/**
 * Liste les membres d'un groupe avec leur numéro.
 * Depuis 2025, WhatsApp masque parfois les numéros derrière un identifiant « @lid » :
 * on demande la correspondance numéro ↔ lid par paquets.
 */
export async function readMembers(client, group, { withNames = false } = {}) {
  const mine = await myIds(client);
  const ids = group.participants.map((p) => p.id._serialized);
  const mapping = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    let res = await client.getContactLidAndPhone(chunk).catch(() => null);
    if (!res) {
      // Un seul identifiant en échec fait échouer tout le paquet : on reprend un par un.
      res = [];
      for (const id of chunk) res.push((await client.getContactLidAndPhone([id]).catch(() => []))[0]);
    }
    res.forEach((r, j) => mapping.set(chunk[j], r ?? {}));
  }

  const membres = [];
  for (const p of group.participants) {
    const id = p.id._serialized;
    const { lid, pn } = mapping.get(id) ?? {};
    let nom = '';
    if (withNames) {
      try {
        const c = await client.getContactById(pn ?? id);
        nom = c.name || c.pushname || c.shortName || '';
      } catch {
        /* contact inconnu : nom vide */
      }
    }
    membres.push({
      id,
      lid: lid ?? (id.endsWith('@lid') ? id : null),
      numero: waKey(pn) ?? waKey(id),
      nom,
      admin: Boolean(p.isAdmin || p.isSuperAdmin),
      moi: mine.has(id) || (lid ? mine.has(lid) : false),
    });
  }
  return membres;
}

/** Vrai si le compte connecté est admin du groupe. */
export async function isMeAdmin(client, group) {
  const mine = await myIds(client);
  return group.participants.some((p) => mine.has(p.id._serialized) && (p.isAdmin || p.isSuperAdmin));
}
