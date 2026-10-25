import { loadConfig } from '../lib/config.js';
import { listGroups, matchGroups, startWhatsApp } from './client.js';

const config = loadConfig();
const wanted = config.whatsapp.groupe;

console.log('Connexion à WhatsApp…');
const client = await startWhatsApp({ allowQr: true });
try {
  console.log(`\n✅ Connecté en tant que ${client.info.pushname} (+${client.info.wid.user}).`);

  const groups = await listGroups(client);
  const found = /@g\.us$/.test(wanted) ? groups.filter((g) => g.id._serialized === wanted) : matchGroups(groups, wanted);

  console.log(`\nGroupes visibles (${groups.length}) :`);
  for (const g of groups.sort((a, b) => (b.participants?.length ?? 0) - (a.participants?.length ?? 0))) {
    const mark = found.includes(g) ? '   ← groupe configuré' : '';
    console.log(`  - ${g.name}  (${g.participants?.length ?? '?'} membres, id ${g.id._serialized})${mark}`);
  }

  if (found.length === 1) {
    console.log(`\n✅ Groupe trouvé : « ${found[0].name} » (${found[0].participants?.length ?? '?'} membres).`);
  } else if (found.length > 1) {
    console.log(`\n⚠️  Plusieurs groupes correspondent à « ${wanted} ». Mettez l'identifiant (…@g.us) du bon groupe dans config.json › whatsapp.groupe.`);
  } else {
    console.log(`\n⚠️  Aucun groupe ne correspond à « ${wanted} ». Copiez le nom exact (ou l'identifiant …@g.us) depuis la liste ci-dessus dans config.json › whatsapp.groupe.`);
  }
} finally {
  await client.destroy();
}
process.exit(0);
