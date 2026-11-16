/* Onglet « Administration » : joueurs, listes de l'année et décès, saisis dans un brouillon gardé dans le navigateur.
   Les calculs sont dans moteur.js ; l'affichage commun (esc, nb, pts, dateFr, puces, installer...) dans app.js.
   Publication sur GitHub : pas encore branchée (jeton à venir). Rien n'est envoyé nulle part. */
"use strict";

const CLE_BROUILLON = "deathlist.brouillon";
const CLE_APERCU = "deathlist.apercu";
// Contraintes de liste par époque (cahier des charges) : affichées comme alertes, jamais bloquantes.
const REGLES_LISTE = {
  test2018: { noms: 12 },
  epoque1: { noms: 12, max85: 5, maxCent: 1, jeune: 55 },
  epoque2: { noms: 15, max85: 8, maxCent: 1, jeune: 65 },
};

let B = null;            // brouillon : { donnees, journal: [textes], base: empreinte de la version publiée }
let anneeAdmin = null;   // année travaillée
let joueurEdite = null;  // joueur dont la liste est ouverte
let texteEdite = "";     // texte de la liste en cours de saisie
let apercuMemoire = false;

// Identifiant d'une personnalité : même calcul que slug() de outils/construire_donnees.py (sans les corrections d'orthographe).
const slugJs = nom => nom.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/-/g, " ")
  .split(/\s+/).filter(Boolean).join("-");
const cloner = o => JSON.parse(JSON.stringify(o));
const avecListes = ed => !!ed.personnalites;
function empreinte(o) { const s = JSON.stringify(o); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); }

function lireBrouillon() {
  try { const b = JSON.parse(localStorage.getItem(CLE_BROUILLON)); if (b && b.donnees) return b; } catch (e) { /* rien de gardé */ }
  return null;
}
function brouillon() {
  if (!B) B = lireBrouillon() || { donnees: cloner(PUBLIE), journal: [], base: empreinte(PUBLIE) };
  return B;
}
function apercuActif() {
  try { return sessionStorage.getItem(CLE_APERCU) === "1"; } catch (e) { return apercuMemoire; }
}
function regler(apercu) {
  apercuMemoire = apercu;
  try { if (apercu) sessionStorage.setItem(CLE_APERCU, "1"); else sessionStorage.removeItem(CLE_APERCU); } catch (e) { /* mémoire refusée */ }
}
// Données à montrer dans les onglets de suivi : le brouillon si l'aperçu est demandé, sinon la version publiée.
function donneesAffichees() {
  const b = lireBrouillon();
  return apercuActif() && b ? b.donnees : PUBLIE;
}

// Remet les champs calculés en cohérence après chaque modification.
function normaliser(d) {
  const anneeAuj = Number(AUJ.slice(0, 4));
  d.editions.sort((a, b) => a.annee - b.annee);
  d.deces.sort((a, b) => a.date.localeCompare(b.date));
  d.editions.forEach(ed => {
    if (ed.annee >= anneeAuj) ed.en_cours = true; else delete ed.en_cours;
    const ep = d.epoques.find(e => e.id === ed.epoque);
    if (ep && !ep.annees.includes(ed.annee)) { ep.annees.push(ed.annee); ep.annees.sort(); }
    if (!avecListes(ed)) return;
    const utilises = new Set(ed.participants.flatMap(p => p.liste));
    Object.keys(ed.personnalites).forEach(id => { if (!utilises.has(id)) delete ed.personnalites[id]; });
    const et = M.etatAnnee(d, ed.annee);
    ed.participants.forEach(p => {
      const l = et.principal.find(x => x.joueur === p.joueurs[0]);
      p.points = l ? l.points : 0; p.deces = l ? l.deces : 0;
    });
  });
  d.joueurs = [...new Set([...d.joueurs, ...d.editions.flatMap(e => e.participants.map(p => p.joueurs[0]))])]
    .sort((a, b) => a.localeCompare(b, "fr"));
  d.derniere_modification = AUJ;
}

function modifier(texte, f) {
  const b = brouillon();
  f(b.donnees);
  normaliser(b.donnees);
  b.journal.push(texte);
  let garde = true;
  try { localStorage.setItem(CLE_BROUILLON, JSON.stringify(b)); } catch (e) { garde = false; }
  if (apercuActif()) installer(b.donnees);
  rendreAdmin(garde ? "" : "Le navigateur refuse de garder le brouillon : il sera perdu en fermant la page. Télécharge le fichier pour ne rien perdre.");
}

// ───────────── analyse d'une liste saisie ─────────────

// Une personne par ligne : « nom ; pays ; âge » ou colonnes collées depuis Excel (séparées par des tabulations).
function analyserListe(texte, ed, joueur) {
  const regle = REGLES_LISTE[ed.epoque] || {};
  const lignes = [], erreurs = [], alertes = [];
  texte.split(/\r?\n/).forEach((brut, i) => {
    if (!brut.trim()) return;
    const morceaux = brut.split(brut.includes("\t") ? "\t" : ";").map(s => s.trim());
    const nom = morceaux[0], pays = morceaux[1] || "", ageTxt = morceaux[2] || "";
    if (!nom) { erreurs.push(`ligne ${i + 1} : pas de nom`); return; }
    let age = null;
    if (ageTxt) { if (/^\d{1,3}$/.test(ageTxt)) age = Number(ageTxt); else alertes.push(`${nom} : âge illisible (« ${ageTxt} »)`); }
    const id = slugJs(nom);
    if (!id) { erreurs.push(`ligne ${i + 1} : nom illisible`); return; }
    const deja = ed.personnalites[id];
    const autres = ed.participants.filter(p => p.joueurs[0] !== joueur && p.liste.includes(id)).map(p => p.joueurs[0]);
    lignes.push({ nom, pays: pays.toUpperCase(), age, id, autres });
    const mort = brouillon().donnees.deces.find(x => x.id === id && x.date.slice(0, 4) < String(ed.annee));
    if (mort) alertes.push(`${nom} est mort(e) le ${dateFr(mort.date)} (homonyme ?)`);
    if (deja && autres.length && age != null && deja.age != null && deja.age !== age)
      alertes.push(`${nom} : âge ${deja.age} dans la liste de ${autres.join(", ")} ; enregistrer met ${age} pour tout le monde`);
  });
  const vus = {};
  lignes.forEach(l => { if (vus[l.id]) erreurs.push(`${l.nom} est deux fois dans la liste`); vus[l.id] = true; });
  if (regle.noms && lignes.length !== regle.noms) alertes.push(`${lignes.length} nom(s) pour ${regle.noms} attendus`);
  const ages = lignes.filter(l => l.age != null).map(l => l.age);
  if (ages.length < lignes.length) alertes.push(`${lignes.length - ages.length} personne(s) sans âge : la moyenne d'âge (départage) sera incomplète`);
  if (regle.max85 != null && ages.filter(a => a >= 85).length > regle.max85) alertes.push(`${ages.filter(a => a >= 85).length} personnes de 85 ans et plus (${regle.max85} au plus)`);
  if (regle.maxCent != null && ages.filter(a => a >= 100).length > regle.maxCent) alertes.push(`${ages.filter(a => a >= 100).length} centenaires (${regle.maxCent} au plus)`);
  if (regle.jeune != null && ages.length && !ages.some(a => a < regle.jeune)) alertes.push(`personne de moins de ${regle.jeune} ans (au moins une demandée)`);
  return { lignes, erreurs, alertes };
}

function htmlAnalyse(a, ed) {
  const n = {}; ed.participants.forEach(p => { if (p.joueurs[0] !== joueurEdite) p.liste.forEach(id => { n[id] = (n[id] || 0) + 1; }); });
  const ages = a.lignes.filter(l => l.age != null).map(l => l.age);
  return `${a.erreurs.length ? `<div class="bandeau att"><b>À corriger avant d'enregistrer :</b> ${a.erreurs.map(esc).join(" ; ")}</div>` : ""}
    ${a.alertes.length ? `<div class="bandeau info"><b>À vérifier :</b> ${a.alertes.map(esc).join(" ; ")}</div>` : ""}
    <div class="defil"><table>
      <thead><tr><th class="num">#</th><th>Personnalité</th><th>Pays</th><th class="num">Âge</th><th>Aussi nommée par</th><th class="num">Valeur si décès</th></tr></thead>
      <tbody>${a.lignes.map((l, i) => `<tr><td class="num">${i + 1}</td><td>${esc(l.nom)}</td><td>${esc(l.pays)}</td><td class="num">${l.age != null ? l.age : ""}</td>
        <td>${l.autres.map(esc).join(", ")}</td><td class="num">${nb(M.bareme(ed.epoque, (n[l.id] || 0) + 1))}</td></tr>`).join("") ||
        `<tr><td colspan="6" class="vide">Aucun nom pour l'instant.</td></tr>`}</tbody>
    </table></div>
    <p class="sous">${a.lignes.length} nom(s)${ages.length ? `, âge moyen ${nb(ages.reduce((s, x) => s + x, 0) / ages.length)}` : ""}. La valeur dépend aussi des listes des autres joueurs : elle bouge quand on les saisit.</p>`;
}

// ───────────── affichage ─────────────

function vueAdmin() {
  const b = brouillon(), d = b.donnees;
  const annees = d.editions.filter(avecListes).map(e => e.annee);
  if (!annees.includes(anneeAdmin)) anneeAdmin = annees.includes(ANNEE) ? ANNEE : annees[annees.length - 1];
  const ed = d.editions.find(e => e.annee === anneeAdmin);
  const garde = !!lireBrouillon();
  const baseChangee = garde && b.base !== empreinte(PUBLIE);
  const nbModifs = b.journal.length;

  return `
  <section class="bandeau info"><b>Mode essai.</b> Tout ce que tu saisis ici reste dans ce navigateur : rien n'est envoyé, la page des joueurs ne change pas. La publication sera branchée plus tard.</section>
  <div id="a-message"></div>

  <section class="carte" data-sec="a-etat">
    <h2>Brouillon${nbModifs ? ` (${nbModifs} modification${nbModifs > 1 ? "s" : ""} non publiée${nbModifs > 1 ? "s" : ""})` : ""}</h2>
    ${nbModifs ? `<ol class="journal">${b.journal.map(t => `<li>${esc(t)}</li>`).join("")}</ol>` : `<p>Aucune modification : le brouillon est identique à la version publiée.</p>`}
    ${baseChangee ? `<div class="bandeau att">La version publiée a changé depuis le début de ce brouillon. Publier ce brouillon écraserait ces changements.</div>` : ""}
    <label class="case"><input type="checkbox" data-act="apercu"${apercuActif() ? " checked" : ""}${nbModifs ? "" : " disabled"}> Voir les onglets de suivi avec mes modifications (aperçu)</label>
    <div class="barre boutons">
      <button type="button" class="principal" disabled title="Pas encore branché : il faut d'abord installer le jeton">Publier</button>
      <button type="button" data-act="telecharger">Télécharger le fichier de données</button>
      <button type="button" data-act="abandonner"${nbModifs ? "" : " disabled"}>Abandonner mes modifications</button>
    </div>
    <p class="sous">Publier : bientôt. Ce bouton mettra la page à jour pour tout le monde (visible au bout de 1 à 2 minutes), avec un bouton pour annuler la dernière publication. Télécharger : une copie du fichier avec tes modifications, à garder ou à envoyer.</p>
    <h3>Listes ${anneeAdmin} par tableur Excel</h3>
    <div class="barre boutons">
      <button type="button" data-act="modele-tableur">Télécharger le tableur à remplir (${anneeAdmin})</button>
      <button type="button" data-act="importer-tableur">Importer le tableur rempli</button>
      <input type="file" id="a-fichier-tableur" accept=".xlsx,.csv" hidden>
    </div>
    <p class="sous">Le tableur contient déjà les joueurs inscrits en ${anneeAdmin} (${REGLES_LISTE[ed.epoque] && REGLES_LISTE[ed.epoque].noms || 15} lignes chacun) et ce qui est déjà saisi. Remplis les colonnes Personnalité, Pays et Âge sans toucher aux titres, enregistre, puis importe-le ici : les listes de tous les joueurs du fichier sont mises à jour d'un coup. Un nouveau joueur : écris son prénom dans la colonne Joueur. L'année se choisit plus bas.</p>
  </section>

  <section class="carte" data-sec="a-annee">
    <h2>Année</h2>
    <div class="barre">${puces("p-annee-admin", annees.map(a => [a, String(a)]), anneeAdmin)}
      <button type="button" data-act="nouvelle-annee">+ Nouvelle année ${Math.max(...d.editions.map(e => e.annee)) + 1}</button></div>
    <p class="sous">${esc((d.epoques.find(e => e.id === ed.epoque) || {}).libelle || ed.epoque)} : ${esc((d.epoques.find(e => e.id === ed.epoque) || {}).bareme || "")}.</p>
  </section>

  ${blocDecesAdmin(d, ed)}
  ${blocListesAdmin(d, ed)}`;
}

function blocDecesAdmin(d, ed) {
  const a = ed.annee, nomin = M.nominations(ed);
  const morts = d.deces.filter(x => x.date.startsWith(String(a)));
  const dejaMorts = new Set(d.deces.map(x => x.id));
  const vivants = Object.entries(ed.personnalites).filter(([id]) => !dejaMorts.has(id))
    .map(([, p]) => p.nom).sort((x, y) => x.localeCompare(y, "fr"));
  const parDefaut = AUJ.startsWith(String(a)) ? AUJ : "";
  return `<section class="carte" data-sec="a-deces">
    <h2>Déclarer un décès (${a})</h2>
    ${Object.keys(ed.personnalites).length ? `<form data-form="deces" class="formulaire" autocomplete="off">
      <label>Personnalité <input name="nom" list="dl-vivants" required placeholder="taper quelques lettres"></label>
      <datalist id="dl-vivants">${vivants.map(n => `<option value="${esc(n)}">`).join("")}</datalist>
      <label>Date du décès <input type="date" name="date" min="${a}-01-01" max="${a}-12-31" value="${parDefaut}" required></label>
      <label class="large">Source (lien, facultatif) <input type="url" name="source" placeholder="https://fr.wikipedia.org/wiki/..."></label>
      <button type="submit" class="principal">Ajouter le décès</button>
    </form>
    <p class="sous" id="a-deces-info">Choisis une personne parmi les ${vivants.length} nommées encore en vie : la page dit qui l'avait nommée et ce que ça rapporte.</p>`
      : `<p>Aucune liste saisie pour ${a} : saisis d'abord les listes des joueurs (plus bas).</p>`}
    <div class="defil"><table>
      <thead><tr><th class="num">Date</th><th>Personnalité</th><th>Nommée par</th><th class="num">Valeur</th><th></th></tr></thead>
      <tbody>${morts.slice().reverse().map(x => {
        const qui = ed.participants.filter(p => p.liste.includes(x.id)).map(p => p.joueurs[0]);
        return `<tr><td class="num">${dateFr(x.date)}</td><td>${esc(x.nom)}${x.source ? ` <a href="${esc(x.source)}" target="_blank" rel="noopener">source</a>` : ""}</td>
          <td>${qui.length ? qui.map(esc).join(", ") : `<span class="badge alerte">plus dans aucune liste</span>`}</td>
          <td class="num">${qui.length ? pts(M.bareme(ed.epoque, nomin[x.id])) : ""}</td>
          <td><button type="button" class="petit" data-act="retirer-deces" data-id="${esc(x.id)}">Retirer</button></td></tr>`; }).join("") ||
        `<tr><td colspan="5" class="vide">Aucun décès en ${a}.</td></tr>`}</tbody>
    </table></div>
  </section>`;
}

function blocListesAdmin(d, ed) {
  const a = ed.annee, regle = REGLES_LISTE[ed.epoque] || {};
  const et = M.etatAnnee(d, a);
  const inscrits = new Set(ed.participants.map(p => p.joueurs[0]));
  const autres = d.joueurs.filter(j => !inscrits.has(j));
  const prec = d.editions.filter(e => e.annee < a && e.participants.length).pop();
  const lignes = ed.participants.slice().sort((x, y) => x.joueurs[0].localeCompare(y.joueurs[0], "fr")).map(p => {
    const j = p.joueurs[0], l = et.principal.find(x => x.joueur === j);
    const ok = !regle.noms || p.liste.length === regle.noms;
    return `<tr${j === joueurEdite ? ' class="choisi"' : ""}><td>${esc(j)}</td>
      <td class="num">${p.liste.length}${regle.noms ? " / " + regle.noms : ""} ${ok ? "" : `<span class="badge alerte">incomplète</span>`}</td>
      <td class="num">${l && l.ageMoyen != null ? nb(l.ageMoyen) : ""}</td><td class="num">${l ? nb(l.points) : 0}</td>
      <td class="actions"><button type="button" class="petit" data-act="ouvrir-liste" data-j="${esc(j)}">${p.liste.length ? "Modifier la liste" : "Saisir la liste"}</button>
        <button type="button" class="petit" data-act="retirer-joueur" data-j="${esc(j)}">Retirer</button></td></tr>`;
  }).join("");

  let editeur = "";
  if (joueurEdite && inscrits.has(joueurEdite)) {
    editeur = `<div class="editeur" id="editeur">
      <h3>Liste ${a} de ${esc(joueurEdite)}</h3>
      <p class="sous">Une personne par ligne : <b>nom ; pays ; âge au 1er janvier ${a}</b>. On peut aussi coller trois colonnes copiées depuis Excel.</p>
      <textarea id="a-texte-liste" rows="16" spellcheck="false" placeholder="Edgar Morin ; FRA ; 104">${esc(texteEdite)}</textarea>
      <div id="a-analyse">${htmlAnalyse(analyserListe(texteEdite, ed, joueurEdite), ed)}</div>
      <div class="barre boutons"><button type="button" class="principal" data-act="enregistrer-liste">Enregistrer la liste</button>
        <button type="button" data-act="fermer-liste">Fermer sans enregistrer</button></div>
    </div>`;
  }

  return `<section class="carte" data-sec="a-listes">
    <h2>Joueurs et listes ${a} (${ed.participants.length} joueur${ed.participants.length > 1 ? "s" : ""})</h2>
    ${ed.participants.length ? `<div class="defil"><table>
      <thead><tr><th>Joueur</th><th class="num">Noms</th><th class="num">Âge moy.</th><th class="num">Points</th><th></th></tr></thead>
      <tbody>${lignes}</tbody></table></div>` : `<p>Personne n'est encore inscrit pour ${a}.</p>`}
    ${!ed.participants.length && prec ? `<p><button type="button" data-act="reprendre" data-a="${prec.annee}">Inscrire les ${prec.participants.length} joueurs de ${prec.annee}</button></p>` : ""}
    <form data-form="joueur" class="formulaire" autocomplete="off">
      <label>Ajouter un joueur <input name="nom" list="dl-joueurs" required placeholder="prénom (ancien ou nouveau)"></label>
      <datalist id="dl-joueurs">${autres.map(j => `<option value="${esc(j)}">`).join("")}</datalist>
      <button type="submit">Ajouter</button>
    </form>
    ${editeur}
  </section>`;
}

function rendreAdmin(message) {
  if (location.hash !== "#admin") return;
  const y = window.scrollY;
  document.getElementById("contenu").innerHTML = vueAdmin();
  appliquerReplis();
  brancherPuces("p-annee-admin", v => { anneeAdmin = Number(v); joueurEdite = null; rendreAdmin(); });
  if (message) document.getElementById("a-message").innerHTML = `<section class="bandeau att">${esc(message)}</section>`;
  window.scrollTo(0, y);
}

// ───────────── actions ─────────────

function edB(d) { return d.editions.find(e => e.annee === anneeAdmin); }

function texteDeListe(ed, p) {
  return p.liste.map(id => { const x = ed.personnalites[id] || { nom: id };
    return [x.nom, x.pays || "", x.age != null ? x.age : ""].join(" ; "); }).join("\n");
}

const ACTIONS = {
  "nouvelle-annee"() {
    const d = brouillon().donnees, a = Math.max(...d.editions.map(e => e.annee)) + 1;
    const derniere = d.editions[d.editions.length - 1];
    if (!confirm(`Créer l'année ${a} (mêmes règles que ${derniere.annee}) ?`)) return;
    modifier(`Année ${a} créée`, dd => dd.editions.push({ annee: a, epoque: derniere.epoque,
      source_points: "listes et décès saisis par l'administrateur", participants: [], personnalites: {} }));
    anneeAdmin = a; joueurEdite = null; rendreAdmin();
  },
  reprendre(el) {
    const de = Number(el.dataset.a);
    modifier(`${anneeAdmin} : joueurs de ${de} inscrits`, dd => {
      const src = dd.editions.find(e => e.annee === de);
      edB(dd).participants = src.participants.map(p => ({ joueurs: [p.joueurs[0]], points: 0, deces: 0, liste: [] }));
    });
  },
  "ouvrir-liste"(el) {
    const ed = edB(brouillon().donnees), p = ed.participants.find(x => x.joueurs[0] === el.dataset.j);
    joueurEdite = el.dataset.j; texteEdite = texteDeListe(ed, p);
    rendreAdmin();
    document.getElementById("editeur").scrollIntoView({ behavior: "smooth", block: "start" });
  },
  "fermer-liste"() {
    joueurEdite = null; rendreAdmin();
  },
  "enregistrer-liste"() {
    const ed = edB(brouillon().donnees), an = analyserListe(texteEdite, ed, joueurEdite);
    if (an.erreurs.length) { alert("À corriger d'abord : " + an.erreurs.join(" ; ")); return; }
    const j = joueurEdite;
    joueurEdite = null;
    modifier(`${anneeAdmin} : liste de ${j} enregistrée (${an.lignes.length} noms)`, dd => {
      const e = edB(dd), p = e.participants.find(x => x.joueurs[0] === j);
      p.liste = an.lignes.map(l => l.id);
      an.lignes.forEach(l => {
        const avant = e.personnalites[l.id] || {};
        e.personnalites[l.id] = { nom: l.nom, pays: l.pays || avant.pays || null, age: l.age != null ? l.age : (avant.age != null ? avant.age : null) };
      });
    });
  },
  "retirer-joueur"(el) {
    const j = el.dataset.j;
    if (!confirm(`Retirer ${j} de ${anneeAdmin} ? Sa liste ${anneeAdmin} sera effacée du brouillon.`)) return;
    if (joueurEdite === j) joueurEdite = null;
    modifier(`${anneeAdmin} : ${j} retiré`, dd => { const e = edB(dd); e.participants = e.participants.filter(p => p.joueurs[0] !== j); });
  },
  "retirer-deces"(el) {
    const d = brouillon().donnees, x = d.deces.find(z => z.id === el.dataset.id);
    if (!x || !confirm(`Retirer le décès de ${x.nom} (${dateFr(x.date)}) ? Les points seront recalculés.`)) return;
    modifier(`Décès retiré : ${x.nom}`, dd => { dd.deces = dd.deces.filter(z => z.id !== x.id); });
  },
  telecharger() {
    const d = cloner(brouillon().donnees);
    normaliser(d);
    telechargerBlob(new Blob([JSON.stringify(d, null, 1)], { type: "application/json" }), "deathlist.json");
  },
  "modele-tableur"() {
    const ed = edB(brouillon().donnees), a = ed.annee, n = (REGLES_LISTE[ed.epoque] || {}).noms || 15;
    const lignes = [
      [{ v: `Listes ${a} : une ligne par personnalité`, s: 2 }],
      [{ v: `Remplir Personnalité, Pays (FRA, USA...) et Âge au 1er janvier ${a}. Ne pas modifier la ligne des titres. Nouveau joueur : son prénom dans la colonne Joueur.`, s: 3 }],
      [{ v: "Joueur", s: 1 }, { v: "Personnalité", s: 1 }, { v: "Pays", s: 1 }, { v: `Âge au 1er janvier ${a}`, s: 1 }],
    ];
    ed.participants.slice().sort((x, y) => x.joueurs[0].localeCompare(y.joueurs[0], "fr")).forEach(p => {
      const total = Math.max(n, p.liste.length);
      for (let i = 0; i < total; i++) {
        const x = p.liste[i] ? ed.personnalites[p.liste[i]] || {} : {};
        lignes.push([{ v: p.joueurs[0] }, { v: x.nom || "", s: 4 }, { v: x.pays || "", s: 4 }, { v: x.age != null ? x.age : "", s: 4 }]);
      }
    });
    const blob = Tableur.creer({ feuille: `Listes ${a}`, lignes, largeurs: [18, 34, 10, 22], figer: 3,
      validationEntier: { plage: "D4:D3000", min: 0, max: 130, message: "Un âge en nombre entier, entre 0 et 130." } });
    telechargerBlob(blob, `listes_${a}.xlsx`);
  },
  "importer-tableur"() {
    document.getElementById("a-fichier-tableur").click();
  },
  abandonner() {
    if (!confirm("Abandonner toutes les modifications du brouillon ? On revient à la version publiée.")) return;
    try { localStorage.removeItem(CLE_BROUILLON); } catch (e) { /* rien */ }
    B = null; joueurEdite = null; regler(false); installer(PUBLIE); rendreAdmin();
  },
};

function telechargerBlob(blob, nom) {
  const url = URL.createObjectURL(blob), lien = document.createElement("a");
  lien.href = url; lien.download = nom; document.body.appendChild(lien); lien.click(); lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Relit un tableur rempli : repère la ligne des titres (Joueur, Personnalité), regroupe les lignes par joueur
// (une case Joueur vide reprend le joueur de la ligne du dessus), vérifie chaque liste, puis remplace les listes
// des joueurs présents dans le fichier. Les joueurs absents du fichier ou sans aucun nom ne sont pas touchés.
async function importerTableur(fichier) {
  let lignes;
  try { lignes = await Tableur.lire(fichier); } catch (e) { alert("Fichier illisible : " + e.message); return; }
  const norm = s => slugJs(String(s || ""));
  const iTitre = lignes.findIndex(l => l && l.some(c => norm(c) === "joueur") && l.some(c => norm(c).startsWith("personnalite")));
  if (iTitre < 0) { alert("Ligne des titres introuvable (Joueur, Personnalité, Pays, Âge). Repars du tableur téléchargé ici."); return; }
  const titres = lignes[iTitre].map(norm);
  const col = { joueur: titres.indexOf("joueur"), nom: titres.findIndex(t => t.startsWith("personnalite")),
    pays: titres.findIndex(t => t.startsWith("pays")), age: titres.findIndex(t => t.startsWith("age")) };
  const parJoueur = new Map();
  let courant = "";
  lignes.slice(iTitre + 1).forEach(l => {
    if (!l) return;
    const j = String(l[col.joueur] || "").trim().replace(/\s+/g, " ");
    if (j) courant = j;
    const nom = String(l[col.nom] || "").trim();
    if (!courant) return;
    if (!parJoueur.has(courant)) parJoueur.set(courant, []);
    if (nom) parJoueur.get(courant).push([nom, col.pays >= 0 ? String(l[col.pays] || "").trim() : "",
      col.age >= 0 ? String(l[col.age] || "").trim().replace(/[.,]0+$/, "") : ""].join("\t"));
  });
  const d = brouillon().donnees, ed = edB(d);
  const aImporter = [...parJoueur].filter(([, ls]) => ls.length);
  if (!aImporter.length) { alert("Aucune personnalité trouvée dans le tableur."); return; }
  const erreurs = [], alertes = [], nouveaux = [], resultats = [];
  aImporter.forEach(([saisi, ls]) => {
    const connu = d.joueurs.find(j => slugJs(j) === slugJs(saisi));
    const nom = connu || saisi;
    if (!connu) nouveaux.push(nom);
    const an = analyserListe(ls.join("\n"), ed, nom);
    an.erreurs.forEach(x => erreurs.push(`${nom} : ${x}`));
    an.alertes.forEach(x => alertes.push(`${nom} : ${x}`));
    resultats.push({ nom, lignes: an.lignes });
  });
  if (erreurs.length) { alert("Rien n'a été importé. À corriger dans le tableur :\n\n" + erreurs.join("\n")); return; }
  const nbNoms = resultats.reduce((s, r) => s + r.lignes.length, 0);
  const message = `Importer ${resultats.length} liste(s) ${anneeAdmin} (${nbNoms} noms) ?`
    + (nouveaux.length ? `\n\nNouveaux joueurs : ${nouveaux.join(", ")}` : "")
    + (alertes.length ? `\n\nÀ vérifier (n'empêche pas l'import) :\n${alertes.slice(0, 15).join("\n")}${alertes.length > 15 ? `\n... et ${alertes.length - 15} autre(s)` : ""}` : "")
    + "\n\nLes listes de ces joueurs seront remplacées par celles du tableur.";
  if (!confirm(message)) return;
  joueurEdite = null;
  modifier(`${anneeAdmin} : tableur importé (${resultats.length} listes, ${nbNoms} noms${nouveaux.length ? ", nouveaux : " + nouveaux.join(", ") : ""})`, dd => {
    const e = edB(dd);
    resultats.forEach(r => {
      let p = e.participants.find(x => x.joueurs[0] === r.nom);
      if (!p) { p = { joueurs: [r.nom], points: 0, deces: 0, liste: [] }; e.participants.push(p); }
      p.liste = r.lignes.map(l => l.id);
      r.lignes.forEach(l => {
        const avant = e.personnalites[l.id] || {};
        e.personnalites[l.id] = { nom: l.nom, pays: l.pays || avant.pays || null, age: l.age != null ? l.age : (avant.age != null ? avant.age : null) };
      });
    });
  });
}

function ajouterDeces(f) {
  const d = brouillon().donnees, ed = edB(d);
  const saisi = f.nom.value.trim(), date = f.date.value, source = f.source.value.trim();
  const entree = Object.entries(ed.personnalites).find(([id, p]) => p.nom === saisi || id === slugJs(saisi));
  if (!entree) { alert(`« ${saisi} » n'est dans aucune liste ${anneeAdmin}. Choisis un nom proposé par la liste déroulante.`); return; }
  const [id, p] = entree;
  if (d.deces.some(x => x.id === id)) { alert(`${p.nom} est déjà déclaré(e) mort(e).`); return; }
  if (!date.startsWith(String(anneeAdmin))) { alert(`La date doit être en ${anneeAdmin}.`); return; }
  if (date > AUJ && !confirm(`La date (${dateFr(date)}) est après aujourd'hui. Continuer ?`)) return;
  modifier(`Décès ajouté : ${p.nom} (${dateFr(date)})`, dd => dd.deces.push({ id, nom: p.nom, date,
    confiance: "déclaré par l'administrateur", source: source || null, validee_par: "administrateur, " + dateFr(AUJ) }));
}

function ajouterJoueur(f) {
  const d = brouillon().donnees, ed = edB(d);
  const saisi = f.nom.value.trim().replace(/\s+/g, " ");
  if (!saisi) return;
  const connu = d.joueurs.find(j => slugJs(j) === slugJs(saisi));
  const nom = connu || saisi;
  if (ed.participants.some(p => p.joueurs[0] === nom)) { alert(`${nom} est déjà inscrit en ${anneeAdmin}.`); return; }
  if (!connu && !confirm(`${nom} n'a jamais joué : l'ajouter comme nouveau joueur ?`)) return;
  modifier(`${anneeAdmin} : ${nom} inscrit${connu ? "" : " (nouveau joueur)"}`, dd => edB(dd).participants.push({ joueurs: [nom], points: 0, deces: 0, liste: [] }));
}

document.addEventListener("click", ev => {
  const el = ev.target.closest("[data-act]");
  if (!el || el.tagName === "INPUT" || location.hash !== "#admin") return;
  const f = ACTIONS[el.dataset.act]; if (f) f(el);
});
document.addEventListener("change", ev => {
  if (ev.target.id === "a-fichier-tableur" && ev.target.files[0]) {
    const f = ev.target.files[0]; ev.target.value = "";
    importerTableur(f);
    return;
  }
  if (ev.target.matches && ev.target.matches('input[data-act="apercu"]')) {
    regler(ev.target.checked);
    installer(donneesAffichees());
  }
});
document.addEventListener("submit", ev => {
  const f = ev.target.closest("form[data-form]"); if (!f) return;
  ev.preventDefault();
  if (f.dataset.form === "deces") ajouterDeces(f);
  if (f.dataset.form === "joueur") ajouterJoueur(f);
});
document.addEventListener("input", ev => {
  if (ev.target.id === "a-texte-liste") {
    texteEdite = ev.target.value;
    const ed = edB(brouillon().donnees);
    document.getElementById("a-analyse").innerHTML = htmlAnalyse(analyserListe(texteEdite, ed, joueurEdite), ed);
  }
  if (ev.target.closest && ev.target.closest('form[data-form="deces"]') && ev.target.name === "nom") {
    const ed = edB(brouillon().donnees), s = ev.target.value.trim();
    const e = Object.entries(ed.personnalites).find(([id, p]) => p.nom === s || id === slugJs(s));
    const info = document.getElementById("a-deces-info");
    if (!e) { info.textContent = s ? "Pas encore reconnu : continue à taper ou choisis dans la liste." : ""; return; }
    const deja = brouillon().donnees.deces.find(x => x.id === e[0]);
    if (deja) { info.textContent = `${e[1].nom} est déjà déclaré(e) mort(e) le ${dateFr(deja.date)}.`; return; }
    const qui = ed.participants.filter(p => p.liste.includes(e[0])).map(p => p.joueurs[0]);
    info.textContent = `${e[1].nom}${e[1].age != null ? ", " + e[1].age + " ans au 1er janvier" : ""} : nommée par ${qui.join(", ")} ; ${pts(M.bareme(ed.epoque, qui.length))} pour ${qui.length > 1 ? "chacun" : "ce joueur"}.`;
  }
});
