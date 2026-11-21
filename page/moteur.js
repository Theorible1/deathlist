/* Moteur de calcul de la Deathlist : points, classements, évolutions.
   Aucune dépendance. Utilisé par la page (window.Moteur) et par les tests (node tests/test_moteur.js).
   Les dates sont des chaînes "AAAA-MM-JJ" : on les compare comme du texte. */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.Moteur = fabrique();
})(this, function () {
  "use strict";

  // Points d'un décès selon l'époque et le nombre de listes qui nommaient la personne.
  function bareme(epoque, nbListes) {
    if (epoque === "test2018") return 1;
    if (epoque === "epoque1") return nbListes === 1 ? 2 : 1;
    return nbListes === 1 ? 2 : nbListes === 2 ? 1.5 : 1; // epoque2 et suivantes
  }

  function edition(donnees, annee) {
    return donnees.editions.find(function (e) { return e.annee === annee; });
  }

  function nomAffiche(p) {
    return p.liste_commune_avec ? p.joueurs[0] + " (& " + p.liste_commune_avec + ")" : p.joueurs[0];
  }

  // Classement avec rangs partagés en cas d'égalité complète (1, 2, 2, 4).
  function classer(lignes, comparer) {
    var tri = lignes.slice().sort(comparer);
    tri.forEach(function (l, i) {
      l.rang = i > 0 && comparer(tri[i - 1], l) === 0 ? tri[i - 1].rang : i + 1;
    });
    return tri;
  }

  // Règle 2026 : points, puis nombre de décès, puis moyenne d'âge de la liste la plus basse.
  function comparerPrincipal(a, b) {
    if (b.points !== a.points) return b.points - a.points;
    if (b.deces !== a.deces) return b.deces - a.deces;
    if (a.ageMoyen != null && b.ageMoyen != null && a.ageMoyen !== b.ageMoyen) return a.ageMoyen - b.ageMoyen;
    return 0;
  }

  function comparerAnnexe(a, b) {
    return b.deces - a.deces;
  }

  // État d'une année à une date donnée (incluse). Sans date : tous les décès connus.
  // Année avec listes détaillées : recalcul depuis les listes et les dates de décès.
  // Année sans listes : points et décès enregistrés.
  function etatAnnee(donnees, annee, dateLimite) {
    var ed = edition(donnees, annee);
    if (!ed) return null;
    var avecListes = ed.participants.some(function (p) { return p.liste; });
    var lignes;
    if (avecListes) {
      var nomin = nominations(ed);
      var morts = decesDeLAnnee(donnees, annee, dateLimite);
      var perso = ed.personnalites || {};
      lignes = ed.participants.map(function (p) {
        var decedes = p.liste.filter(function (id) { return morts[id]; });
        var ages = p.liste.map(function (id) { return perso[id] && perso[id].age; })
          .filter(function (a) { return typeof a === "number"; });
        return {
          joueur: p.joueurs[0], nom: nomAffiche(p),
          points: decedes.reduce(function (s, id) { return s + bareme(ed.epoque, nomin[id]); }, 0),
          deces: decedes.length,
          ageMoyen: ages.length ? ages.reduce(function (s, a) { return s + a; }, 0) / ages.length : null,
          decedes: decedes,
        };
      });
    } else {
      // Années passées : points et décès enregistrés. L'âge moyen de la liste départage à égalité depuis 2023
      // (règle introduite cette année-là, d'après Gaël) ; avant, égalité de points et de décès = ex aequo.
      lignes = ed.participants.map(function (p) {
        var ages = annee >= 2023 && p.liste_archive ? p.liste_archive.map(function (x) { return x.age; }) : [];
        return { joueur: p.joueurs[0], nom: nomAffiche(p), points: p.points, deces: p.deces,
                 ageMoyen: ages.length ? ages.reduce(function (s, a) { return s + a; }, 0) / ages.length : null };
      });
    }
    lignes.sort(function (a, b) { return a.nom.localeCompare(b.nom, "fr"); }); // ordre stable à égalité
    return {
      annee: annee, epoque: ed.epoque, enCours: !!ed.en_cours,
      principal: classer(lignes.map(copie), comparerPrincipal),
      annexe: classer(lignes.map(copie), comparerAnnexe),
    };
  }

  // Décès qui comptent pour une année : datés de cette année (et jusqu'à dateLimite si donnée), par identifiant.
  function decesDeLAnnee(donnees, annee, dateLimite) {
    var morts = {}, debut = String(annee);
    donnees.deces.forEach(function (d) {
      if (d.date.slice(0, 4) === debut && (!dateLimite || d.date <= dateLimite)) morts[d.id] = d;
    });
    return morts;
  }

  // Nombre de listes qui nomment chaque personnalité, pour une édition avec listes.
  function nominations(ed) {
    var n = {};
    ed.participants.forEach(function (p) { (p.liste || []).forEach(function (id) { n[id] = (n[id] || 0) + 1; }); });
    return n;
  }

  function copie(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }

  function finDeMois(annee, mois) {
    var j = new Date(Date.UTC(annee, mois, 0)).getUTCDate(); // mois : 1 à 12
    return annee + "-" + (mois < 10 ? "0" : "") + mois + "-" + j;
  }

  // Classement à la fin de chaque mois, de janvier jusqu'au mois de "aujourdhui" (texte AAAA-MM-JJ).
  // Le dernier mois est arrêté à "aujourdhui". Pour chaque joueur : rang par mois et écart avec le mois d'avant
  // (positif = montée).
  function evolutionMensuelle(donnees, annee, aujourdhui) {
    var dernierMois = 12;
    if (aujourdhui && Number(aujourdhui.slice(0, 4)) === annee) dernierMois = Number(aujourdhui.slice(5, 7));
    var mois = [];
    for (var m = 1; m <= dernierMois; m++) {
      var limite = m === dernierMois && aujourdhui && aujourdhui < finDeMois(annee, m) ? aujourdhui : finDeMois(annee, m);
      mois.push({ mois: m, limite: limite, classement: etatAnnee(donnees, annee, limite).principal });
    }
    var joueurs = {};
    mois.forEach(function (mo, i) {
      mo.classement.forEach(function (l) {
        var j = joueurs[l.joueur] || (joueurs[l.joueur] = { joueur: l.joueur, nom: l.nom, rangs: [], points: [], ecarts: [] });
        j.rangs.push(l.rang);
        j.points.push(l.points);
        j.ecarts.push(i === 0 ? null : joueurs[l.joueur].rangs[i - 1] - l.rang);
      });
    });
    return { mois: mois, joueurs: joueurs };
  }

  // Historique : toutes les années, chacune avec son classement final (ou actuel pour l'année en cours).
  function historique(donnees, aujourdhui) {
    return donnees.editions.map(function (e) { return etatAnnee(donnees, e.annee, e.en_cours ? aujourdhui : null); });
  }

  // Cumul par joueur sur une liste d'années (toutes, ou celles d'une époque).
  function cumul(etats) {
    var t = {};
    etats.forEach(function (et) {
      et.principal.forEach(function (l) {
        var c = t[l.joueur] || (t[l.joueur] = { joueur: l.joueur, points: 0, deces: 0, participations: 0, victoires: 0, podiums: 0 });
        c.points += l.points;
        c.deces += l.deces;
        c.participations += 1;
        if (!et.enCours && l.rang === 1) c.victoires += 1;
        if (!et.enCours && l.rang <= 3) c.podiums += 1;
      });
    });
    return Object.keys(t).map(function (k) {
      var c = t[k];
      c.tauxPoints = c.points / c.participations;
      c.tauxDeces = c.deces / c.participations;
      return c;
    });
  }

  function classementGlobal(etats) {
    return classer(cumul(etats).sort(function (a, b) { return a.joueur.localeCompare(b.joueur, "fr"); }),
      function (a, b) { return b.points - a.points || b.deces - a.deces; });
  }

  function classementTaux(etats, cle) {
    return classer(cumul(etats).sort(function (a, b) { return a.joueur.localeCompare(b.joueur, "fr"); }),
      function (a, b) { return b[cle] - a[cle]; });
  }

  // Parcours d'un joueur : une ligne par année jouée.
  function parcoursJoueur(etats, joueur) {
    return etats.map(function (et) {
      var l = et.principal.find(function (x) { return x.joueur === joueur; });
      if (!l) return null;
      var a = et.annexe.find(function (x) { return x.joueur === joueur; });
      return { annee: et.annee, epoque: et.epoque, enCours: et.enCours, nom: l.nom, points: l.points, deces: l.deces,
               rang: l.rang, rangAnnexe: a.rang, participants: et.principal.length };
    }).filter(Boolean);
  }

  // Deux éditions consécutives jouées (il n'y a pas eu d'édition 2019 : 2018 puis 2020 se suivent).
  function aJoueDeuxAnneesDeSuite(etats, joueur) {
    var joue = etats.map(function (et) { return et.principal.some(function (l) { return l.joueur === joueur; }); });
    return joue.some(function (v, i) { return v && joue[i + 1]; });
  }

  // ───────────── Hall of fame ─────────────

  // Meilleurs d'un critère : lignes triées [{joueur, valeur, detail}], meilleure valeur d'abord (sens = 1 : le plus grand
  // gagne, -1 : le plus petit). Les ex aequo gagnent ensemble. Les lignes sans valeur (null) ne comptent pas.
  function meilleurs(lignes, sens) {
    var l = lignes.filter(function (x) { return x.valeur != null; })
      .sort(function (a, b) { return sens * (b.valeur - a.valeur) || a.joueur.localeCompare(b.joueur, "fr"); });
    var gagnants = l.length ? l.filter(function (x) { return x.valeur === l[0].valeur; }) : [];
    return { classement: l, gagnants: gagnants };
  }

  // Trophées d'une année (remis en jeu chaque année), à la date donnée (incluse). Chaque trophée :
  // {id, gagnants: [{joueur, valeur, detail}], classement}. Un trophée sans valeur (personne n'a marqué, par exemple)
  // a une liste de gagnants vide.
  function trophees(donnees, annee, dateLimite) {
    var ed = edition(donnees, annee);
    var perso = ed.personnalites || {};
    var nomin = nominations(ed);
    var morts = decesDeLAnnee(donnees, annee, dateLimite);
    var et = etatAnnee(donnees, annee, dateLimite);
    var age = {};
    et.principal.forEach(function (l) { age[l.joueur] = l.ageMoyen; });
    function parJoueur(f) {
      return ed.participants.map(function (p) { var r = f(p.liste, p.joueurs[0]); return { joueur: p.joueurs[0], valeur: r.valeur, detail: r.detail || "" }; });
    }
    function dates(liste) { return liste.filter(function (id) { return morts[id]; }).map(function (id) { return { id: id, date: morts[id].date }; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }
    function jour(iso) { return Number(iso.slice(0, 4)) * 372 + Number(iso.slice(5, 7)) * 31 + Number(iso.slice(8, 10)); } // pour comparer des dates comme des nombres
    function compte(liste, f) { return liste.filter(function (id) { return perso[id] && f(perso[id], id); }).length; }
    var def = [
      ["gachette", -1, function (l) { var d = dates(l)[0]; return d ? { valeur: jour(d.date), detail: perso[d.id].nom + ", " + d.date } : {}; }],
      ["quatrevingtdixplus5", 1, function (l) { var d = dates(l).pop(); return d ? { valeur: jour(d.date), detail: perso[d.id].nom + ", " + d.date } : {}; }],
      ["peril-jeune", -1, function (l, j) { return { valeur: age[j] }; }],
      ["old-timer", 1, function (l, j) { return { valeur: age[j] }; }],
      ["diplomatico", 1, function (l) { var s = {}; l.forEach(function (id) { if (perso[id] && perso[id].pays) s[perso[id].pays] = 1; }); return { valeur: Object.keys(s).length }; }],
      ["france", 1, function (l) { return { valeur: compte(l, function (p) { return p.pays === "FRA"; }) }; }],
      ["orfevre", 1, function (l) { return { valeur: compte(l, function (p, id) { return nomin[id] === 1; }) }; }],
      ["captain-obvious", 1, function (l) { return { valeur: compte(l, function (p, id) { return nomin[id] > 2; }) }; }], // plus de deux listes = 1 point
      ["we-can-do-it", 1, function (l) { return { valeur: compte(l, function (p) { return p.sexe === "F"; }) }; }],
    ];
    return def.map(function (d) {
      var m = meilleurs(parJoueur(d[2]), d[1]);
      return { id: d[0], gagnants: m.gagnants, classement: m.classement };
    });
  }

  // Records de toutes les éditions terminées (l'année en cours n'y entre pas tant qu'elle n'est pas finie), sauf les
  // records de date, qui comptent aussi les décès de l'année en cours. Chaque record : {id, gagnants: [{...}]}.
  function records(donnees, etats, aujourdhui) {
    var finies = etats.filter(function (e) { return !e.enCours; });
    var epoques = {};
    donnees.epoques.forEach(function (e) { epoques[e.id] = e; });
    function lignes(f) { // une ligne par (édition, joueur)
      var r = [];
      finies.forEach(function (et) {
        var ed = edition(donnees, et.annee);
        et.principal.forEach(function (l) {
          var p = ed.participants.find(function (x) { return x.joueurs[0] === l.joueur; });
          var v = f(et, l, p, ed);
          if (v != null) r.push({ joueur: l.joueur, annee: et.annee, valeur: v.valeur != null ? v.valeur : v, detail: v.detail || "" });
        });
      });
      return r;
    }
    function ageListe(p) { return p && p.liste_archive ? p.liste_archive.reduce(function (s, x) { return s + x.age; }, 0) / p.liste_archive.length : null; }
    var nbNoms = function (et) { return epoques[et.epoque].noms_par_liste; };
    var res = [];
    function ajouter(id, sens, l) { var m = meilleurs(l, sens); res.push({ id: id, gagnants: m.gagnants, classement: m.classement }); }

    // victoires par joueur, et plus longue série d'éditions gagnées de suite (2018 puis 2020 se suivent : pas d'édition 2019)
    var victoires = {}, serie = {}, serieEnCours = {};
    finies.forEach(function (et) {
      var gagnants = et.principal.filter(function (l) { return l.rang === 1; }).map(function (l) { return l.joueur; });
      et.principal.forEach(function (l) {
        var g = gagnants.indexOf(l.joueur) >= 0;
        victoires[l.joueur] = (victoires[l.joueur] || 0) + (g ? 1 : 0);
        serieEnCours[l.joueur] = g ? (serieEnCours[l.joueur] || 0) + 1 : 0;
        serie[l.joueur] = Math.max(serie[l.joueur] || 0, serieEnCours[l.joueur]);
      });
      Object.keys(serieEnCours).forEach(function (j) { if (!et.principal.some(function (l) { return l.joueur === j; })) serieEnCours[j] = 0; });
    });
    ajouter("serial-faucheur", 1, Object.keys(serie).map(function (j) { return { joueur: j, valeur: serie[j], detail: "" }; }));
    ajouter("maitre-de-la-mort", 1, Object.keys(victoires).map(function (j) { return { joueur: j, valeur: victoires[j], detail: "" }; }));
    ajouter("one-shot", 1, lignes(function (et, l) { return { valeur: l.deces / nbNoms(et), detail: l.deces + " décès sur " + nbNoms(et) + " noms" }; }));
    ajouter("hitman", 1, lignes(function (et, l) { return l.points; }));
    ajouter("poulidor", 1, lignes(function (et, l) { return l.rang === 2 ? l.points : null; }));
    ajouter("oeil-du-tigre", 1, lignes(function (et, l) { return l.rang === 3 ? l.points : null; }));
    ajouter("youth-the-force", -1, lignes(function (et, l, p) { var a = ageListe(p); return l.rang === 1 && a != null ? a : null; }));
    ajouter("strict-minimum", -1, lignes(function (et, l) { return l.rang === 1 ? l.points : null; }));
    // équipe : tous les joueurs d'une année ensemble
    function equipe(f) { return finies.map(function (et) { return { joueur: String(et.annee), annee: et.annee, valeur: f(et), detail: "" }; }); }
    ajouter("dream-team", 1, equipe(function (et) { var d = et.principal.reduce(function (s, l) { return s + l.deces; }, 0); return d / (et.principal.length * nbNoms(et)); }).map(function (x) {
      var et = finies.find(function (e) { return e.annee === x.annee; }), d = et.principal.reduce(function (s, l) { return s + l.deces; }, 0);
      x.detail = d + " décès sur " + et.principal.length * nbNoms(et) + " noms"; return x; }));
    ajouter("pas-de-quartier", 1, equipe(function (et) { return et.principal.reduce(function (s, l) { return s + l.points; }, 0); }));

    // dates : décès le plus rapide / le plus tardif de l'année (jour et mois), anciens relevés + année en cours
    var rem = donnees.deces_remarquables || { plus_rapide: [], plus_tardif: [] };
    var tous = rem.plus_rapide.concat(rem.plus_tardif);
    donnees.editions.filter(function (e) { return e.personnalites; }).forEach(function (e) {
      var n = nominations(e), morts = decesDeLAnnee(donnees, e.annee, aujourdhui);
      Object.keys(morts).forEach(function (id) {
        tous.push({ nom: e.personnalites[id].nom, date: morts[id].date,
                    joueurs: e.participants.filter(function (p) { return p.liste.indexOf(id) >= 0; }).map(function (p) { return p.joueurs[0]; }) });
      });
    });
    function md(iso) { return iso.slice(5); }
    function parDate(sens) {
      var vus = {}, uniques = tous.filter(function (x) { var k = x.nom + x.date; if (vus[k]) return false; vus[k] = 1; return true; });
      var m = uniques.map(function (x) { return { x: x, v: Number(md(x.date).slice(0, 2)) * 100 + Number(md(x.date).slice(3)) }; })
        .sort(function (a, b) { return sens * (b.v - a.v); });
      return m.filter(function (z) { return z.v === m[0].v; }).map(function (z) { return z.x; });
    }
    res.push({ id: "derniere-minute", gagnants: parDate(1), dates: true });
    res.push({ id: "tombeau-ouvert", gagnants: parDate(-1), dates: true });
    return res;
  }

  return {
    trophees: trophees, records: records,
    bareme: bareme, etatAnnee: etatAnnee, evolutionMensuelle: evolutionMensuelle, historique: historique,
    classementGlobal: classementGlobal, classementTaux: classementTaux, parcoursJoueur: parcoursJoueur,
    aJoueDeuxAnneesDeSuite: aJoueDeuxAnneesDeSuite, finDeMois: finDeMois,
    decesDeLAnnee: decesDeLAnnee, nominations: nominations, edition: edition,
  };
});
