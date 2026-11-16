/* Affichage de la page de suivi. Les calculs sont dans moteur.js. */
"use strict";

// Adresse du fichier de données. En local : le fichier du projet. En ligne : celle du dépôt de données (à fixer).
const URL_DONNEES = "../donnees/deathlist.json";

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MEDAILLES = ["🥇", "🥈", "🥉"];

const esc = s => String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const nb = x => (Math.round(x * 100) / 100).toLocaleString("fr-FR");
const pts = x => nb(x) + (Math.abs(x) >= 2 ? " points" : " point");
const dateFr = iso => { const [a, m, j] = iso.split("-"); return Number(j) + " " + MOIS[Number(m) - 1] + " " + a; };
const aujourdhuiIso = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

let PUBLIE, D, H, AUJ, ANNEE, EV; // PUBLIE : version publiée ; D : données affichées (publiées, ou brouillon en aperçu)

// ───────────── éléments réutilisés ─────────────

function podium(lignes, valeur) {
  const top = lignes.filter(l => l.rang <= 3);
  if (!top.length) return "";
  const parRang = [1, 2, 3].map(r => top.filter(l => l.rang === r));
  return `<div class="podium">${parRang.map((ls, i) => ls.length ? `<div class="marche r${i + 1}">
      <div class="med" aria-hidden="true">${MEDAILLES[i]}</div>
      <div class="qui">${ls.map(l => esc(l.nom)).join(", ")}</div>
      <div class="combien">${i + 1}${i ? "e" : "er"} · ${valeur(ls[0])}</div></div>` : `<div class="marche r${i + 1}"></div>`).join("")}</div>`;
}

function barre(v, max) {
  const pc = max > 0 ? Math.max(0, v) / max * 100 : 0;
  return `<div class="barre-val"><span class="v">${nb(v)}</span><span class="piste"><i style="width:${pc}%"></i></span></div>`;
}

function evo(e) {
  if (e == null) return `<span class="evo">·</span>`;
  if (e > 0) return `<span class="evo monte" title="monte de ${e} place(s)">▲ ${e}</span>`;
  if (e < 0) return `<span class="evo baisse" title="descend de ${-e} place(s)">▼ ${-e}</span>`;
  return `<span class="evo" title="même place">=</span>`;
}

function puces(id, options, actif) {
  return `<div class="puces" id="${id}">${options.map(([v, l]) =>
    `<button type="button" data-v="${esc(v)}" class="${String(v) === String(actif) ? "on" : ""}">${esc(l)}</button>`).join("")}</div>`;
}

function brancherPuces(id, rappel) {
  document.getElementById(id).addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    rappel(b.dataset.v);
  });
}

// Courbe à une seule série (le titre de la carte la nomme). points : [{x, y, info}].
// inverse : le rang 1 en haut.
function courbe(points, { inverse = false, yMin, yMax, entier = false } = {}) {
  const L = 900, Ht = 260, g = 40, d = 20, h = 18, b = 28;
  const ys = points.map(p => p.y);
  const lo = yMin != null ? yMin : Math.min(...ys), hi = yMax != null ? yMax : Math.max(...ys);
  const ecart = hi - lo || 1;
  const X = i => g + (points.length === 1 ? (L - g - d) / 2 : i * (L - g - d) / (points.length - 1));
  const Y = v => inverse ? h + (v - lo) / ecart * (Ht - h - b) : Ht - b - (v - lo) / ecart * (Ht - h - b);
  const pas = entier ? Math.max(1, Math.ceil(ecart / 5)) : ecart / 4;
  const graduations = [];
  for (let v = lo; v <= hi + 1e-9; v += pas) graduations.push(v);
  const id = "c" + Math.random().toString(36).slice(2);
  const svg = `<svg viewBox="0 0 ${L} ${Ht}" role="img" aria-label="courbe">
    ${graduations.map(v => `<line class="grille-l" x1="${g}" x2="${L - d}" y1="${Y(v)}" y2="${Y(v)}"/>
      <text class="axe" x="${g - 8}" y="${Y(v) + 4}" text-anchor="end">${nb(v)}</text>`).join("")}
    ${points.map((p, i) => `<text class="axe" x="${X(i)}" y="${Ht - 8}" text-anchor="middle">${esc(p.x)}</text>`).join("")}
    <polyline class="ligne" points="${points.map((p, i) => X(i) + "," + Y(p.y)).join(" ")}"/>
    ${points.map((p, i) => `<circle class="point" cx="${X(i)}" cy="${Y(p.y)}" r="4.5"/>`).join("")}
    <text class="etiq" x="${X(points.length - 1)}" y="${Y(points[points.length - 1].y) - 10}" text-anchor="middle">${nb(points[points.length - 1].y)}</text>
    ${points.map((p, i) => `<rect class="cible" data-i="${i}" x="${X(i) - (L - g - d) / Math.max(1, points.length - 1) / 2}" y="0" width="${(L - g - d) / Math.max(1, points.length - 1)}" height="${Ht}"/>`).join("")}
  </svg>`;
  setTimeout(() => {
    const boite = document.getElementById(id); if (!boite) return;
    const bulle = boite.querySelector(".infobulle"), s = boite.querySelector("svg");
    s.addEventListener("mousemove", ev => {
      const r = ev.target.closest(".cible"); if (!r) { bulle.style.display = "none"; return; }
      const i = Number(r.dataset.i), k = s.getBoundingClientRect().width / L;
      bulle.innerHTML = points[i].info; bulle.style.display = "block";
      bulle.style.left = X(i) * k + "px"; bulle.style.top = Y(points[i].y) * k + "px";
    });
    s.addEventListener("mouseleave", () => { bulle.style.display = "none"; });
  });
  return `<div class="graphe" id="${id}">${svg}<div class="infobulle"></div></div>`;
}

// Petite courbe du rang mois par mois (1er en haut), même échelle pour tous les joueurs.
function miniCourbe(rangs, nbJoueurs, nom) {
  const L = 300, Ht = 92, g = 20, d = 8, h = 8, b = 18;
  const X = i => g + i * (L - g - d) / Math.max(1, rangs.length - 1);
  const Y = r => h + (r - 1) / Math.max(1, nbJoueurs - 1) * (Ht - h - b);
  const der = rangs.length - 1;
  const rep = [1, Math.ceil(nbJoueurs / 2), nbJoueurs];
  return `<svg class="mini" viewBox="0 0 ${L} ${Ht}" role="img" aria-label="rang de ${esc(nom)} à la fin de chaque mois">
    ${rep.map(r => `<line class="grille-l" x1="${g}" x2="${L - d}" y1="${Y(r)}" y2="${Y(r)}"/><text class="axe" x="${g - 5}" y="${Y(r) + 3.5}" text-anchor="end">${r}</text>`).join("")}
    ${rangs.map((r, i) => `<text class="axe" x="${X(i)}" y="${Ht - 4}" text-anchor="middle">${MOIS[i][0].toUpperCase()}</text>`).join("")}
    <polyline class="ligne" points="${rangs.map((r, i) => X(i) + "," + Y(r)).join(" ")}"/>
    ${rangs.map((r, i) => `<circle class="${i === der ? "point" : "cible-mini"}" cx="${X(i)}" cy="${Y(r)}" r="${i === der ? 4 : 7}"><title>fin ${MOIS[i]} : ${r}${r === 1 ? "er" : "e"}</title></circle>`).join("")}
  </svg>`;
}

// Blocs enroulables : clic sur le titre ; état gardé dans le navigateur de chacun.
const REPLIS_DEFAUT = { deces: true, global: true, "a-aide": true };
const CLE_REPLIS = "deathlist.replis";
function lireReplis() { try { return JSON.parse(localStorage.getItem(CLE_REPLIS)) || {}; } catch (e) { return {}; } }
function appliquerReplis() {
  const memo = lireReplis();
  document.querySelectorAll("section.carte[data-sec]").forEach(s => {
    const k = s.dataset.sec;
    s.classList.toggle("replie", k in memo ? memo[k] : !!REPLIS_DEFAUT[k]);
    const h = s.querySelector(":scope > h2");
    if (h) { h.setAttribute("role", "button"); h.tabIndex = 0; h.setAttribute("aria-expanded", String(!s.classList.contains("replie"))); }
  });
}
function basculer(h) {
  const s = h.parentElement, memo = lireReplis();
  s.classList.toggle("replie");
  memo[s.dataset.sec] = s.classList.contains("replie");
  h.setAttribute("aria-expanded", String(!memo[s.dataset.sec]));
  try { localStorage.setItem(CLE_REPLIS, JSON.stringify(memo)); } catch (e) { /* mémoire refusée : vaut pour cette visite */ }
}
document.addEventListener("click", ev => { const h = ev.target.closest("section.carte[data-sec] > h2"); if (h) basculer(h); });
document.addEventListener("keydown", ev => {
  const h = ev.target.closest && ev.target.closest("section.carte[data-sec] > h2");
  if (h && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); basculer(h); }
});

// ───────────── onglet « Suivi global » ─────────────

function vueGlobale() {
  const et = H.find(e => e.annee === ANNEE);
  const decesAnnee = D.deces.filter(d => d.date.startsWith(String(ANNEE)) && d.date <= AUJ);
  const dernier = decesAnnee[decesAnnee.length - 1];
  const nbNommes = Object.keys(D.editions.find(e => e.annee === ANNEE).personnalites || {}).length;
  const dernierMois = EV.mois.length - 1;
  const maxP = Math.max(...et.principal.map(l => l.points));
  const maxD = Math.max(...et.annexe.map(l => l.deces));

  const parDeces = decesAnnee.slice().reverse().map(d => {
    const qui = D.editions.find(e => e.annee === ANNEE).participants.filter(p => p.liste.includes(d.id)).map(p => p.joueurs[0]);
    const val = M.bareme(et.epoque, qui.length);
    return `<tr><td class="num">${dateFr(d.date)}</td><td>${esc(d.nom)}</td><td>${qui.map(esc).join(", ")}</td><td class="num">${pts(val)}</td></tr>`;
  }).join("");

  return `
  <section class="kpis">
    <div class="tuile-kpi"><span class="lib">Croque-mort en chef</span><span class="val">${et.principal.filter(l => l.rang === 1).map(l => esc(l.nom)).join(", ")}</span><span class="note">${pts(et.principal[0].points)}</span></div>
    <div class="tuile-kpi"><span class="lib">Macchabées ${ANNEE}</span><span class="val">${decesAnnee.length} <small>sur ${nbNommes}</small></span><span class="note">personnalités nommées</span></div>
    <div class="tuile-kpi"><span class="lib">Dernier parti</span><span class="val" style="font-size:18px">${dernier ? esc(dernier.nom) : "aucun"}</span><span class="note">${dernier ? dateFr(dernier.date) : ""}</span></div>
    <div class="tuile-kpi"><span class="lib">Fossoyeurs ${ANNEE}</span><span class="val">${et.principal.length}</span><span class="note">listes de ${D.epoques.find(e => e.id === et.epoque).noms_par_liste} noms</span></div>
  </section>

  <div class="grille">
    <section class="carte" data-sec="classement">
      <h2>Classement des fossoyeurs ${ANNEE}${et.enCours ? " (en cours)" : ""}</h2>
      ${podium(et.principal, l => pts(l.points))}
      <div class="defil"><table>
        <thead><tr><th class="centre">Rang</th><th>Joueur</th><th>Points</th><th class="num">Décès</th><th class="num" title="âge moyen de la liste au 1er janvier">Âge moy.</th><th class="centre" title="depuis la fin du mois précédent">Évol.</th></tr></thead>
        <tbody>${et.principal.map(l => `<tr><td class="rang">${l.rang}</td><td>${esc(l.nom)}</td><td>${barre(l.points, maxP)}</td>
          <td class="num">${l.deces}</td><td class="num">${l.ageMoyen != null ? nb(l.ageMoyen) : ""}</td>
          <td class="centre">${evo(EV.joueurs[l.joueur].ecarts[dernierMois])}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="sous">Égalité : nombre de décès, puis moyenne d'âge de la liste la plus basse (règles 2026).</p>
    </section>

    <section class="carte" data-sec="annexe">
      <h2>Tableau de chasse ${ANNEE} <small class="glose">(nombre de décès)</small></h2>
      ${podium(et.annexe, l => l.deces + " décès")}
      <div class="defil"><table>
        <thead><tr><th class="centre">Rang</th><th>Joueur</th><th>Décès</th></tr></thead>
        <tbody>${et.annexe.map(l => `<tr><td class="rang">${l.rang}</td><td>${esc(l.nom)}</td><td>${barre(l.deces, maxD)}</td></tr>`).join("")}</tbody>
      </table></div>
    </section>
  </div>

  <section class="carte" data-sec="montees">
    <h2>Résurrections et mises en bière ${ANNEE} <small class="glose">(montées et descentes)</small></h2>
    <div class="cases-joueurs">${et.principal.map(l => { const j = EV.joueurs[l.joueur], meilleur = Math.min(...j.rangs.slice(1));
      return `<div class="case-joueur">
        <div class="case-tete"><span class="place">${l.rang}<small>${l.rang === 1 ? "er" : "e"}</small></span>
          <span class="qui">${esc(l.nom)}</span>${evo(j.ecarts[dernierMois])}</div>
        ${miniCourbe(j.rangs, et.principal.length, l.nom)}
        <div class="sous">${pts(l.points)} · meilleure place : ${meilleur}${meilleur === 1 ? "er" : "e"}</div>
      </div>`; }).join("")}</div>
    <p class="sous">▲ / ▼ : places gagnées ou perdues depuis la fin du mois précédent (le mois en cours est compté jusqu'à aujourd'hui). La courbe suit le rang à la fin de chaque mois, 1er en haut, ${et.principal.length}e en bas ; survoler un point pour le détail. Meilleure place : à partir de février (en janvier, sans décès, l'ordre ne suit que l'âge des listes).</p>
  </section>

  <section class="carte" data-sec="deces">
    <h2>Avis de décès ${ANNEE} (${decesAnnee.length})</h2>
    <div class="defil"><table>
      <thead><tr><th class="num">Date</th><th>Personnalité</th><th>Nommée par</th><th class="num">Valeur</th></tr></thead>
      <tbody>${parDeces || `<tr><td colspan="4" class="vide">Aucun décès pour l'instant.</td></tr>`}</tbody>
    </table></div>
  </section>

  <section class="carte" id="bloc-histo" data-sec="histo"></section>
  <section class="carte" id="bloc-global" data-sec="global"></section>
  <section class="carte" id="bloc-taux" data-sec="taux"></section>`;
}

function blocHistorique(annee) {
  const et = H.find(e => e.annee === Number(annee));
  const maxP = Math.max(...et.principal.map(l => l.points)) || 1;
  document.getElementById("bloc-histo").innerHTML = `
    <h2>Les archives du cimetière, année par année</h2>
    <div class="barre">${puces("p-histo", H.map(e => [e.annee, e.annee + (e.enCours ? " (en cours)" : "")]), annee)}</div>
    <p class="sous">${esc(D.epoques.find(e => e.id === et.epoque).libelle)} : ${esc(D.epoques.find(e => e.id === et.epoque).bareme)}.</p>
    <div class="grille">
      <div><h3>Classement</h3>${podium(et.principal, l => pts(l.points))}
        <table><thead><tr><th class="centre">Rang</th><th>Joueur</th><th>Points</th><th class="num">Décès</th></tr></thead>
        <tbody>${et.principal.map(l => `<tr><td class="rang">${l.rang}</td><td>${esc(l.nom)}</td><td>${barre(l.points, maxP)}</td><td class="num">${l.deces}</td></tr>`).join("")}</tbody></table></div>
      <div><h3>Tableau de chasse</h3>${podium(et.annexe, l => l.deces + " décès")}
        <table><thead><tr><th class="centre">Rang</th><th>Joueur</th><th class="num">Décès</th></tr></thead>
        <tbody>${et.annexe.map(l => `<tr><td class="rang">${l.rang}</td><td>${esc(l.nom)}</td><td class="num">${l.deces}</td></tr>`).join("")}</tbody></table></div>
    </div>`;
  brancherPuces("p-histo", blocHistorique);
}

function blocGlobal() {
  const g = M.classementGlobal(H);
  const maxP = g[0].points;
  document.getElementById("bloc-global").innerHTML = `
    <h2>Le grand ossuaire <small class="glose">(toutes les années, année en cours comprise)</small></h2>
    <div class="defil"><table>
      <thead><tr><th class="centre">Rang</th><th>Joueur</th><th>Points</th><th class="num">Participations</th><th class="num">Décès</th><th class="num">Victoires</th><th class="num">Podiums</th></tr></thead>
      <tbody>${g.map(c => `<tr><td class="rang">${c.rang}</td><td>${esc(c.joueur)}</td><td>${barre(c.points, maxP)}</td>
        <td class="num">${c.participations}</td><td class="num">${c.deces}</td><td class="num">${c.victoires}</td><td class="num">${c.podiums}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="sous">Les points ne se comparent pas d'une époque à l'autre (barèmes et longueur des listes différents) : ce total additionne des choses différentes. Victoires et podiums : années terminées seulement.</p>`;
}

let tauxEpoque = "epoque2", tauxCle = "tauxPoints";
function blocTaux() {
  const ep = D.epoques.find(e => e.id === tauxEpoque);
  const etats = H.filter(e => ep.annees.includes(e.annee));
  const t = M.classementTaux(etats, tauxCle);
  const max = Math.max(...t.map(c => c[tauxCle])) || 1;
  document.getElementById("bloc-taux").innerHTML = `
    <h2>Le flair du charognard, par époque <small class="glose">(taux de réussite)</small></h2>
    <div class="barre">${puces("p-epoque", D.epoques.map(e => [e.id, e.libelle]), tauxEpoque)}
      ${puces("p-cle", [["tauxPoints", "Points par participation"], ["tauxDeces", "Décès par participation"]], tauxCle)}</div>
    <div class="defil"><table>
      <thead><tr><th class="centre">Rang</th><th>Joueur</th><th>${tauxCle === "tauxPoints" ? "Points" : "Décès"} par participation</th><th class="num">Participations</th></tr></thead>
      <tbody>${t.map(c => `<tr><td class="rang">${c.rang}</td><td>${esc(c.joueur)}</td><td>${barre(c[tauxCle], max)}</td><td class="num">${c.participations}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="sous">Pas de minimum de participations : un taux sur une ou deux années dépend beaucoup de l'année jouée.${etats.some(e => e.enCours) ? " L'année en cours est comptée." : ""}</p>`;
  brancherPuces("p-epoque", v => { tauxEpoque = v; blocTaux(); });
  brancherPuces("p-cle", v => { tauxCle = v; blocTaux(); });
}

// ───────────── onglet « Suivi par joueur » ─────────────

let joueurChoisi = null;
function vueJoueur() {
  const tous = [...new Set(H.flatMap(e => e.principal.map(l => l.joueur)))].sort((a, b) => a.localeCompare(b, "fr"));
  if (!joueurChoisi) joueurChoisi = tous.includes("Gaël") ? "Gaël" : tous[0];
  return `<section class="carte"><label class="barre">Joueur
      <select id="choix-joueur">${tous.map(j => `<option${j === joueurChoisi ? " selected" : ""}>${esc(j)}</option>`).join("")}</select></label>
    </section><div id="fiche" style="display:grid;gap:16px"></div>`;
}

function fiche() {
  const j = joueurChoisi;
  const parcours = M.parcoursJoueur(H, j);
  const finies = parcours.filter(p => !p.enCours);
  const meilleur = finies.length ? Math.min(...finies.map(p => p.rang)) : null;
  const courant = parcours.find(p => p.annee === ANNEE);
  let html = `<section class="kpis">
    <div class="tuile-kpi"><span class="lib">Saisons de chasse</span><span class="val">${parcours.length}</span><span class="note">${parcours.map(p => p.annee).join(", ")}</span></div>
    <div class="tuile-kpi"><span class="lib">Couronnes mortuaires</span><span class="val">${finies.filter(p => p.rang === 1).length}</span><span class="note">podiums : ${finies.filter(p => p.rang <= 3).length}</span></div>
    <div class="tuile-kpi"><span class="lib">Meilleur rang</span><span class="val">${meilleur != null ? meilleur : "·"}</span><span class="note">années terminées</span></div>
    <div class="tuile-kpi"><span class="lib">${ANNEE}</span><span class="val">${courant ? courant.rang + "<small>" + (courant.rang === 1 ? "er" : "e") + " / " + courant.participants + "</small>" : "·"}</span><span class="note">${courant ? pts(courant.points) : "ne joue pas cette année"}</span></div>
  </section>
  <section class="carte" data-sec="j-parcours"><h2>Carrière funèbre</h2><div class="defil"><table>
    <thead><tr><th>Année</th><th class="num">Rang</th><th class="num">Points</th><th class="num">Décès</th><th class="num">Rang annexe</th></tr></thead>
    <tbody>${parcours.map(p => `<tr><td>${p.annee}${p.enCours ? " (en cours)" : ""}${p.nom !== j ? ` <span class="badge neutre">${esc(p.nom)}</span>` : ""}</td>
      <td class="num">${p.rang} / ${p.participants}</td><td class="num">${nb(p.points)}</td><td class="num">${p.deces}</td><td class="num">${p.rangAnnexe}</td></tr>`).join("")}</tbody>
  </table></div></section>`;

  if (M.aJoueDeuxAnneesDeSuite(H, j)) {
    html += `<section class="carte" data-sec="j-rang"><h2>Rang dans l'au-delà <small class="glose">(année par année)</small></h2>
      ${courbe(parcours.map(p => ({ x: String(p.annee), y: p.rang, info: `<b>${p.annee}</b> : ${p.rang}${p.rang === 1 ? "er" : "e"} sur ${p.participants}, ${pts(p.points)}` })), { inverse: true, yMin: 1, entier: true })}
      <p class="sous">Le rang se compare mieux que les points d'une époque à l'autre. Années sans édition ou non jouées : absentes.</p></section>`;
  } else {
    html += `<section class="bandeau info">La courbe d'évolution apparaît quand un joueur a joué deux années de suite.</section>`;
  }

  if (courant) {
    const ev = EV.joueurs[j];
    html += `<section class="carte" data-sec="j-points"><h2>Récolte de ${esc(j)} en ${ANNEE}, fin de chaque mois <small class="glose">(points)</small></h2>
      ${courbe(EV.mois.map((m, i) => ({ x: MOIS[m.mois - 1], y: ev.points[i], info: `<b>fin ${MOIS[m.mois - 1]}</b> : ${pts(ev.points[i])}, ${ev.rangs[i]}${ev.rangs[i] === 1 ? "er" : "e"}` })), { yMin: 0 })}
    </section>`;
    const et = H.find(e => e.annee === ANNEE);
    const ligne = et.principal.find(l => l.joueur === j);
    const ed = D.editions.find(e => e.annee === ANNEE);
    const perso = ed.personnalites;
    const nomin = {}; ed.participants.forEach(p => p.liste.forEach(id => { nomin[id] = (nomin[id] || 0) + 1; }));
    const liste = ed.participants.find(p => p.joueurs[0] === j).liste;
    const morts = M.decesDeLAnnee(D, ANNEE, AUJ);
    html += `<section class="carte" data-sec="j-liste"><h2>Liste noire ${ANNEE} de ${esc(j)}</h2><div class="defil"><table>
      <thead><tr><th>Personnalité</th><th>Pays</th><th class="num">Âge</th><th class="num">Listes</th><th class="num">Valeur</th><th>Décès</th></tr></thead>
      <tbody>${liste.map(id => { const p = perso[id], mort = morts[id] && morts[id].date;
        return `<tr><td class="${mort ? "mort" : ""}">${esc(p.nom)}</td><td>${esc(p.pays || "")}</td><td class="num">${p.age != null ? p.age : ""}</td>
          <td class="num">${nomin[id]}</td><td class="num">${nb(M.bareme(et.epoque, nomin[id]))}</td><td>${mort ? "☠ " + dateFr(mort) : ""}</td></tr>`; }).join("")}</tbody>
    </table></div><p class="sous">${ligne.deces} décès, ${pts(ligne.points)}. « Listes » : nombre de joueurs qui ont nommé la personne ; la valeur en dépend.</p></section>`;
  }
  document.getElementById("fiche").innerHTML = html;
  appliquerReplis();
}

// ───────────── navigation ─────────────

function afficher() {
  const onglet = location.hash === "#joueur" ? "joueur" : location.hash === "#admin" ? "admin" : "global";
  document.querySelectorAll("nav.menu a").forEach(a => a.toggleAttribute("aria-current", a.dataset.onglet === onglet));
  if (onglet === "admin") {
    document.getElementById("titre").textContent = "La morgue (administration)";
    rendreAdmin();
  } else if (onglet === "global") {
    document.getElementById("titre").textContent = "Suivi mortuaire";
    document.getElementById("contenu").innerHTML = vueGlobale();
    blocHistorique(ANNEE);
    blocGlobal();
    blocTaux();
    appliquerReplis();
  } else {
    document.getElementById("titre").textContent = "Fiche du fossoyeur";
    document.getElementById("contenu").innerHTML = vueJoueur();
    document.getElementById("choix-joueur").addEventListener("change", ev => { joueurChoisi = ev.target.value; fiche(); });
    fiche();
  }
  if (onglet !== "admin" && D !== PUBLIE) {
    document.getElementById("contenu").insertAdjacentHTML("afterbegin",
      `<section class="bandeau att"><b>Aperçu :</b> tu vois tes modifications non publiées. Les joueurs voient encore la version publiée. <a href="#admin">Retour à la morgue</a></section>`);
  }
  document.querySelectorAll("nav.menu a[aria-current]").forEach(a => a.setAttribute("aria-current", "page"));
}

// Calcule tout ce que la page affiche à partir d'un jeu de données (publié, ou brouillon en aperçu), puis réaffiche.
function installer(donnees) {
  D = donnees;
  // Année suivie : la plus récente qui a des joueurs, sans dépasser l'année en cours (une année préparée à l'avance attend son tour).
  const anneeAuj = Number(AUJ.slice(0, 4));
  const avecJoueurs = D.editions.filter(e => e.participants.length).map(e => e.annee);
  const passees = avecJoueurs.filter(a => a <= anneeAuj);
  ANNEE = passees.length ? Math.max(...passees) : Math.max(...avecJoueurs);
  H = M.historique(D, AUJ);
  EV = M.evolutionMensuelle(D, ANNEE, AUJ);
  const dernier = D.deces.filter(d => d.date <= AUJ).map(d => d.date).sort().pop();
  document.getElementById("sous-titre").textContent = "Données à jour au " + (dernier ? dateFr(dernier) : "1er janvier") + " (dernier décès compté)"
    + (D !== PUBLIE ? " · aperçu du brouillon" : "");
  afficher();
}

const M = window.Moteur;
Theme.remplirSelecteur(document.getElementById("theme"));
fetch(URL_DONNEES, { cache: "no-store" })
  .then(r => { if (!r.ok) throw new Error("fichier de données introuvable (" + r.status + ")"); return r.json(); })
  .then(donnees => {
    PUBLIE = donnees;
    AUJ = aujourdhuiIso();
    installer(donneesAffichees());
    window.addEventListener("hashchange", afficher);
  })
  .catch(e => {
    document.getElementById("titre").textContent = "Impossible de charger les données";
    document.getElementById("contenu").innerHTML = `<section class="bandeau att">${esc(e.message)}. En local, ouvrir la page avec LANCER_LA_PAGE.bat (un double-clic sur index.html ne suffit pas).</section>`;
  });
