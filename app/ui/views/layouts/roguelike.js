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
    // load gauntlet resources, as the roguelike reuses the gauntlet visuals
    Promise.all([
      NavigationManager.getInstance().showDialogView(new ActivityDialogItemView()),
      PackageManager.getInstance().loadMinorPackage('gauntlet'),
    ]).then(function () {
      if (this.isDestroyed) return; // view is destroyed

      NavigationManager.getInstance().destroyDialogView();

      var arenaLayer = new ArenaLayer();
      Scene.getInstance().showContent(arenaLayer, true);
      arenaLayer.delegate = this;
      arenaLayer.dataSource = this;

      this.listenTo(NavigationManager.getInstance(), EVENTS.user_triggered_cancel, this.cancelLookingForGame);

      return this.showScreenForRun();
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
      });
    }

    // general choice before the first fight, each general showing its Bloodbound Spell
    var generalChoices = roguelikeManager.getGeneralChoices();
    if (generalChoices != null) {
      arenaLayer.bindDeck([]);
      return arenaLayer.showCardSelectScreen({
        faction_id: run.factionId,
        general_id: generalChoices[0],
        card_choices: generalChoices,
        card_choice_labels: _.map(generalChoices, function (generalId) {
          var signatureCard = SDK.GameSession.getCardCaches().getCardById(RoguelikeGenerals.getSignatureCardId(generalId));
          return signatureCard != null ? i18next.t('main_menu.roguelike_bloodbound_spell_label') + ': ' + signatureCard.getName() : '';
        }),
        card_choice_title: i18next.t('main_menu.roguelike_choose_general_label'),
        add_selected_card_to_deck: false,
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
      });
    }

    // run in progress
    var encounter = roguelikeManager.getNextEncounter();
    var encounterGeneralCard = SDK.GameSession.getCardCaches().getCardById(encounter.generalId);
    var encounterLevelLabel = i18next.t('main_menu.roguelike_level_label') + ' ' + encounter.level
      + (encounter.loop > 0 ? ' · ' + i18next.t('main_menu.roguelike_loop_label') + ' ' + (encounter.loop + 1) : '');
    var wonLastFight = roguelikeManager.consumeWonLastFight();
    var playerProgression = roguelikeManager.getPlayerProgression();

    arenaLayer.bindDeck(this._getRunDeckCardsData(run));
    return arenaLayer.showArenaRunScreen({
      faction_id: run.factionId,
      win_count: run.wins,
      run_details_label: i18next.t('main_menu.roguelike_wins_label') + ': ' + run.wins
        + '   ' + i18next.t('main_menu.roguelike_health_label') + ': ' + playerProgression.hp
        + '   ' + i18next.t('main_menu.roguelike_attack_label') + ': ' + playerProgression.atk
        + '   ' + i18next.t('main_menu.roguelike_starting_mana_label') + ': ' + playerProgression.mana,
      run_details_sub_label: i18next.t('main_menu.roguelike_next_fight_label') + ': ' + encounterLevelLabel + ' - ' + encounter.name
        + '\n' + encounterGeneralCard.getName() + ' - ' + encounter.generalHP + ' ' + i18next.t('main_menu.roguelike_health_label'),
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

  resignArenaRun: function () {
    return NavigationManager.getInstance().showDialogForConfirmation(i18next.t('main_menu.roguelike_abandon_confirmation_message')).then(function () {
      RoguelikeManager.getInstance().abandonRun();
      return this.showScreenForRun();
    }.bind(this));
  },

  /* endregion ARENA LAYER DELEGATE */

});

// Expose the class either via CommonJS or the global object
module.exports = RoguelikeLayout;
