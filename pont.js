/*
 * Pont entre le QG des missions (page Apps Script, fenêtre parente) et l'éditeur Scratch.
 *
 * Le QG envoie des commandes par postMessage : { qg: 1, id, type, ... }
 * L'éditeur répond : { qg: 1, id, type: 'reponse', ok, ...donnees } ou { ..., ok: false, erreur }
 * et signale des événements : { qg: 1, type: 'evenement', nom, ... }
 *
 * Commandes :
 *   charger     { sb3: ArrayBuffer, cle }  ouvre un projet (départ d'une mission), cle = élève + mission
 *   reprendre   { cle }                    rouvre la sauvegarde du navigateur → { trouve }
 *   sauvegarde  { cle }                    date de la sauvegarde du navigateur → { date } (null si aucune)
 *   sauver      {}                         sauvegarde tout de suite dans le navigateur
 *   effacer     { cle }                    supprime la sauvegarde du navigateur
 *   projet      {}                         → { json (project.json), execute } execute = drapeau vert cliqué
 *                                            ou script lancé depuis la dernière modification
 *   sb3         {}                         → { sb3: ArrayBuffer } (bouton « Télécharger mon projet »)
 *   drapeau     {}                         clic sur le drapeau vert (bouton « ▶ Tester » du QG)
 *   stop        {}                         arrête tout
 * Événements : pret (éditeur prêt), modifie, execute, sauve { date }
 *
 * Seule la fenêtre parente est écoutée. La sauvegarde (IndexedDB) est rangée dans le
 * navigateur de l'élève, cloisonnée par le site qui contient l'éditeur.
 */
(function() {
  var SAUVEGARDE_MS = 30000;
  var cible = document.getElementById('editeur');
  var state = new GUI.EditorState({ locale: 'fr' });
  GUI.setAppElement(cible);
  GUI.createStandaloneRoot(state, cible).render({
    basePath: 'gui/', // images des blocs : gui/static/blocks-media/
    projectId: GUI.defaultProjectId, // sans lui, rien ne se charge (le terrain de jeu passe par HashParserHOC)
    canSave: false,
    canShare: false,
    canRemix: false,
    canCreateNew: false,
    canCreateCopy: false,
    canEditTitle: false,
    canUseCloud: false,
    canManageFiles: true,
    canChangeLanguage: true,
    enableCommunity: false,
    backpackVisible: false,
    showComingSoon: false,
    hideTutorialProjects: true,
    onClickLogo: function() {}
  });
  // Petite scène par défaut : plus de place pour le code sur un écran de Chromebook
  state.store.dispatch(GUI.setStageSize('small'));
  var vm = state.store.getState().scratchGui.vm;
  window.vmQG = vm; // pour les tests (outils/tester-pont.js) et le débogage

  var etat = { cle: null, execute: false, sale: false, pret: false, chargement: false };

  function envoyer(message, transfert) {
    message.qg = 1;
    if (window.parent !== window) window.parent.postMessage(message, '*', transfert || []);
  }
  function evenement(nom, donnees) {
    var m = donnees || {};
    m.type = 'evenement';
    m.nom = nom;
    envoyer(m);
  }

  // Prêt quand le projet par défaut de l'éditeur est affiché : un projet chargé
  // avant serait écrasé par ce projet par défaut.
  var arreter = state.store.subscribe(function() {
    var s = state.store.getState().scratchGui.projectState;
    if (s && s.loadingState === 'SHOWING_WITHOUT_ID') {
      arreter();
      etat.pret = true;
      document.getElementById('chargement').remove();
      evenement('pret', { version: '0.1.0' });
    }
  });

  vm.on('PROJECT_CHANGED', function() {
    if (etat.chargement) return;
    etat.sale = true;
    if (etat.execute) {
      etat.execute = false;
      evenement('modifie');
    }
  });
  // Exécuté : drapeau vert cliqué (PROJECT_START, même sans script à lancer, ex. M0)
  // ou un script qui démarre (touche, clic sur un lutin ou sur un bloc)
  function execute() {
    if (etat.chargement) return;
    if (!etat.execute) {
      etat.execute = true;
      evenement('execute');
    }
  }
  vm.on('PROJECT_START', execute);
  vm.on('PROJECT_RUN_START', execute);

  function charger(sb3) {
    etat.chargement = true;
    vm.stopAll();
    return vm.loadProject(sb3).then(function() {
      // Laisse passer les PROJECT_CHANGED émis pendant le chargement
      return new Promise(function(ok) { setTimeout(ok, 300); });
    }).then(function() {
      etat.chargement = false;
      etat.execute = false;
      etat.sale = false;
    }, function(err) {
      etat.chargement = false;
      throw err;
    });
  }

  // --- Sauvegarde dans le navigateur (IndexedDB) ----------------------------

  var base = null;
  function ouvrirBase() {
    if (base) return base;
    base = new Promise(function(ok, ko) {
      var req = indexedDB.open('qg-scratch', 1);
      req.onupgradeneeded = function() { req.result.createObjectStore('projets', { keyPath: 'cle' }); };
      req.onsuccess = function() { ok(req.result); };
      req.onerror = function() { ko(req.error); };
    });
    return base;
  }
  function transaction(mode, faire) {
    return ouvrirBase().then(function(db) {
      return new Promise(function(ok, ko) {
        var t = db.transaction('projets', mode);
        var req = faire(t.objectStore('projets'));
        t.oncomplete = function() { ok(req && req.result); };
        t.onerror = function() { ko(t.error); };
      });
    });
  }
  function lireSauvegarde(cle) {
    return transaction('readonly', function(s) { return s.get(cle); });
  }
  function sauver() {
    if (!etat.cle || etat.chargement) return Promise.resolve(null);
    var cle = etat.cle;
    etat.sale = false;
    return vm.saveProjectSb3().then(function(blob) {
      return blob.arrayBuffer();
    }).then(function(sb3) {
      var date = Date.now();
      return transaction('readwrite', function(s) { return s.put({ cle: cle, date: date, sb3: sb3 }); }).then(function() {
        evenement('sauve', { date: date });
        return date;
      });
    }, function(err) {
      etat.sale = true;
      throw err;
    });
  }
  setInterval(function() { if (etat.sale) sauver().catch(function() {}); }, SAUVEGARDE_MS);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden' && etat.sale) sauver().catch(function() {});
  });

  // --- Commandes du QG ---------------------------------------------------------

  var COMMANDES = {
    charger: function(m) {
      return charger(m.sb3).then(function() {
        etat.cle = m.cle || null;
        return {};
      });
    },
    reprendre: function(m) {
      return lireSauvegarde(m.cle).then(function(s) {
        if (!s) return { trouve: false };
        return charger(s.sb3).then(function() {
          etat.cle = m.cle;
          return { trouve: true, date: s.date };
        });
      });
    },
    sauvegarde: function(m) {
      return lireSauvegarde(m.cle).then(function(s) { return { date: s ? s.date : null }; });
    },
    sauver: function() {
      return sauver().then(function(date) { return { date: date }; });
    },
    effacer: function(m) {
      return transaction('readwrite', function(s) { return s.delete(m.cle); }).then(function() { return {}; });
    },
    projet: function() {
      return { json: vm.toJSON(), execute: etat.execute };
    },
    drapeau: function() {
      vm.greenFlag();
      return {};
    },
    stop: function() {
      vm.stopAll();
      return {};
    },
    sb3: function() {
      return vm.saveProjectSb3().then(function(blob) { return blob.arrayBuffer(); }).then(function(sb3) {
        return { sb3: sb3, transfert: [sb3] };
      });
    }
  };

  window.addEventListener('message', function(ev) {
    var m = ev.data;
    if (ev.source !== window.parent || !m || m.qg !== 1 || m.type === 'reponse' || m.type === 'evenement') return;
    var commande = COMMANDES[m.type];
    var reponse = { type: 'reponse', id: m.id };
    if (!etat.pret) {
      reponse.ok = false;
      reponse.erreur = 'Scratch n\'est pas encore prêt.';
      return envoyer(reponse);
    }
    Promise.resolve().then(function() {
      if (!commande) throw new Error('Commande inconnue : ' + m.type);
      return commande(m);
    }).then(function(donnees) {
      var transfert = donnees.transfert;
      delete donnees.transfert;
      Object.keys(donnees).forEach(function(k) { reponse[k] = donnees[k]; });
      reponse.ok = true;
      envoyer(reponse, transfert);
    }, function(err) {
      reponse.ok = false;
      reponse.erreur = (err && err.message) || String(err);
      envoyer(reponse);
    });
  });
})();
