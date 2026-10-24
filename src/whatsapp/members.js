import path from 'node:path';
import { PATHS, ROOT, loadConfig, today, writeJson } from '../lib/config.js';
import { findGroup, readMembers, startWhatsApp } from './client.js';

const config = loadConfig();

console.log('WhatsApp : lecture des membres du groupe…');
const client = await startWhatsApp({ allowQr: false });
try {
  const group = await findGroup(client, config.whatsapp.groupe);
  console.log(`  Groupe « ${group.name} » : ${group.participants.length} membres`);

  const membres = await readMembers(client, group, { withNames: true });

  const file = path.join(PATHS.waDir, `membres-${today()}.json`);
  const payload = { date: today(), groupe: group.name, groupeId: group.id._serialized, membres };
  writeJson(file, payload);
  writeJson(PATHS.membres, payload);

  const sansNumero = membres.filter((m) => !m.numero).length;
  console.log(`  Fichier : ${path.relative(ROOT, file)}`);
  console.log(
    `✅ ${membres.length} membres lus, dont ${membres.filter((m) => m.admin).length} admins et ${sansNumero} sans numéro visible.`,
  );
} finally {
  await client.destroy();
}
process.exit(0);
