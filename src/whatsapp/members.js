import path from 'node:path';
import { PATHS, ROOT, loadConfig, today, writeJson } from '../lib/config.js';
import { closeWhatsApp, findGroup, readMembers, startWhatsApp } from './client.js';
import { configuredGroups, mergeMembers } from './groups.js';

const config = loadConfig();
const noms = configuredGroups(config.whatsapp);

console.log(`WhatsApp : lecture des membres de ${noms.length > 1 ? `${noms.length} groupes` : 'du groupe'}…`);
const client = await startWhatsApp({ allowQr: false });
try {
  const groupes = [];
  for (const nom of noms) {
    const group = await findGroup(client, nom);
    const membres = await readMembers(client, group);
    groupes.push({ nom: group.name, id: group.id._serialized, membres });
    const sansNumero = membres.filter((m) => !m.numero).length;
    console.log(
      `  « ${group.name} » : ${membres.length} membres, dont ${membres.filter((m) => m.admin).length} admins et ${sansNumero} sans numéro visible`,
    );
  }

  const file = path.join(PATHS.waDir, `membres-${today()}.json`);
  const payload = { date: today(), groupes };
  writeJson(file, payload);
  writeJson(PATHS.membres, payload);

  console.log(`  Fichier : ${path.relative(ROOT, file)}`);
  if (groupes.length > 1) console.log(`✅ ${mergeMembers(groupes).length} personnes différentes au total.`);
  else console.log('✅ Membres lus.');
} finally {
  await closeWhatsApp(client);
}
process.exit(0);
