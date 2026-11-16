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
      lignes = ed.participants.map(function (p) {
        return { joueur: p.joueurs[0], nom: nomAffiche(p), points: p.points, deces: p.deces, ageMoyen: null };
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

  return {
    bareme: bareme, etatAnnee: etatAnnee, evolutionMensuelle: evolutionMensuelle, historique: historique,
    classementGlobal: classementGlobal, classementTaux: classementTaux, parcoursJoueur: parcoursJoueur,
    aJoueDeuxAnneesDeSuite: aJoueDeuxAnneesDeSuite, finDeMois: finDeMois,
    decesDeLAnnee: decesDeLAnnee, nominations: nominations, edition: edition,
  };
});
