import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { phoneKeys, waKey, formatKey } from '../src/lib/phone.js';
import { nameMatches } from '../src/lib/names.js';
import { parseAdocExport } from '../src/adoc/parse.js';
import { matchMembers, summarize } from '../src/report/match.js';
import { planRemoval } from '../src/whatsapp/plan.js';

test('numéros : formats courants saisis dans Adoc', () => {
  assert.deepEqual(phoneKeys('06 12 34 56 78'), ['33612345678']);
  assert.deepEqual(phoneKeys('06.12.34.56.78'), ['33612345678']);
  assert.deepEqual(phoneKeys('+33 6 12 34 56 78'), ['33612345678']);
  assert.deepEqual(phoneKeys('0033612345678'), ['33612345678']);
  assert.deepEqual(phoneKeys(612345678), ['33612345678'], 'zéro initial perdu par Excel');
  assert.deepEqual(phoneKeys('+41 79 123 45 67'), ['41791234567']);
  assert.deepEqual(phoneKeys('079 123 45 67').sort(), ['33791234567', '41791234567'], 'ambigu FR/CH : deux lectures');
  assert.deepEqual(phoneKeys(''), []);
  assert.deepEqual(phoneKeys('n/a'), []);
});

test('identifiants WhatsApp', () => {
  assert.equal(waKey('33612345678@c.us'), '33612345678');
  assert.equal(waKey('123456789012345@lid'), null);
  assert.equal(formatKey('33612345678'), '+33 6 12 34 56 78');
});

test('noms : prénom et nom requis', () => {
  assert.ok(nameMatches('Émilie Balas 🎾', 'BALAS', 'Emilie'));
  assert.ok(nameMatches('emilie balas-durand', 'Balas Durand', 'Émilie'));
  assert.ok(!nameMatches('Emilie', 'BALAS', 'Emilie'));
  assert.ok(!nameMatches('', 'BALAS', 'Emilie'));
});

function fakeExport(rows, before = []) {
  const wb = XLSX.utils.book_new();
  for (const [name, r] of before) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r), name);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Adherents');
  return XLSX.write(wb, { type: 'buffer', bookType: 'biff8' });
}

test('lecture : prend la feuille « Détaillé » quand la première n\'a pas de téléphone', () => {
  const buf = fakeExport(
    [['Famille', 'Nom', 'Prénom', 'Téléphone Portable', '2eme Téléphone portable'], ['', 'DUPONT', 'Jean', '+33612345678', '0041791234567']],
    [['Simple', [['ANNECY TENNIS'], [], [], ['Famille', 'Nom', 'Prénom', 'Sexe', 'Licence', 'N° club de rattachement de la licence'], ['', 'DUPONT', 'Jean', 'H', '1', '12 74 0001']]]],
  );
  const r = parseAdocExport(buf);
  assert.equal(r.feuille, 'Adherents');
  assert.deepEqual(r.adherents[0].telephones.sort(), ['33612345678', '41791234567']);
});

test('lecture d\'un export Adoc (.xls) avec plusieurs colonnes téléphone', () => {
  const buf = fakeExport([
    ['Liste des adhérents'],
    [],
    ['Civilité', 'Nom', 'Prénom', 'Né(e) en', 'Téléphone fixe', 'Téléphone portable', 'Fax', 'Email'],
    ['M.', 'DUPONT', 'Jean', 1980, '04 50 11 22 33', '06 12 34 56 78', '04 50 99 99 99', 'j@x.fr'],
    ['Mme', 'MARTIN', 'Léa', 1990, '', 698765432, '', ''],
    ['M.', 'SANS', 'Numéro', 1975, '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
  ]);
  const r = parseAdocExport(buf);
  assert.equal(r.colonnesUtilisees.nom, 'Nom');
  assert.deepEqual(r.colonnesUtilisees.telephones, ['Téléphone fixe', 'Téléphone portable']);
  assert.equal(r.adherents.length, 3);
  assert.deepEqual(r.adherents[0].telephones.sort(), ['33450112233', '33612345678']);
  assert.deepEqual(r.adherents[1].telephones, ['33698765432']);
  assert.deepEqual(r.adherents[2].telephones, []);
});

test('lecture : colonnes forcées par la configuration', () => {
  const buf = fakeExport([['NOM', 'PRÉNOM', 'Portable responsable', 'Tél. perso']]
    .concat([['A', 'B', '0611111111', '0622222222']]));
  const r = parseAdocExport(buf, { telephones: ['Portable responsable'] });
  assert.deepEqual(r.adherents[0].telephones, ['33611111111']);
});

const adherents = [
  { nom: 'DUPONT', prenom: 'Jean', telephones: ['33612345678'] },
  { nom: 'MARTIN', prenom: 'Léa', telephones: ['33698765432'] },
  { nom: 'MULLER', prenom: 'Hans', telephones: ['41791234567', '33791234567'] },
];
const membres = [
  { id: 'a', numero: '33612345678', nom: 'Jeannot', admin: false, moi: false },
  { id: 'b', numero: '41791234567', nom: 'Hans', admin: false, moi: false },
  { id: 'c', numero: '33600000001', nom: 'Léa Martin', admin: false, moi: false },
  { id: 'd', numero: '33600000002', nom: 'Inconnu', admin: false, moi: false },
  { id: 'e', numero: '33600000003', nom: 'Coach', admin: false, moi: false },
  { id: 'f', numero: null, lid: 'x@lid', nom: '', admin: false, moi: false },
  { id: 'g', numero: '33600000004', nom: 'Vieil admin', admin: true, moi: false },
  { id: 'h', numero: '33600000005', nom: 'Moi', admin: true, moi: true },
];

test('rapprochement : chaque cas tombe dans la bonne catégorie', () => {
  const r = matchMembers({ adherents, membres, listeBlanche: ['06 00 00 00 03'] });
  const by = Object.fromEntries(r.map((l, i) => [membres[i].id, l]));
  assert.equal(by.a.statut, 'ok');
  assert.equal(by.a.adherent, 'Jean DUPONT');
  assert.equal(by.b.statut, 'ok', 'portable suisse saisi sans indicatif');
  assert.equal(by.c.statut, 'a_verifier', 'même nom, autre numéro');
  assert.equal(by.d.statut, 'a_retirer');
  assert.equal(by.e.statut, 'conserve');
  assert.equal(by.f.statut, 'a_verifier');
  assert.equal(by.g.statut, 'a_verifier', 'un admin n\'est jamais proposé au retrait');
  assert.equal(by.h.statut, 'conserve');
  assert.deepEqual(summarize(r), { ok: 2, conserve: 2, a_verifier: 3, a_retirer: 1 });
});

test('plan de retrait : protections, reprise et plafond', () => {
  const plan = planRemoval({
    lignes: ['+33 6 00 00 00 02  # Inconnu', '06 00 00 00 04', '06 00 00 00 05', '0600000099', '06 00 00 00 03', '06 12 34 56 78'],
    membres,
    journal: [{ numero: '33600000099', statut: 'retire' }],
    listeBlanche: ['0600000003'],
    max: 1,
  });
  assert.deepEqual(plan.aRetirer.map((r) => r.id), ['d']);
  assert.deepEqual(plan.reportes, ['33612345678']);
  assert.deepEqual(plan.dejaFaits, ['33600000099']);
  assert.deepEqual(plan.proteges.map((p) => p.raison), ['admin du groupe', 'compte connecté', 'liste blanche']);
});
