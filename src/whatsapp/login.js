import { loadConfig } from '../lib/config.js';
import { findGroup, listGroups, matchGroups, startWhatsApp } from './client.js';

const config = loadConfig();
const wanted = config.whatsapp.groupe;

console.log('Connexion à WhatsApp…');
const client = await startWhatsApp({ allowQr: true });
try {
  console.log(`\n✅ Connecté en tant que ${client.info.pushname} (+${client.info.wid.user}).`);

  const groups = await listGroups(client);
  const candidates = groups.filter((g) => !g.community);
  const found = /@g\.us$/.test(wanted)
    ? candidates.filter((g) => g.id._serialized === wanted)
    : matchGroups(candidates, wanted);

  console.log(`\nGroupes visibles (${groups.length}) :`);
  const size = (g) => (typeof g.participants.length === 'number' ? g.participants.length : 0);
  for (const g of groups.sort((a, b) => size(b) - size(a))) {
    const kind = g.community ? ' [communauté]' : '';
    const mark = found.includes(g) ? '   ← groupe configuré' : '';
    console.log(`  - ${g.name}${kind}  (${g.participants.length} membres, id ${g.id._serialized})${mark}`);
  }

  if (found.length === 1) {
    // Vérifie que le groupe se charge complètement, membres compris.
    const group = await findGroup(client, found[0].id._serialized);
    console.log(`\n✅ Groupe trouvé : « ${group.name} » (${group.participants.length} membres).`);
  } else if (found.length > 1) {
    console.log(`\n⚠️  Plusieurs groupes correspondent à « ${wanted} ». Mettez l'identifiant (…@g.us) du bon groupe dans config.json › whatsapp.groupe.`);
  } else {
    console.log(`\n⚠️  Aucun groupe ne correspond à « ${wanted} ». Copiez le nom exact (ou l'identifiant …@g.us) depuis la liste ci-dessus dans config.json › whatsapp.groupe.`);
  }
} finally {
  await client.destroy();
}
process.exit(0);
