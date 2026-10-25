import readline from 'node:readline/promises';
import { PATHS, loadConfig, readNumberList } from '../lib/config.js';
import { formatKey } from '../lib/phone.js';
import { findGroup, isMeAdmin, readMembers, startWhatsApp, closeWhatsApp } from './client.js';
import { appendJournal, planRemoval, readJournal } from './plan.js';

const config = loadConfig();
const appliquer = process.argv.includes('--appliquer');
const { parLot, pauseMinSecondes, pauseMaxSecondes, maxParExecution } = config.retrait;

const lignes = readNumberList(PATHS.aRetirer);
if (!lignes.length) {
  console.log('La liste data/a-retirer.txt est vide : rien à faire.');
  console.log('→ Lancez `npm run preparer`, relisez le rapport puis la liste, et recommencez.');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => 1000 * (pauseMinSecondes + Math.random() * (pauseMaxSecondes - pauseMinSecondes));

async function main(client) {
  let group = await findGroup(client, config.whatsapp.groupe);
  if (!(await isMeAdmin(client, group))) {
    throw new Error(`Le compte connecté n'est pas admin du groupe « ${group.name} » : impossible de retirer des membres.`);
  }

  const membres = await readMembers(client, group);
  const plan = planRemoval({
    lignes,
    membres,
    journal: readJournal(PATHS.journalRetraits),
    listeBlanche: readNumberList(PATHS.listeBlanche),
    max: maxParExecution,
  });

  console.log(`\nGroupe « ${group.name} » : ${membres.length} membres.`);
  console.log(`  ${plan.aRetirer.length} à retirer maintenant`);
  if (plan.reportes.length) console.log(`  ${plan.reportes.length} reportés à la prochaine exécution (max ${maxParExecution} par exécution)`);
  if (plan.dejaPartis.length) console.log(`  ${plan.dejaPartis.length} déjà absents du groupe`);
  if (plan.dejaFaits.length) console.log(`  ${plan.dejaFaits.length} déjà retirés lors d'une exécution précédente`);
  for (const p of plan.proteges) console.log(`  ⚠️  ${formatKey(p.numero)} ignoré : ${p.raison}`);

  if (!plan.aRetirer.length) return;

  const minutes = Math.round(((plan.aRetirer.length / parLot) * (pauseMinSecondes + pauseMaxSecondes)) / 2 / 60);
  console.log(`\nPar lots de ${parLot}, avec ${pauseMinSecondes} à ${pauseMaxSecondes} s de pause : environ ${minutes} min.`);

  if (!appliquer) {
    console.log('\nSIMULATION : personne n\'a été retiré. Premiers numéros concernés :');
    for (const r of plan.aRetirer.slice(0, 10)) console.log(`  - ${formatKey(r.numero)}  ${r.nom}`);
    console.log('\nPour retirer pour de vrai : npm run wa:retirer -- --appliquer');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nTapez RETIRER pour retirer ${plan.aRetirer.length} personnes du groupe : `);
  rl.close();
  if (answer.trim() !== 'RETIRER') {
    console.log('Annulé, personne n\'a été retiré.');
    return;
  }

  let retires = 0;
  for (let i = 0; i < plan.aRetirer.length; i += parLot) {
    const lot = plan.aRetirer.slice(i, i + parLot);
    await group.removeParticipants(lot.map((r) => r.id));
    await sleep(5000);

    // Vérification : on relit le groupe et on contrôle que chacun est bien parti.
    group = await findGroup(client, group.id._serialized);
    const encore = new Set(group.participants.map((p) => p.id._serialized));
    for (const r of lot) {
      if (encore.has(r.id)) {
        appendJournal(PATHS.journalRetraits, r.numero, 'echec', r.nom);
        console.log(`  ❌ ${formatKey(r.numero)} toujours présent`);
      } else {
        appendJournal(PATHS.journalRetraits, r.numero, 'retire', r.nom);
        retires += 1;
        console.log(`  ✅ ${formatKey(r.numero)} retiré`);
      }
    }

    if (i + parLot < plan.aRetirer.length) {
      const ms = pause();
      console.log(`  … pause de ${Math.round(ms / 1000)} s`);
      await sleep(ms);
    }
  }

  console.log(`\n✅ ${retires} personne(s) retirée(s). Journal : data/retraits.log`);
  if (plan.reportes.length) console.log(`Il en reste ${plan.reportes.length} : relancez la commande plus tard (idéalement le lendemain).`);
}

const client = await startWhatsApp({ allowQr: false });
try {
  await main(client);
} finally {
  await closeWhatsApp(client);
}
process.exit(0);
