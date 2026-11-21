/* Affichage de la page de suivi. Les calculs sont dans moteur.js. */
"use strict";

// Adresse du fichier de données. En local : le fichier du projet. En ligne : celle du dépôt de données (à fixer).
const URL_DONNEES = "../donnees/deathlist.json";

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
// Podium à 4 marches : images de page\images (cercueil d'or, crâne d'argent, croix à l'envers de bronze, tombe violette).
const MEDAILLES = ["1re place : cercueil d'or", "2e place : crâne d'argent", "3e place : croix à l'envers de bronze", "4e place : tombe"];

// Description d'une époque : nom, barème et nombre de nominés par liste (demande de Gaël, 21/11/2026).
const descEpoque = ep => `${ep.libelle} : ${ep.bareme}. ${ep.noms_par_liste} nominés.`;
const esc = s =>String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const nb = x => (Math.round(x * 100) / 100).toLocaleString("fr-FR");
const pts = x => nb(x) + (Math.abs(x) >= 2 ? " points" : " point");
const dateFr = iso => { const [a, m, j] = iso.split("-"); return Number(j) + " " + MOIS[Number(m) - 1] + " " + a; };
const aujourdhuiIso = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

let PUBLIE, D, H, AUJ, ANNEE, EV; // PUBLIE : version publiée ; D : données affichées (publiées, ou brouillon en aperçu)

// ───────────── éléments réutilisés ─────────────

// Podium « qui glisse » (choix de Quentin) : les marches se remplissent dans l'ordre des rangs réels jusqu'au 4e ;
// à égalité, les joueurs partagent une marche et la suivante prend le rang d'après (1er, 2e ex aequo, puis 4e sur
// la 3e marche). L'étiquette et l'image (numérotée) suivent le vrai rang ; une marche sans personne n'est pas affichée.
function podium(lignes, valeur) {
  const rangs = [...new Set(lignes.map(l => l.rang))].filter(r => r <= 4).sort((a, b) => a - b);
  if (!rangs.length) return "";
  const marches = rangs.map(r => lignes.filter(l => l.rang === r));
  return `<div class="podium" style="grid-template-columns:repeat(${marches.length},minmax(0,1fr))">${marches.map((ls, i) => {
    const r = ls[0].rang;
    return `<div class="marche r${i + 1}">
      <div class="med"><img src="images/podium_${r}.webp" alt="${MEDAILLES[r - 1]}" width="240" height="200" loading="lazy"></div>
      <div class="qui">${ls.map(l => esc(l.nom)).join(", ")}</div>
      <div class="combien">${r}${r === 1 ? "er" : "e"}${ls.length > 1 ? " ex aequo" : ""} · ${valeur(ls[0])}</div></div>`;
  }).join("")}</div>`;
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

// Titre de bloc : le jeu de mots en gros, ce que c'est exactement en petit entre parenthèses, et un « i »
// qui ouvre une bulle d'explication (survol, ou toucher sur téléphone). detail : HTML déjà échappé ; info : texte brut.
function titre(jeu, detail, info) {
  return esc(jeu) + (detail ? ` <small class="glose">(${detail})</small>` : "")
    + (info ? ` <span class="info" tabindex="0" role="note" aria-label="${esc(info)}" data-info="${esc(info)}">i</span>` : "");
}
// Bulle ouverte vers la gauche quand le « i » est dans la moitié droite de l'écran (pour ne pas sortir de la page).
function placerBulle(ev) {
  const i = ev.target.closest && ev.target.closest(".info"); if (!i) return;
  i.classList.toggle("vers-gauche", i.getBoundingClientRect().left > innerWidth / 2);
}
document.addEventListener("mouseover", placerBulle);
document.addEventListener("focusin", placerBulle);

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

// Tracé lissé (interpolation cubique monotone, Fritsch-Carlson) : arrondi entre les points, sans jamais dépasser
// les valeurs réelles (pas de rang au-dessus du 1er ni de bosse inventée entre deux mois égaux).
function cheminLisse(p) {
  const r = v => Math.round(v * 10) / 10;
  if (p.length < 3) return "M" + p.map(([x, y]) => r(x) + " " + r(y)).join(" L");
  const n = p.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let chemin = "M" + r(p[0][0]) + " " + r(p[0][1]);
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i + 1][0] - p[i][0]) / 3;
    chemin += ` C${r(p[i][0] + h)} ${r(p[i][1] + m[i] * h)} ${r(p[i + 1][0] - h)} ${r(p[i + 1][1] - m[i + 1] * h)} ${r(p[i + 1][0])} ${r(p[i + 1][1])}`;
  }
  return chemin;
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
    <path class="ligne" d="${cheminLisse(points.map((p, i) => [X(i), Y(p.y)]))}"/>
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
    <path class="ligne" d="${cheminLisse(rangs.map((r, i) => [X(i), Y(r)]))}"/>
    ${rangs.map((r, i) => `<circle class="${i === der ? "point" : "cible-mini"}" cx="${X(i)}" cy="${Y(r)}" r="${i === der ? 4 : 7}"><title>fin ${MOIS[i]} : ${r}${r === 1 ? "er" : "e"}</title></circle>`).join("")}
  </svg>`;
}

// Blocs enroulables : clic sur le titre ; état gardé dans le navigateur de chacun.
const REPLIS_DEFAUT = { montees: true, global: true, "a-aide": true }; // Résurrections repliées par défaut (demande de Gaël, 21/11/2026)
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
document.addEventListener("click", ev => {
  if (ev.target.closest(".info")) return; // le « i » ouvre sa bulle sans enrouler le bloc
  const h = ev.target.closest("section.carte[data-sec] > h2"); if (h) basculer(h);
});
document.addEventListener("keydown", ev => {
  if (ev.target.closest && ev.target.closest(".info")) return;
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
      <h2>${titre("Classement des fossoyeurs", `classement ${ANNEE}${et.enCours ? ", en cours" : ""}`,
        `Points de l'année. ${D.epoques.find(e => e.id === et.epoque).bareme}. Égalité : nombre de décès, puis moyenne d'âge de la liste la plus basse (âge au 1er janvier). Évol. : places gagnées ou perdues depuis la fin du mois précédent.`)}</h2>
      ${podium(et.principal, l => pts(l.points))}
      <div class="defil"><table>
        <thead><tr><th class="centre">Rang</th><th>Joueur</th><th>Points</th><th class="num">Décès</th><th class="num" title="âge moyen de la liste au 1er janvier">Âge moy.</th><th class="centre" title="depuis la fin du mois précédent">Évol.</th></tr></thead>
        <tbody>${et.principal.map(l => `<tr><td class="rang">${l.rang}</td><td>${esc(l.nom)}</td><td>${barre(l.points, maxP)}</td>
          <td class="num">${l.deces}</td><td class="num">${l.ageMoyen != null ? nb(l.ageMoyen) : ""}</td>
          <td class="centre">${evo(EV.joueurs[l.joueur].ecarts[dernierMois])}</td></tr>`).join("")}</tbody>
      </table></div>
    </section>

    <section class="carte" data-sec="annexe">
      <h2>${titre("Tableau de chasse", `classement ${ANNEE} au nombre de décès`,
        "Classement annexe : seul compte le nombre de personnes de la liste qui sont mortes cette année, sans les points.")}</h2>
      ${podium(et.annexe, l => l.deces + " décès")}
      <div class="defil"><table>
        <thead><tr><th class="centre">Rang</th><th>Joueur</th><th>Décès</th></tr></thead>
        <tbody>${et.annexe.map(l => `<tr><td class="rang">${l.rang}</td><td>${esc(l.nom)}</td><td>${barre(l.deces, maxD)}</td></tr>`).join("")}</tbody>
      </table></div>
    </section>
  </div>

  <section class="carte" data-sec="montees">
    <h2>${titre("Résurrections et mises en bière", `montées et descentes ${ANNEE}`,
      `▲ / ▼ : places gagnées ou perdues depuis la fin du mois précédent (le mois en cours compte jusqu'à aujourd'hui). La courbe suit le rang à la fin de chaque mois, 1er en haut, ${et.principal.length}e en bas ; survoler un point pour le détail. Meilleure place : à partir de février (en janvier, sans décès, l'ordre ne suit que l'âge des listes).`)}</h2>
    <div class="cases-joueurs">${et.principal.map(l => { const j = EV.joueurs[l.joueur], meilleur = Math.min(...j.rangs.slice(1));
      return `<div class="case-joueur">
        <div class="case-tete"><span class="place">${l.rang}<small>${l.rang === 1 ? "er" : "e"}</small></span>
          <span class="qui">${esc(l.nom)}</span>${evo(j.ecarts[dernierMois])}</div>
        ${miniCourbe(j.rangs, et.principal.length, l.nom)}
        <div class="sous">${pts(l.points)} · meilleure place : ${meilleur}${meilleur === 1 ? "er" : "e"}</div>
      </div>`; }).join("")}</div>
  </section>

  <section class="carte" data-sec="deces">
    <h2>${titre("Avis de décès", `décès ${ANNEE} : ${decesAnnee.length}`,
      "Les personnalités nommées qui sont mortes cette année, la plus récente en haut. Valeur : points rapportés à chaque joueur qui l'avait nommée (selon le nombre de listes).")}</h2>
    <div class="defil"><table>
      <thead><tr><th class="num">Date</th><th>Personnalité</th><th>Nommée par</th><th class="num">Valeur</th></tr></thead>
      <tbody>${parDeces || `<tr><td colspan="4" class="vide">Aucun décès pour l'instant.</td></tr>`}</tbody>
    </table></div>
  </section>`;
}

// ───────────── onglet « Hall of fame » : trophées de l'année et records de toutes les éditions ─────────────
// Noms et définitions : demande de Gaël, 21/11/2026. Icônes : page\images\tr_<id>.webp (dessinées par Quentin ;
// tant que le fichier n'existe pas, la carte s'affiche sans icône).
const f1 = x => nb(x);
const TROPHEES = {
  gachette: ["Fou de la gâchette", "premier à ouvrir son compteur", "Le premier joueur dont une personnalité de la liste est morte dans l'année.", null],
  quatrevingtdixplus5: ["90+5", "dernier à engranger des points", "Le joueur qui a marqué des points le plus récemment : il change à chaque nouveau décès.", null],
  "peril-jeune": ["Le péril jeune", "liste la plus jeune", "La liste avec la moyenne d'âge la plus basse (âge au 1er janvier).", v => nb(v) + " ans de moyenne"],
  "old-timer": ["Old timer", "liste la plus âgée", "La liste avec la moyenne d'âge la plus élevée (âge au 1er janvier).", v => nb(v) + " ans de moyenne"],
  diplomatico: ["Diplomatico", "le plus de nationalités", "La liste avec le plus de nationalités différentes représentées.", v => v + " nationalités"],
  france: ["La France, et pas n'importe laquelle", "le plus de Français", "La liste avec le plus de personnalités françaises.", v => v + " Français"],
  orfevre: ["Chercheur d'or / Orfèvre", "le plus de nominés solitaires", "La liste avec le plus de personnalités nommées par elle seule (2 points chacune).", v => v + " nominés solitaires"],
  "captain-obvious": ["Captain obvious", "le plus de nominés multiples", "La liste avec le plus de personnalités nommées dans plus de deux listes (1 point chacune).", v => v + " nominés multiples"],
  "we-can-do-it": ["We can do it !", "le plus de femmes", "La liste avec le plus de femmes nommées.", v => v + (v > 1 ? " femmes" : " femme")],
};
const RECORDS = {
  "serial-faucheur": ["Serial faucheur", "le plus d'éditions gagnées de suite", "Le joueur qui a remporté le plus d'éditions consécutives (2018 et 2020 se suivent : pas d'édition 2019).", v => v + (v > 1 ? " éditions de suite" : " édition")],
  "maitre-de-la-mort": ["Le maître de la mort", "le plus d'éditions gagnées", "Le joueur qui a remporté le plus d'éditions.", v => v + (v > 1 ? " victoires" : " victoire")],
  "one-shot": ["One shot, one kill", "meilleur taux de réussite sur une édition", "Décès de la liste divisés par le nombre de noms de la liste, sur une seule édition.", v => nb(v * 100) + " %"],
  hitman: ["Hitman", "le plus de points sur une édition", "Le plus grand nombre de points marqués par un joueur sur une seule édition.", v => pts(v)],
  poulidor: ["Le Poulidor d'or", "meilleur score d'une 2e place", "Le meilleur score obtenu par un joueur classé deuxième.", v => pts(v)],
  "oeil-du-tigre": ["L'œil du tigre", "meilleur score d'une 3e place", "Le meilleur score obtenu par un joueur classé troisième.", v => pts(v)],
  "derniere-minute": ["Dernière minute", "décès le plus tardif", "La personnalité morte le plus tard dans l'année (jour et mois), toutes éditions confondues.", null],
  "tombeau-ouvert": ["À tombeau ouvert", "décès le plus rapide", "La personnalité morte le plus tôt dans l'année (jour et mois), toutes éditions confondues.", null],
  "youth-the-force": ["Youth the force", "liste gagnante la plus jeune", "La liste gagnante avec la moyenne d'âge la plus basse.", v => nb(v) + " ans de moyenne"],
  "strict-minimum": ["Strict minimum", "victoire avec le moins de points", "L'édition gagnée avec le moins de points.", v => pts(v)],
  "dream-team": ["Dream team", "meilleure performance d'équipe (ratio)", "Tous les joueurs d'une année ensemble : décès divisés par le nombre total de noms nommés. Années terminées seulement.", v => nb(v * 100) + " %"],
  "pas-de-quartier": ["Pas de quartier", "meilleure performance d'équipe (points)", "Tous les joueurs d'une année ensemble : le total de points le plus élevé. Années terminées seulement.", v => pts(v)],
};

// Identifiants dont l'icône existe dans page\images\ (à compléter quand Quentin livre les dessins).
const ICONES_HALL = new Set([]);
function carteHall(meta, id, corps, suite, libre) {
  const [jeu, detail, info] = meta[id];
  return `<div class="hall-carte${libre ? " libre" : ""}">
    ${ICONES_HALL.has(id) ? `<div class="ico"><img src="images/tr_${id}.webp" alt="" height="64" loading="lazy"></div>` : ""}
    <h3>${titre(jeu, detail, info)}</h3>${corps}${suite ? `<div class="suite">${suite}</div>` : ""}</div>`;
}

function blocTrophees(annee, dateLimite, enCours) {
  const T = M.trophees(D, annee, dateLimite);
  const cartes = T.map(t => {
    const fmt = TROPHEES[t.id][3];
    if (!t.gagnants.length) return carteHall(TROPHEES, t.id, `<div class="qui">Personne pour l'instant</div>`, "", true);
    const g0 = t.gagnants[0];
    const val = fmt ? fmt(g0.valeur) : g0.detail.replace(/\d{4}-\d{2}-\d{2}/, dateFr);
    const suivants = fmt ? t.classement.slice(t.gagnants.length, t.gagnants.length + 3).map(x => `${esc(x.joueur)} (${fmt(x.valeur)})`).join(" · ") : "";
    return carteHall(TROPHEES, t.id, `<div class="qui">${t.gagnants.map(g => esc(g.joueur)).join(", ")}${t.gagnants.length > 1 ? " <small>(ex aequo)</small>" : ""}</div>
      <div class="val">${esc(val)}</div>`, suivants ? "Ensuite : " + suivants : "");
  }).join("");
  return `<div class="hall">${cartes}</div>`;
}

let archiveTrophees = null;
function vueHall() {
  const eds = D.editions.filter(e => e.personnalites && e.annee < ANNEE).map(e => e.annee).sort((a, b) => b - a);
  return `<section class="carte" data-sec="h-trophees">
      <h2>${titre("Les trophées", `année ${ANNEE}, remis en jeu chaque année`,
        "Les trophées de l'année en cours. Ils changent de main au fil des décès et seront remis à zéro à chaque nouvelle année.")}</h2>
      ${blocTrophees(ANNEE, AUJ)}
    </section>
    <section class="carte" data-sec="h-records">
      <h2>${titre("Les records", "toutes éditions confondues",
        "Records de toutes les éditions terminées. L'année en cours n'y entre qu'une fois finie, sauf les deux records de date (décès le plus tardif et le plus rapide).")}</h2>
      <div class="hall">${blocRecords()}</div>
    </section>
    ${eds.length ? `<section class="carte" data-sec="h-archives-trophees" id="bloc-arch-trophees"></section>` : ""}`;
}

function blocRecords() {
  return M.records(D, H, AUJ).map(r => {
    const meta = RECORDS[r.id], fmt = meta[3];
    if (!r.gagnants.length) return carteHall(RECORDS, r.id, `<div class="qui">Pas encore de record</div>`, "", true);
    const lignes = r.dates
      ? r.gagnants.map(g => `<div class="qui" style="font-size:15px">${esc(g.nom)}</div><div class="val">${dateFr(g.date)} · ${g.joueurs.map(esc).join(", ")}</div>`).join("")
      : r.gagnants.map(g => `<div class="qui">${g.joueur === String(g.annee) ? "Année " + g.annee : esc(g.joueur) + (g.annee ? ` <small>${g.annee}</small>` : "")}</div>
          <div class="val">${fmt(g.valeur)}${g.detail ? " · " + esc(g.detail) : ""}</div>`).join("");
    return carteHall(RECORDS, r.id, lignes, "");
  }).join("");
}

// Archives des trophées : les années terminées, à partir de 2026 (visible dès que 2027 commence).
function blocArchivesTrophees() {
  const sec = document.getElementById("bloc-arch-trophees"); if (!sec) return;
  const eds = D.editions.filter(e => e.personnalites && e.annee < ANNEE).map(e => e.annee).sort((a, b) => b - a);
  if (!eds.includes(Number(archiveTrophees))) archiveTrophees = eds[0];
  sec.innerHTML = `<h2>${titre("Les archives des trophées", "année par année", "Les trophées de chaque année terminée, tels qu'ils étaient au 31 décembre.")}</h2>
    <div class="barre">${puces("p-arch-tr", eds.map(a => [a, String(a)]), archiveTrophees)}</div>
    ${blocTrophees(Number(archiveTrophees), archiveTrophees + "-12-31")}`;
  brancherPuces("p-arch-tr", v => { archiveTrophees = v; blocArchivesTrophees(); appliquerReplis(); });
}

// ───────────── onglet « Archives » : les trois rubriques d'histoire, déplacées telles quelles ─────────────

function vueArchives() {
  return `<section class="carte" id="bloc-histo" data-sec="histo"></section>
  <section class="carte" id="bloc-global" data-sec="global"></section>
  <section class="carte" id="bloc-taux" data-sec="taux"></section>`;
}

function blocHistorique(annee) {
  const et = H.find(e => e.annee === Number(annee));
  const maxP = Math.max(...et.principal.map(l => l.points)) || 1;
  document.getElementById("bloc-histo").innerHTML = `
    <h2>${titre("Les archives du cimetière", "classements année par année",
      "Classement et tableau de chasse de chaque année. Les règles ont changé selon les époques (rappel sous les boutons). Pas d'édition en 2019.")}</h2>
    <div class="barre">${puces("p-histo", H.map(e => [e.annee, e.annee + (e.enCours ? " (en cours)" : "")]), annee)}</div>
    <p class="sous">${esc(descEpoque(D.epoques.find(e => e.id === et.epoque)))}</p>
    <div class="grille">
      <div class="sous-bloc"><h3>Classement des fossoyeurs <small class="glose">(points)</small></h3>${podium(et.principal, l => pts(l.points))}
        <table><thead><tr><th class="centre">Rang</th><th>Joueur</th><th>Points</th><th class="num">Décès</th></tr></thead>
        <tbody>${et.principal.map(l => `<tr><td class="rang">${l.rang}</td><td>${esc(l.nom)}</td><td>${barre(l.points, maxP)}</td><td class="num">${l.deces}</td></tr>`).join("")}</tbody></table></div>
      <div class="sous-bloc"><h3>Tableau de chasse <small class="glose">(nombre de décès)</small></h3>${podium(et.annexe, l => l.deces + " décès")}
        <table><thead><tr><th class="centre">Rang</th><th>Joueur</th><th class="num">Décès</th></tr></thead>
        <tbody>${et.annexe.map(l => `<tr><td class="rang">${l.rang}</td><td>${esc(l.nom)}</td><td class="num">${l.deces}</td></tr>`).join("")}</tbody></table></div>
    </div>`;
  brancherPuces("p-histo", blocHistorique);
}

function blocGlobal() {
  const g = M.classementGlobal(H);
  const maxP = g[0].points;
  document.getElementById("bloc-global").innerHTML = `
    <h2>${titre("Le grand ossuaire", "total de toutes les années, année en cours comprise",
      "Les points ne se comparent pas d'une époque à l'autre (barèmes et longueur des listes différents) : ce total additionne des choses différentes. Victoires et podiums : années terminées seulement.")}</h2>
    <div class="defil"><table>
      <thead><tr><th class="centre">Rang</th><th>Joueur</th><th>Points</th><th class="num">Participations</th><th class="num">Décès</th><th class="num">Victoires</th><th class="num">Podiums</th></tr></thead>
      <tbody>${g.map(c => `<tr><td class="rang">${c.rang}</td><td>${esc(c.joueur)}</td><td>${barre(c.points, maxP)}</td>
        <td class="num">${c.participations}</td><td class="num">${c.deces}</td><td class="num">${c.victoires}</td><td class="num">${c.podiums}</td></tr>`).join("")}</tbody>
    </table></div>
`;
}

let tauxEpoque = "epoque2", tauxCle = "tauxPoints";
function blocTaux() {
  const ep = D.epoques.find(e => e.id === tauxEpoque);
  const etats = H.filter(e => ep.annees.includes(e.annee));
  const t = M.classementTaux(etats, tauxCle);
  const max = Math.max(...t.map(c => c[tauxCle])) || 1;
  document.getElementById("bloc-taux").innerHTML = `
    <h2>${titre("Le flair du charognard", "taux de réussite par époque",
      `Points (ou décès) divisés par le nombre d'années jouées, époque par époque, car les règles changent d'une époque à l'autre. Pas de minimum de participations : un taux sur une ou deux années dépend beaucoup de l'année jouée.${etats.some(e => e.enCours) ? " L'année en cours est comptée." : ""}`)}</h2>
    <div class="barre">${puces("p-epoque", D.epoques.map(e => [e.id, e.libelle]), tauxEpoque)}
      ${puces("p-cle", [["tauxPoints", "Points par participation"], ["tauxDeces", "Décès par participation"]], tauxCle)}</div>
    <p class="sous">${esc(descEpoque(ep))}</p>
    <div class="defil"><table>
      <thead><tr><th class="centre">Rang</th><th>Joueur</th><th>${tauxCle === "tauxPoints" ? "Points" : "Décès"} par participation</th><th class="num">Participations</th></tr></thead>
      <tbody>${t.map(c => `<tr><td class="rang">${c.rang}</td><td>${esc(c.joueur)}</td><td>${barre(c[tauxCle], max)}</td><td class="num">${c.participations}</td></tr>`).join("")}</tbody>
    </table></div>
`;
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
  <section class="carte" data-sec="j-parcours"><h2>${titre("Carrière funèbre", `${esc(j)}, toutes ses années`,
    "Rang, points et décès de chaque année jouée. Rang annexe : rang au tableau de chasse (nombre de décès). Un badge signale une année jouée en liste commune.")}</h2><div class="defil"><table>
    <thead><tr><th>Année</th><th class="num">Rang</th><th class="num">Points</th><th class="num">Décès</th><th class="num">Rang annexe</th></tr></thead>
    <tbody>${parcours.map(p => `<tr><td>${p.annee}${p.enCours ? " (en cours)" : ""}${p.nom !== j ? ` <span class="badge neutre">${esc(p.nom)}</span>` : ""}</td>
      <td class="num">${p.rang} / ${p.participants}</td><td class="num">${nb(p.points)}</td><td class="num">${p.deces}</td><td class="num">${p.rangAnnexe}</td></tr>`).join("")}</tbody>
  </table></div></section>`;

  if (M.aJoueDeuxAnneesDeSuite(H, j)) {
    html += `<section class="carte" data-sec="j-rang"><h2>${titre("Rang dans l'au-delà", `${esc(j)}, année par année`,
      "Le rang se compare mieux que les points d'une époque à l'autre. Années sans édition ou non jouées : absentes.")}</h2>
      ${courbe(parcours.map(p => ({ x: String(p.annee), y: p.rang, info: `<b>${p.annee}</b> : ${p.rang}${p.rang === 1 ? "er" : "e"} sur ${p.participants}, ${pts(p.points)}` })), { inverse: true, yMin: 1, entier: true })}</section>`;
  } else {
    html += `<section class="bandeau info">La courbe d'évolution apparaît quand un joueur a joué deux années de suite.</section>`;
  }

  if (courant) {
    const ev = EV.joueurs[j];
    html += `<section class="carte" data-sec="j-points"><h2>${titre("Récolte moribonde", `${esc(j)} ${ANNEE}, fin de chaque mois`,
      "Points cumulés à la fin de chaque mois ; le mois en cours compte jusqu'à aujourd'hui. Survoler un point pour le détail.")}</h2>
      ${courbe(EV.mois.map((m, i) => ({ x: MOIS[m.mois - 1], y: ev.points[i], info: `<b>fin ${MOIS[m.mois - 1]}</b> : ${pts(ev.points[i])}, ${ev.rangs[i]}${ev.rangs[i] === 1 ? "er" : "e"}` })), { yMin: 0 })}
    </section>`;
    const et = H.find(e => e.annee === ANNEE);
    const ligne = et.principal.find(l => l.joueur === j);
    const ed = D.editions.find(e => e.annee === ANNEE);
    const perso = ed.personnalites;
    const nomin = {}; ed.participants.forEach(p => p.liste.forEach(id => { nomin[id] = (nomin[id] || 0) + 1; }));
    const liste = ed.participants.find(p => p.joueurs[0] === j).liste;
    const morts = M.decesDeLAnnee(D, ANNEE, AUJ);
    html += `<section class="carte" data-sec="j-liste"><h2>${titre("Liste noire", `${esc(j)} ${ANNEE}`,
      "Les personnalités nommées, barrées quand elles sont mortes. Âge : au 1er janvier. Listes : nombre de joueurs qui ont nommé la personne ; la valeur (points si elle meurt) en dépend.")}</h2><div class="defil"><table>
      <thead><tr><th>Personnalité</th><th>Pays</th><th class="num">Âge</th><th class="num">Listes</th><th class="num">Valeur</th><th>Décès</th></tr></thead>
      <tbody>${liste.map(id => { const p = perso[id], mort = morts[id] && morts[id].date;
        return `<tr><td class="${mort ? "mort" : ""}">${esc(p.nom)}</td><td>${esc(p.pays || "")}</td><td class="num">${p.age != null ? p.age : ""}</td>
          <td class="num">${nomin[id]}</td><td class="num">${nb(M.bareme(et.epoque, nomin[id]))}</td><td>${mort ? "☠ " + dateFr(mort) : ""}</td></tr>`; }).join("")}</tbody>
    </table></div><p class="sous">${ligne.deces} décès, ${pts(ligne.points)}. « Listes » : nombre de joueurs qui ont nommé la personne ; la valeur en dépend.</p></section>`;
  }
  html += `<section class="carte" id="bloc-arch-listes" data-sec="j-archives"></section>`;
  document.getElementById("fiche").innerHTML = html;
  blocArchivesListes();
  appliquerReplis();
}

// Archives des listes personnelles : la liste de chaque année passée, avec les décès annoncés dans l'année
// (pas de date : seulement mort ou pas). Demande de Gaël, 21/11/2026.
let archiveAnnee = null;
function blocArchivesListes() {
  const j = joueurChoisi;
  const annees = D.editions.filter(e => e.participants.some(p => p.joueurs[0] === j && p.liste_archive)).map(e => e.annee).sort((a, b) => b - a);
  const sec = document.getElementById("bloc-arch-listes");
  if (!annees.length) { sec.style.display = "none"; return; }
  sec.style.display = "";
  if (!annees.includes(Number(archiveAnnee))) archiveAnnee = annees[0];
  const e = D.editions.find(x => x.annee === Number(archiveAnnee));
  const p = e.participants.find(x => x.joueurs[0] === j);
  const liste = p.liste_archive, morts = liste.filter(x => x.mort).length;
  const ages = liste.map(x => x.age), moy = ages.reduce((s, a) => s + a, 0) / ages.length;
  const avecPays = liste.some(x => x.pays);
  const ep = D.epoques.find(x => x.id === e.epoque);
  sec.innerHTML = `<h2>${titre("Les anciennes listes noires", `${esc(j)}, année par année`,
    "La liste personnelle de chaque année passée, barrée quand la personne est morte dans l'année. Seuls comptent les décès annoncés dans l'année (pas de date). Âge : celui indiqué dans la liste de l'année.")}</h2>
    <div class="barre">${puces("p-arch", annees.map(a => [a, String(a)]), archiveAnnee)}</div>
    <p class="sous">${esc(ep.libelle)}${p.liste_commune_avec ? ` · liste commune avec ${esc(p.liste_commune_avec)}` : ""}</p>
    <div class="defil"><table>
      <thead><tr><th>Personnalité</th>${avecPays ? "<th>Pays</th>" : ""}<th class="num">Âge</th><th>Décès</th></tr></thead>
      <tbody>${liste.map(x => `<tr><td class="${x.mort ? "mort" : ""}">${esc(x.nom)}</td>${avecPays ? `<td>${esc(x.pays || "")}</td>` : ""}<td class="num">${x.age}</td><td>${x.mort ? "☠ annoncé" : ""}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="sous">${e.annee} : ${morts} décès annoncé${morts > 1 ? "s" : ""} sur ${liste.length} noms, âge moyen de la liste ${nb(moy)} ans.</p>`;
  brancherPuces("p-arch", v => { archiveAnnee = v; blocArchivesListes(); appliquerReplis(); });
}

// ───────────── navigation ─────────────

function afficher() {
  const onglet = { "#joueur": "joueur", "#archives": "archives", "#hall": "hall", "#admin": "admin" }[location.hash] || "global";
  document.querySelectorAll("nav.menu a").forEach(a => a.toggleAttribute("aria-current", a.dataset.onglet === onglet));
  if (onglet === "admin") {
    document.getElementById("titre").textContent = "La morgue (administration)";
    rendreAdmin();
  } else if (onglet === "global") {
    document.getElementById("titre").textContent = "Suivi mortuaire";
    document.getElementById("contenu").innerHTML = vueGlobale();
    appliquerReplis();
  } else if (onglet === "hall") {
    document.getElementById("titre").textContent = "Hall of fame";
    document.getElementById("contenu").innerHTML = vueHall();
    blocArchivesTrophees();
    appliquerReplis();
  } else if (onglet === "archives") {
    document.getElementById("titre").textContent = "Les archives";
    document.getElementById("contenu").innerHTML = vueArchives();
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
