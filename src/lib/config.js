import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Messages d'erreur lisibles plutôt qu'une pile d'appels (DEBUG=1 pour voir le détail).
process.on('uncaughtException', (e) => {
  console.error(`\n❌ ${e?.message ?? e}`);
  if (process.env.DEBUG) console.error(e);
  process.exit(1);
});

export const ROOT =path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PATHS = {
  data: path.join(ROOT, 'data'),
  adocDir: path.join(ROOT, 'data', 'adoc'),
  adherents: path.join(ROOT, 'data', 'adoc', 'adherents.json'),
  waDir: path.join(ROOT, 'data', 'whatsapp'),
  membres: path.join(ROOT, 'data', 'whatsapp', 'membres.json'),
  rapportsDir: path.join(ROOT, 'data', 'rapports'),
  aRetirer: path.join(ROOT, 'data', 'a-retirer.txt'),
  journalRetraits: path.join(ROOT, 'data', 'retraits.log'),
  adocProfile: path.join(ROOT, '.profiles', 'adoc'),
  waAuth: path.join(ROOT, '.wwebjs_auth'),
  config: path.join(ROOT, 'config.json'),
  configExample: path.join(ROOT, 'config.example.json'),
  listeBlanche: path.join(ROOT, 'liste-blanche.txt'),
};

const DEFAULTS = JSON.parse(fs.readFileSync(PATHS.configExample, 'utf8'));

function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base?.[k] ?? {}, v) : v;
  }
  return out;
}

export function loadConfig() {
  if (!fs.existsSync(PATHS.config)) return DEFAULTS;
  return merge(DEFAULTS, JSON.parse(fs.readFileSync(PATHS.config, 'utf8')));
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

export function readJson(file, hint) {
  if (!fs.existsSync(file)) {
    throw new Error(`Fichier introuvable : ${path.relative(ROOT, file)}${hint ? `\n→ ${hint}` : ''}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Lit un fichier texte « un numéro par ligne », en ignorant ce qui suit un #. */
export function readNumberList(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean);
}
