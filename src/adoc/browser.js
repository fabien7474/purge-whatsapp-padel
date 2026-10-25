import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { PATHS, ensureDir } from '../lib/config.js';

/*
 * Le site de la FFT bloque les navigateurs pilotés par un robot dès la connexion.
 * On ne cherche pas à contourner cette protection : on ouvre le vrai Chrome (ou Edge)
 * de l'ordinateur, comme un utilisateur normal, et c'est vous qui vous connectez.
 * Le script ne s'y attache qu'une fois que vous êtes dans Adoc, pour lancer l'export.
 * Le profil Chrome est dédié au bot (.profiles/adoc-chrome) : il ne touche pas au vôtre.
 */

const CANDIDATES = {
  win32: [
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
  ],
};

export function findBrowser(configured) {
  if (configured) {
    if (!fs.existsSync(configured)) throw new Error(`Navigateur introuvable : ${configured} (config.json › adoc.navigateur)`);
    return configured;
  }
  const found = (CANDIDATES[process.platform] ?? []).find((p) => p && !p.startsWith('undefined') && fs.existsSync(p));
  if (!found) {
    throw new Error('Google Chrome (ou Edge) introuvable. Installez Chrome, ou indiquez son chemin dans config.json › adoc.navigateur.');
  }
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const r = await fetch(url);
  return r.json();
}

/** Vrai si l'URL est une page de l'application Adoc (et pas la page de connexion FFT). */
export function isAdocUrl(url, base) {
  return url.startsWith(base) && /\.do\b/.test(url) && !/login|connexion|auth/i.test(url);
}

/** Ouvre Chrome normalement, avec le port de débogage local qui permettra au script de s'y attacher ensuite. */
export async function launchChrome({ url, port, browserPath }) {
  ensureDir(PATHS.adocChromeProfile);
  const extra = process.env.ADOC_CHROME_ARGS ? process.env.ADOC_CHROME_ARGS.split(' ') : [];
  const proc = spawn(
    findBrowser(browserPath),
    [
      `--user-data-dir=${PATHS.adocChromeProfile}`,
      `--remote-debugging-port=${port}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...extra,
      url,
    ],
    { stdio: 'ignore' },
  );

  for (let i = 0; i < 40; i += 1) {
    try {
      await getJson(`http://127.0.0.1:${port}/json/version`);
      return proc;
    } catch {
      await sleep(500);
    }
  }
  proc.kill();
  throw new Error(
    'Chrome ne répond pas. Si une fenêtre Chrome du bot est déjà ouverte, fermez-la et recommencez.',
  );
}

/**
 * Attend que vous soyez connecté, en lisant seulement l'adresse des onglets ouverts :
 * rien n'est injecté dans la page pendant la connexion.
 */
export async function waitForAdoc({ port, base, timeoutMs = 10 * 60 * 1000 }) {
  const start = Date.now();
  let told = false;
  let seen = 0; // l'adresse Adoc doit rester stable (sinon c'est juste avant une redirection vers la connexion)
  while (Date.now() - start < timeoutMs) {
    const targets = await getJson(`http://127.0.0.1:${port}/json/list`).catch(() => null);
    if (!targets) throw new Error('La fenêtre Chrome a été fermée avant la fin de la connexion.');
    seen = targets.some((t) => t.type === 'page' && isAdocUrl(t.url, base)) ? seen + 1 : 0;
    if (seen >= 3) return;
    if (!told && seen === 0 && Date.now() - start > 5000) {
      console.log('  👉 Connectez-vous à Adoc dans la fenêtre Chrome qui vient de s\'ouvrir (identifiant, mot de passe, captcha).');
      told = true;
    }
    await sleep(1000);
  }
  throw new Error('Pas de connexion à Adoc détectée après 10 minutes.');
}

/** S'attache au Chrome déjà connecté et renvoie la page Adoc. */
export async function attach({ port, base }) {
  for (let essai = 0; essai < 5; essai += 1) {
    await waitForAdoc({ port, base });
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => isAdocUrl(p.url(), base));
    if (page) return { browser, page };
    await browser.close(); // simple déconnexion : Chrome reste ouvert, on attend à nouveau
  }
  throw new Error('Onglet Adoc introuvable.');
}

/** Ferme Chrome proprement (les cookies de session sont enregistrés dans le profil du bot). */
export async function closeChrome(browser, proc) {
  try {
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send('Browser.close');
  } catch {
    proc?.kill();
  }
}
