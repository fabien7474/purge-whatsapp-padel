import readline from 'node:readline/promises';
import { PATHS, loadConfig, readNumberList } from '../lib/config.js';
import { formatKey } from '../lib/phone.js';
import { findGroup, isMeAdmin, readMembers, startWhatsApp, closeWhatsApp } from './client.js';
import { appendJournal, planRemoval, readJournal, recentRemovals } from './plan.js';
import { configuredGroups, mergeMembers } from './groups.js';

const config = loadConfig();
const appliquer = process.argv.includes('--appliquer');
const { pauseMinSecondes, pauseMaxSecondes, maxParExecution, maxPar24h } = config.retrait;
// Pause entre les retraits d'une même personne de ses différents groupes.
const pauseGroupeMin = config.retrait.pauseEntreGroupesMinSecondes ?? 5;
const pauseGroupeMax = config.retrait.pauseEntreGroupesMaxSecondes ?? 20;

const lignes = readNumberList(PATHS.aRetirer);
if (!lignes.length) {
  console.log('La liste data/a-retirer.txt est vide : rien à faire.');
  console.log('→ Lancez `npm run preparer`, relisez le rapport puis la liste, et recommencez.');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alea = (min, max) => 1000 * (min + Math.random() * (max - min));

async function main(client) {
  // Chargement des groupes configurés ; il faut être admin de chacun.
  const groups = new Map();
  for (const nom of configuredGroups(config.whatsapp)) {
    const g = await findGroup(client, nom);
    if (!(await isMeAdmin(client, g))) {
      throw new Error(`Le compte connecté n'est pas admin du groupe « ${g.name} » : impossible de retirer des membres.`);
    }
    groups.set(g.id._serialized, g);
  }
  const groupes = [];
  for (const g of groups.values()) groupes.push({ nom: g.name, id: g.id._serialized, membres: await readMembers(client, g) });
  const plusieurs = groupes.length > 1;

  const journal = readJournal(PATHS.journalRetraits);
  const recent = recentRemovals(journal);
  // maxPar24h vide (null) : pas de plafond sur 24 h.
  const quota = maxPar24h ? Math.max(0, Math.min(maxParExecution, maxPar24h - recent.count)) : maxParExecution;

  const plan = planRemoval({
    lignes,
    membres: mergeMembers(groupes),
    journal,
    listeBlanche: readNumberList(PATHS.listeBlanche),
    max: quota,
  });

  console.log('');
  for (const g of groupes) console.log(`Groupe « ${g.nom} » : ${g.membres.length} membres.`);
  console.log(`  ${plan.aRetirer.length} personne(s) à retirer maintenant`);
  if (plan.reportes.length) {
    const jour = maxPar24h ? `, ${maxPar24h} par 24 h ; ${recent.count} déjà retirés ces dernières 24 h` : '';
    console.log(`  ${plan.reportes.length} reportés à la prochaine séance (max ${maxParExecution} par séance${jour})`);
  }
  if (maxPar24h && quota === 0 && plan.reportes.length) {
    const h = recent.libereA?.toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    console.log(`\n⏸️  Limite de ${maxPar24h} retraits par 24 h atteinte. Prochain retrait possible : ${h}.`);
  }
  if (plan.dejaPartis.length) console.log(`  ${plan.dejaPartis.length} déjà absents ${plusieurs ? 'des groupes' : 'du groupe'}`);
  if (plan.dejaFaits.length) console.log(`  ${plan.dejaFaits.length} déjà retirés lors d'une exécution précédente`);
  for (const p of plan.proteges) console.log(`  ⚠️  ${formatKey(p.numero)} ignoré : ${p.raison}`);
  const nbContacts = plan.aRetirer.filter((r) => r.contact).length;
  if (nbContacts) console.log(`  dont ${nbContacts} de vos contacts, retirés en dernier`);

  if (!plan.aRetirer.length) return;

  const extra = plan.aRetirer.reduce((n, r) => n + r.groupes.length - 1, 0); // retraits d'un 2e groupe ou plus
  const secondes =
    plan.aRetirer.length * ((pauseMinSecondes + pauseMaxSecondes) / 2 + 5) + extra * ((pauseGroupeMin + pauseGroupeMax) / 2 + 5);
  console.log(`\nUne personne à la fois, avec ${pauseMinSecondes} à ${pauseMaxSecondes} s de pause : environ ${Math.round(secondes / 60)} min.`);
  if (extra) console.log(`(${extra} personne(s) dans plusieurs groupes : ${pauseGroupeMin} à ${pauseGroupeMax} s entre chacun de leurs groupes.)`);

  const ou = (r) => (plusieurs ? `  [${r.groupes.map((g) => g.nom).join(', ')}]` : '');
  if (!appliquer) {
    console.log('\nSIMULATION : personne n\'a été retiré. Premiers numéros concernés :');
    for (const r of plan.aRetirer.slice(0, 10)) {
      console.log(`  - ${formatKey(r.numero)}  ${r.nom}${r.contact ? '  (contact)' : ''}${ou(r)}`);
    }
    console.log('\nPour retirer pour de vrai : npm run wa:retirer -- --appliquer');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nTapez RETIRER pour retirer ${plan.aRetirer.length} personnes : `);
  rl.close();
  if (answer.trim() !== 'RETIRER') {
    console.log('Annulé, personne n\'a été retiré.');
    return;
  }

  let retires = 0;
  let echec = false;

  for (const [n, r] of plan.aRetirer.entries()) {
    // On retire la personne de chacun de ses groupes, avec une courte pause entre deux groupes.
    for (const [k, gr] of r.groupes.entries()) {
      const groupeId = gr.groupeId ?? [...groups.keys()][0];
      await groups.get(groupeId).removeParticipants([gr.id]);
      await sleep(5000);

      // Vérification : on relit le groupe et on contrôle que la personne est bien partie.
      const g = await findGroup(client, groupeId);
      groups.set(groupeId, g);
      const label = `${formatKey(r.numero)}${plusieurs ? ` de « ${g.name} »` : ''}`;
      if (g.participants.some((p) => p.id._serialized === gr.id)) {
        appendJournal(PATHS.journalRetraits, r.numero, 'echec', `${r.nom} [${g.name}]`);
        console.log(`  ❌ ${label} : toujours présent`);
        echec = true;
        break;
      }
      console.log(`  ✅ ${label} retiré`);

      if (k < r.groupes.length - 1) {
        const ms = alea(pauseGroupeMin, pauseGroupeMax);
        console.log(`     … ${Math.round(ms / 1000)} s avant le groupe suivant`);
        await sleep(ms);
      }
    }

    if (echec) {
      // Un retrait refusé peut signaler une restriction de WhatsApp : on n'insiste pas.
      console.log('\n⛔ Un retrait n\'a pas abouti : arrêt par prudence. Vérifiez le groupe sur votre téléphone avant de relancer, idéalement le lendemain.');
      break;
    }
    // Journalisé une fois la personne retirée de tous ses groupes.
    appendJournal(PATHS.journalRetraits, r.numero, 'retire', `${r.nom}${ou(r)}`);
    retires += 1;

    if (n < plan.aRetirer.length - 1) {
      const ms = alea(pauseMinSecondes, pauseMaxSecondes);
      console.log(`  … pause de ${Math.round(ms / 1000)} s`);
      await sleep(ms);
    }
  }

  console.log(`\n✅ ${retires} personne(s) retirée(s). Journal : data/retraits.log`);
  const reste = plan.aRetirer.length - retires + plan.reportes.length;
  if (reste > 0) console.log(`Il en reste ${reste} : relancez la commande pour une nouvelle séance (de préférence quelques heures plus tard).`);
}

const client = await startWhatsApp({ allowQr: false });
try {
  await main(client);
} finally {
  await closeWhatsApp(client);
}
process.exit(0);
