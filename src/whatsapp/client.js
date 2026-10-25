import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';
import { PATHS } from '../lib/config.js';
import { waKey } from '../lib/phone.js';
import { matchGroups } from './groups.js';

export { matchGroups };

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

/**
 * Liste légère des groupes du compte (y compris ceux d'une communauté).
 *
 * On n'utilise pas client.getChats() : elle charge toutes les conversations d'un coup et échoue
 * entièrement (erreur « r » ou « t ») dès qu'une seule pose problème, ce qui arrive avec certaines
 * communautés. Ici chaque conversation est lue séparément et celles en erreur sont ignorées.
 */
export async function listGroups(client) {
  const { groups, errors } = await client.pupPage.evaluate(() => {
    const groups = [];
    const errors = [];
    for (const chat of window.require('WAWebCollections').Chat.getModelsArray()) {
      try {
        const gm = chat.groupMetadata;
        if (!gm) continue;
        // Type WhatsApp : DEFAULT (groupe simple), COMMUNITY (la communauté elle-même),
        // LINKED_ANNOUNCEMENT_GROUP (groupe d'annonces de la communauté, où sont tous ses membres),
        // LINKED_SUBGROUP / LINKED_GENERAL_GROUP (groupes de la communauté).
        const type = String(gm.groupType ?? '');
        const parent = gm.parentGroup?._serialized ?? (typeof gm.parentGroup === 'string' ? gm.parentGroup : null);
        groups.push({
          id: chat.id._serialized,
          name: chat.formattedTitle || chat.name || gm.subject || '',
          size: gm.participants?.getModelsArray?.().length || gm.participants?.length || gm.size || null,
          community: type === 'COMMUNITY' || Boolean(gm.isParentGroup),
          announcement: type === 'LINKED_ANNOUNCEMENT_GROUP' || Boolean(gm.defaultSubgroup || gm.isDefaultSubgroup),
          parent,
          type,
        });
      } catch (e) {
        errors.push(String(e?.message ?? e));
      }
    }
    return { groups, errors };
  });
  if (errors.length && process.env.DEBUG) console.error(`(${errors.length} conversation(s) ignorée(s) : ${errors.join(', ')})`);
  return groups.map((g) => ({
    name: g.name,
    id: { _serialized: g.id },
    participants: { length: g.size ?? '?' },
    community: g.community,
    announcement: g.announcement,
    parent: g.parent,
    type: g.type,
  }));
}

/**
 * Charge un groupe (nom et membres) à partir de son identifiant « …@g.us ».
 * Lecture directe dans WhatsApp Web, sans client.getChatById() qui peut échouer de la même façon
 * que getChats(). Renvoie un objet avec name, id, participants et removeParticipants().
 */
async function loadGroup(client, id) {
  const data = await client.pupPage.evaluate(async (id) => {
    const { Chat, GroupMetadata, WAWebGroupMetadataCollection } = window.require('WAWebCollections');
    const wid = window.require('WAWebWidFactory').createWid(id);
    const chat = Chat.get(wid);
    if (!chat?.groupMetadata) return null;
    try {
      await (GroupMetadata || WAWebGroupMetadataCollection).update(wid); // liste des membres à jour
    } catch {
      /* on garde la liste déjà connue */
    }
    const { toPn } = window.require('WAWebLidMigrationUtils');
    const participants = chat.groupMetadata.participants.getModelsArray().map((p) => ({
      id: (toPn(p.id) ?? p.id)._serialized,
      isAdmin: Boolean(p.isAdmin),
      isSuperAdmin: Boolean(p.isSuperAdmin),
    }));
    return { name: chat.formattedTitle || chat.groupMetadata.subject || '', participants };
  }, id);

  if (!data) throw new Error(`Le groupe ${id} n'est pas accessible depuis ce compte.`);
  return {
    name: data.name,
    id: { _serialized: id },
    participants: data.participants.map((p) => ({ ...p, id: { _serialized: p.id } })),
    removeParticipants: (ids) => removeFromGroup(client, id, ids),
  };
}

/** Retire des membres du groupe (même mécanisme que whatsapp-web.js GroupChat.removeParticipants). */
async function removeFromGroup(client, groupId, participantIds) {
  return client.pupPage.evaluate(
    async (groupId, participantIds) => {
      const wid = window.require('WAWebWidFactory').createWid(groupId);
      const chat = window.require('WAWebCollections').Chat.get(wid);
      const participants = (
        await Promise.all(
          participantIds.map(async (p) => {
            const { lid, phone } = await window.WWebJS.enforceLidAndPnRetrieval(p);
            return (
              chat.groupMetadata.participants.get(lid?._serialized) ||
              chat.groupMetadata.participants.get(phone?._serialized)
            );
          }),
        )
      ).filter(Boolean);
      if (participants.length) {
        await window.require('WAWebModifyParticipantsGroupAction').removeParticipants(chat, participants);
      }
      return { status: 200, count: participants.length };
    },
    groupId,
    participantIds,
  );
}

/**
 * Ferme WhatsApp proprement : on signale la fermeture (les erreurs « Target closed » qui suivent
 * sont ignorées), puis on attend que Chrome soit vraiment arrêté avant de quitter. Sinon, sous Windows,
 * le système essaie de tuer un Chrome déjà en train de se fermer (« could not be terminated »).
 */
export async function closeWhatsApp(client) {
  globalThis.__waClosing = true;
  const proc = client.pupBrowser?.process?.();
  try {
    await client.destroy();
  } catch {
    /* déjà fermé */
  }
  if (proc && proc.exitCode === null && proc.signalCode === null) {
    await Promise.race([new Promise((r) => proc.once('exit', r)), new Promise((r) => setTimeout(r, 5000))]);
  }
  // Une vraie erreur survenue avant la fermeture doit encore s'afficher.
  globalThis.__waClosing = false;
}

/** Retrouve le groupe par nom (config.whatsapp.groupe) ou par identifiant « …@g.us ». */
export async function findGroup(client, nameOrId) {
  if (/@g\.us$/.test(nameOrId)) return loadGroup(client, nameOrId);
  // Une communauté elle-même n'est pas un groupe de discussion : on ne la propose pas.
  const groups = (await listGroups(client)).filter((g) => !g.community);
  const matches = matchGroups(groups, nameOrId);
  if (matches.length === 1) return loadGroup(client, matches[0].id._serialized);
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
export async function readMembers(client, group) {
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

  const lookups = group.participants.map((p) => {
    const id = p.id._serialized;
    const { lid, pn } = mapping.get(id) ?? {};
    return [pn, id, lid].filter(Boolean);
  });
  const infos = await contactInfos(client, lookups);

  return group.participants.map((p, i) => {
    const id = p.id._serialized;
    const { lid, pn } = mapping.get(id) ?? {};
    return {
      id,
      lid: lid ?? (id.endsWith('@lid') ? id : null),
      numero: waKey(pn) ?? waKey(id),
      nom: infos[i].nom,
      contact: infos[i].contact, // enregistré dans les contacts du téléphone lié au bot
      admin: Boolean(p.isAdmin || p.isSuperAdmin),
      moi: mine.has(id) || (lid ? mine.has(lid) : false),
    };
  });
}

/**
 * Nom affiché et « est dans mes contacts » pour chaque membre, lus directement dans WhatsApp Web
 * (une erreur sur un contact n'empêche pas de lire les autres).
 * `lookups` : pour chaque membre, ses identifiants possibles (numéro, puis identifiant masqué).
 */
async function contactInfos(client, lookups) {
  return client.pupPage.evaluate((lookups) => {
    const { Contact } = window.require('WAWebCollections');
    const { createWid } = window.require('WAWebWidFactory');
    const { getName, getPushname, getShortName } = window.require('WAWebContactGetters');
    const { getIsMyContact } = window.require('WAWebFrontendContactGetters');
    return lookups.map((ids) => {
      let nom = '';
      let contact = false;
      for (const id of ids) {
        try {
          const c = Contact.get(createWid(id));
          if (!c) continue;
          contact = contact || Boolean(getIsMyContact(c));
          nom = nom || getName(c) || getPushname(c) || getShortName(c) || '';
        } catch {
          /* contact illisible : on passe au suivant */
        }
      }
      return { nom, contact };
    });
  }, lookups);
}

/** Vrai si le compte connecté est admin du groupe. */
export async function isMeAdmin(client, group) {
  const mine = await myIds(client);
  return group.participants.some((p) => mine.has(p.id._serialized) && (p.isAdmin || p.isSuperAdmin));
}
