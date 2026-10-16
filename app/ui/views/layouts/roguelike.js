// pragma PKGS: nongame

'use strict';

var SDK = require('app/sdk');
var Scene = require('app/view/Scene');
var EVENTS = require('app/common/event_types');
var PackageManager = require('app/ui/managers/package_manager');
var NavigationManager = require('app/ui/managers/navigation_manager');
var GamesManager = require('app/ui/managers/games_manager');
var RoguelikeManager = require('app/ui/managers/roguelike_manager');
var RoguelikeCardMods = require('app/sdk/roguelike/roguelikeCardMods');
var RoguelikeGenerals = require('app/sdk/roguelike/roguelikeGenerals');
var RoguelikeProgression = require('app/sdk/roguelike/roguelikeProgression');
var RoguelikeEncounters = require('app/sdk/roguelike/roguelikeEncounters');
var RoguelikeRunSummaryItemView = require('app/ui/views/item/roguelike_run_summary');
var ActivityDialogItemView = require('app/ui/views/item/activity_dialog');
var ArenaLayer = require('app/view/layers/arena/ArenaLayer');
var RoguelikeTempl = require('app/ui/templates/layouts/arena.hbs');
var Promise = require('bluebird');
var _ = require('underscore');
var i18next = require('i18next');

/**
 * Roguelike run screens, reusing the gauntlet (arena) layer visuals with this view as its delegate and data source.
 */
var RoguelikeLayout = Backbone.Marionette.LayoutView.extend({

  id: 'app-roguelike',
  template: RoguelikeTempl,

  /* region MARIONETTE EVENTS */

  onShow: function () {
    // load gauntlet resources, as the roguelike reuses the gauntlet visuals, and the meta progression
    var roguelikeManager = RoguelikeManager.getInstance();
    Promise.all([
      NavigationManager.getInstance().showDialogView(new ActivityDialogItemView()),
      PackageManager.getInstance().loadMinorPackage('gauntlet'),
      roguelikeManager.whenRunResultsSent().then(function () { return roguelikeManager.fetchProgression(); }),
    ]).then(function () {
      if (this.isDestroyed) return; // view is destroyed

      NavigationManager.getInstance().destroyDialogView();

      var arenaLayer = new ArenaLayer();
      Scene.getInstance().showContent(arenaLayer, true);
      arenaLayer.delegate = this;
      arenaLayer.dataSource = this;

      this.listenTo(NavigationManager.getInstance(), EVENTS.user_triggered_cancel, this.cancelLookingForGame);

      return this.showScreenForRun();
    }.bind(this)).then(function () {
      if (!this.isDestroyed) this._showRunSummaries();
    }.bind(this));
  },

  onDestroy: function () {
    PackageManager.getInstance().unloadMajorMinorPackage('gauntlet');
  },

  /* endregion MARIONETTE EVENTS */

  /* region SCREENS */

  _getArenaLayer: function () {
    var scene = Scene.getInstance();
    var arenaLayer = scene && scene.getContent();
    return arenaLayer instanceof ArenaLayer ? arenaLayer : null;
  },

  /**
   * Returns the run deck as card data with mods applied, excluding the general.
   */
  _getRunDeckCardsData: function (run) {
    var roguelikeManager = RoguelikeManager.getInstance();
    return _.map(_.rest(run.deck), function (card) { return roguelikeManager.getCardDataForRunCard(card); });
  },

  /* region PROGRESSION */

  /**
   * Shows the account and general progression earned by the last finished run, if any.
   */
  _showRunSummaries: function () {
    var runSummary = _.last(RoguelikeManager.getInstance().consumeRunSummaries());
    if (runSummary != null) {
      NavigationManager.getInstance().showModalView(new RoguelikeRunSummaryItemView({ runSummary: runSummary }));
    }
  },

  /**
   * Returns a level label with its xp, ex: "Level 3 (140 / 220 XP)".
   */
  _getXpProgressLabel: function (levelLabel, xpProgress) {
    var xpLabel = xpProgress.isMaxLevel
      ? i18next.t('main_menu.roguelike_max_level_label')
      : i18next.t('main_menu.roguelike_xp_label', { xp: xpProgress.xp, next: xpProgress.nextLevelXp });
    return levelLabel + ' (' + xpLabel + ')';
  },

  /**
   * Returns the account level label with its xp and next unlocks.
   */
  _getAccountProgressionLabel: function () {
    var progression = RoguelikeManager.getInstance().getProgression();
    var xpProgress = RoguelikeProgression.getAccountXpProgress(progression);
    var label = this._getXpProgressLabel(i18next.t('main_menu.roguelike_account_level_label', { level: xpProgress.level }), xpProgress);
    var nextUnlocks = xpProgress.isMaxLevel ? [] : RoguelikeProgression.getLevelDescriptions(false, xpProgress.level + 1);
    return nextUnlocks.length > 0 ? label + '   ' + i18next.t('main_menu.roguelike_next_unlock_label') + ': ' + nextUnlocks.join(', ') : label;
  },

  /**
   * Returns how the locked generals of a faction unlock, ex: "Reva Eventide unlocks at Kaleos Xaan Level 3".
   */
  _getLockedGeneralsLabel: function (factionId) {
    var progression = RoguelikeManager.getInstance().getProgression();
    var unlockLevel = RoguelikeProgression.getNextGeneralUnlockLevel();
    var cardCaches = SDK.GameSession.getCardCaches();
    var lockedGeneralIds = _.reject(RoguelikeGenerals.getGeneralIdsForFaction(factionId), function (generalId) {
      return RoguelikeProgression.getIsGeneralUnlocked(progression, generalId);
    });
    if (unlockLevel == null || lockedGeneralIds.length === 0) {
      return '';
    }
    // only the next general to unlock, the ones after it need it first
    var generalId = lockedGeneralIds[0];
    return i18next.t('main_menu.roguelike_locked_general_message', {
      name: cardCaches.getCardById(generalId).getName(),
      unlocker: cardCaches.getCardById(RoguelikeProgression.getUnlockingGeneralId(generalId)).getName(),
      level: unlockLevel,
    });
  },

  /* endregion PROGRESSION */

  /**
   * Shows the screen matching the run state.
   */
  showScreenForRun: function () {
    var arenaLayer = this._getArenaLayer();
    if (arenaLayer == null) {
      return Promise.resolve();
    }

    var roguelikeManager = RoguelikeManager.getInstance();
    var run = roguelikeManager.getRun();

    if (!run.active) {
      // faction selection for a new run, mentioning how the last run ended
      arenaLayer.bindDeck([]);
      var titleLabel = run.lastResult === 'loss'
        ? i18next.t('main_menu.roguelike_run_over_message', { count: run.wins }) + '   ' + i18next.t('main_menu.roguelike_choose_faction_header')
        : i18next.t('main_menu.roguelike_choose_faction_header');
      return arenaLayer.showFactionSelectScreen({
        faction_choices: _.pluck(SDK.FactionFactory.getAllPlayableFactions(), 'id'),
        title_label: titleLabel,
        sub_title_label: this._getAccountProgressionLabel(),
      });
    }

    // general choice before the first fight among the unlocked generals, each general showing its level and Bloodbound Spell
    var generalChoices = roguelikeManager.getGeneralChoices();
    if (generalChoices != null) {
      var lockedGeneralsLabel = this._getLockedGeneralsLabel(run.factionId);
      arenaLayer.bindDeck([]);
      return arenaLayer.showCardSelectScreen({
        faction_id: run.factionId,
        general_id: generalChoices[0],
        card_choices: generalChoices,
        card_choice_progressions: _.map(generalChoices, function (generalId) {
          var xpProgress = RoguelikeProgression.getGeneralXpProgress(roguelikeManager.getProgression(), generalId);
          var percent = xpProgress.isMaxLevel ? 100 : 100 * (xpProgress.xp - xpProgress.levelXp) / (xpProgress.nextLevelXp - xpProgress.levelXp);
          return { level: xpProgress.level, percent: percent };
        }),
        card_choice_title: i18next.t('main_menu.roguelike_choose_general_label') + (lockedGeneralsLabel ? ' - ' + lockedGeneralsLabel : ''),
        add_selected_card_to_deck: false,
        hide_deck: true,
      });
    }

    // card drop from the last won fight
    var cardChoices = roguelikeManager.getCardChoices();
    if (cardChoices != null) {
      arenaLayer.bindDeck(this._getRunDeckCardsData(run));
      return arenaLayer.showCardSelectScreen({
        faction_id: run.factionId,
        general_id: run.generalId,
        card_choices: _.map(cardChoices, function (cardChoice) { return roguelikeManager.getCardDataForRunCard(cardChoice); }),
        card_choice_labels: _.map(cardChoices, function (cardChoice) { return RoguelikeCardMods.getModsLabel(cardChoice.id, cardChoice.mods); }),
        reroll_count: roguelikeManager.getRemainingRerolls(),
      });
    }

    // bonus reward: upgrade a card already in the deck, shown with its new mod
    var upgradeChoices = roguelikeManager.getUpgradeChoices();
    if (upgradeChoices != null) {
      this._upgradeChoicesCardData = _.map(upgradeChoices, function (upgradeChoice) {
        return roguelikeManager.getCardDataForRunCard({ id: upgradeChoice.id, mods: upgradeChoice.mods.concat(upgradeChoice.newModId) });
      });
      arenaLayer.bindDeck(this._getRunDeckCardsData(run));
      return arenaLayer.showCardSelectScreen({
        faction_id: run.factionId,
        general_id: run.generalId,
        card_choices: this._upgradeChoicesCardData,
        card_choice_labels: _.map(upgradeChoices, function (upgradeChoice) { return RoguelikeCardMods.getModsLabel(upgradeChoice.id, [upgradeChoice.newModId]); }),
        card_choice_title: i18next.t('main_menu.roguelike_upgrade_card_label'),
        add_selected_card_to_deck: false,
        reroll_count: roguelikeManager.getRemainingRerolls(),
      });
    }

    // run in progress: a milestone per encounter level, highlighting the next fight
    var encounter = roguelikeManager.getNextEncounter();
    var wonLastFight = roguelikeManager.consumeWonLastFight();

    arenaLayer.bindDeck(this._getRunDeckCardsData(run));
    return arenaLayer.showArenaRunScreen({
      faction_id: run.factionId,
      win_count: run.wins,
      run_details_label: '',
      run_milestones: {
        count: RoguelikeEncounters.encounters.length,
        completed: encounter.level - 1,
        loop: encounter.loop,
      },
    }, wonLastFight);
  },

  /* endregion SCREENS */

  /* region ARENA LAYER DATA SOURCE */

  getTicketCount: function () {
    return 0;
  },

  getArenaRunGeneralId: function () {
    return RoguelikeManager.getInstance().getRun().generalId;
  },

  /* endregion ARENA LAYER DATA SOURCE */

  /* region ARENA LAYER DELEGATE */

  selectFaction: function (factionId) {
    RoguelikeManager.getInstance().startRun(factionId);
    return this.showScreenForRun();
  },

  selectCard: function (selectedSdkCard, unselectedSdkCards, selectedCardData) {
    var roguelikeManager = RoguelikeManager.getInstance();
    var picked;
    if (roguelikeManager.getGeneralChoices() != null) {
      picked = roguelikeManager.pickGeneral(selectedSdkCard.getId());
    } else if (roguelikeManager.getCardChoices() != null) {
      picked = roguelikeManager.pickCard(selectedSdkCard.getId());
    } else {
      picked = roguelikeManager.pickUpgrade(_.indexOf(this._upgradeChoicesCardData, selectedCardData));
    }
    if (!picked) {
      return Promise.reject();
    }

    // the arena layer adds a single copy (with its mods) to the deck display once this resolves,
    // so show the run screen afterwards and rebind the deck to display every looted copy
    var selectPromise = Promise.resolve();
    selectPromise.then(function () {
      return Promise.delay(0);
    }).then(function () {
      if (!this.isDestroyed) this.showScreenForRun();
    }.bind(this));
    return selectPromise;
  },

  startLookingForGame: function () {
    RoguelikeManager.getInstance().startNextFight();
    return Promise.resolve();
  },

  cancelLookingForGame: function () {
    if (!NavigationManager.getInstance().getIsShowingModalView()) {
      GamesManager.getInstance().cancelMatchmaking();
    }
    return Promise.resolve();
  },

  rerollReward: function () {
    if (!RoguelikeManager.getInstance().rerollReward()) {
      return Promise.resolve();
    }
    return this.showScreenForRun();
  },

  resignArenaRun: function () {
    return NavigationManager.getInstance().showDialogForConfirmation(i18next.t('main_menu.roguelike_abandon_confirmation_message')).then(function () {
      var roguelikeManager = RoguelikeManager.getInstance();
      roguelikeManager.abandonRun();
      return roguelikeManager.whenRunResultsSent().then(function () {
        if (this.isDestroyed) return;
        this._showRunSummaries();
        return this.showScreenForRun();
      }.bind(this));
    }.bind(this));
  },

  /* endregion ARENA LAYER DELEGATE */

});

// Expose the class either via CommonJS or the global object
module.exports = RoguelikeLayout;
