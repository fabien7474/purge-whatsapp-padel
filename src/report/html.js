import { formatKey } from '../lib/phone.js';
import { STATUTS } from './match.js';

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Rapport autonome (aucune ressource externe), à ouvrir dans le navigateur. */
export function renderHtml({ lignes, totaux, groupe, dateAdoc, dateWa, nbAdherents }) {
  const chips = Object.entries(STATUTS)
    .map(([k, label]) => `<button class="chip ${k}" data-f="${k}">${esc(label)} <b>${totaux[k]}</b></button>`)
    .join('');
  const rows = lignes
    .map(
      (l) => `<tr class="${l.statut}"><td><span class="tag ${l.statut}">${esc(STATUTS[l.statut])}</span></td>
<td class="num">${esc(formatKey(l.numero))}</td><td>${esc(l.nomWhatsApp)}${l.admin ? ' <small>admin</small>' : ''}</td>
<td>${esc(l.adherent)}</td><td class="why">${esc(l.raison)}</td></tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Purge groupe padel</title>
<style>
:root{--bg:#fafaf7;--fg:#1d1d1b;--muted:#6b6b66;--line:#e4e3dc;--ok:#2f7d4f;--keep:#3d6bb3;--check:#b7791f;--out:#b83a3a}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe6;--muted:#a09f99;--line:#2e2e2b}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}p.meta{color:var(--muted);margin:0 0 20px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.chip{border:1px solid var(--line);background:transparent;color:inherit;border-radius:999px;padding:6px 12px;cursor:pointer;font:inherit}
.chip.on{border-color:currentColor}.chip.ok{color:var(--ok)}.chip.conserve{color:var(--keep)}.chip.a_verifier{color:var(--check)}.chip.a_retirer{color:var(--out)}
input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit;margin-bottom:12px}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:13px;color:var(--muted);font-weight:600}
td.num{white-space:nowrap;font-variant-numeric:tabular-nums}td.why{color:var(--muted)}small{color:var(--muted)}
.tag{font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap;border:1px solid currentColor}
.tag.ok{color:var(--ok)}.tag.conserve{color:var(--keep)}.tag.a_verifier{color:var(--check)}.tag.a_retirer{color:var(--out)}
</style></head><body><main>
<h1>Groupe « ${esc(groupe)} »</h1>
<p class="meta">${lignes.length} membres WhatsApp (lus le ${esc(dateWa)}) comparés à ${nbAdherents} adhérents Adoc (export du ${esc(dateAdoc)}).</p>
<div class="chips">${chips}</div>
<input id="q" type="search" placeholder="Rechercher un nom ou un numéro…">
<div class="wrap"><table><thead><tr><th>Statut</th><th>Numéro</th><th>Nom WhatsApp</th><th>Adhérent Adoc</th><th>Raison</th></tr></thead>
<tbody>${rows}</tbody></table></div>
</main>
<script>
const chips=[...document.querySelectorAll('.chip')],q=document.getElementById('q'),rows=[...document.querySelectorAll('tbody tr')];
let filtre=null;
function apply(){const t=q.value.toLowerCase();rows.forEach(r=>{r.hidden=(filtre&&!r.classList.contains(filtre))||(t&&!r.textContent.toLowerCase().includes(t))})}
chips.forEach(c=>c.onclick=()=>{filtre=filtre===c.dataset.f?null:c.dataset.f;chips.forEach(x=>x.classList.toggle('on',x.dataset.f===filtre));apply()});
q.oninput=apply;
</script></body></html>
`;
}
