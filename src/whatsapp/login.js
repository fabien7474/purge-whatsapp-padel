import { loadConfig } from '../lib/config.js';
import { startWhatsApp } from './client.js';

const config = loadConfig();

console.log('Connexion à WhatsApp…');
const client = await startWhatsApp({ allowQr: true });
console.log(`\n✅ Connecté en tant que ${client.info.pushname} (+${client.info.wid.user}).`);

const groups = (await client.getChats()).filter((c) => c.isGroup);
console.log(`\nGroupes visibles (${groups.length}) :`);
for (const g of groups.sort((a, b) => (b.participants?.length ?? 0) - (a.participants?.length ?? 0))) {
  const mark = g.name === config.whatsapp.groupe ? '  ← groupe configuré' : '';
  console.log(`  - ${g.name}  (${g.participants?.length ?? '?'} membres)${mark}`);
}
console.log('\nSi le groupe padel n\'est pas marqué, mettez son nom exact dans config.json (whatsapp.groupe).');

await client.destroy();
process.exit(0);
