import { loadConfig } from '../lib/config.js';
import { closeWhatsApp, findGroup, isMeAdmin, listGroups, matchGroups, startWhatsApp } from './client.js';
import { configuredGroups } from './groups.js';

const config = loadConfig();
const wanted = configuredGroups(config.whatsapp);

console.log('Connexion à WhatsApp…');
const client = await startWhatsApp({ allowQr: true });
try {
  console.log(`\n✅ Connecté en tant que ${client.info.pushname} (+${client.info.wid.user}).`);

  const groups = await listGroups(client);
  const candidates = groups.filter((g) => !g.community);
  const found = new Map(
    wanted.map((w) => [w, /@g\.us$/.test(w) ? candidates.filter((g) => g.id._serialized === w) : matchGroups(candidates, w)]),
  );
  const marked = new Set([...found.values()].filter((f) => f.length === 1).flat());

  console.log(`\nGroupes visibles (${groups.length}) :`);
  const size = (g) => (typeof g.participants.length === 'number' ? g.participants.length : 0);
  const nomDe = new Map(groups.map((g) => [g.id._serialized, g.name]));
  for (const g of groups.sort((a, b) => size(b) - size(a))) {
    const de = g.parent && nomDe.get(g.parent) ? ` « ${nomDe.get(g.parent)} »` : '';
    const kind = g.community
      ? ' [communauté]'
      : g.announcement
        ? ` [annonces de la communauté${de} : tous ses membres]`
        : g.parent
          ? ` [groupe de la communauté${de}]`
          : '';
    const mark = marked.has(g) ? '   ← groupe configuré' : '';
    console.log(`  - ${g.name}${kind}  (${g.participants.length} membres, id ${g.id._serialized})${mark}`);
  }

  console.log('');
  for (const [w, f] of found) {
    if (f.length === 1) {
      // Vérifie que le groupe se charge complètement, membres compris, et que le compte en est admin.
      const group = await findGroup(client, f[0].id._serialized);
      const admin = (await isMeAdmin(client, group)) ? '' : '  ⚠️  ce compte n\'en est pas admin : le retrait sera impossible';
      console.log(`✅ Groupe trouvé : « ${group.name} » (${group.participants.length} membres)${admin}`);
    } else if (f.length > 1) {
      console.log(`⚠️  Plusieurs groupes correspondent à « ${w} » : mettez l'identifiant (…@g.us) du bon groupe dans config.json.`);
    } else {
      console.log(`⚠️  Aucun groupe ne correspond à « ${w} » : copiez le nom exact (ou l'identifiant …@g.us) depuis la liste ci-dessus dans config.json.`);
    }
  }
} finally {
  await closeWhatsApp(client);
}
process.exit(0);
