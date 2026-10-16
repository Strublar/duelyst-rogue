// pragma PKGS: nongame

'use strict';

var _ = require('underscore');
var CONFIG = require('app/common/config');
var RSX = require('app/data/resources');
var audio_engine = require('app/audio/audio_engine');
var SDK = require('app/sdk');
var Animations = require('app/ui/views/animations');
var RoguelikeManager = require('app/ui/managers/roguelike_manager');
var RoguelikeProgression = require('app/sdk/roguelike/roguelikeProgression');
var RoguelikeProgressionData = require('app/sdk/roguelike/roguelikeProgressionData');
var RoguelikeGenerals = require('app/sdk/roguelike/roguelikeGenerals');
var RoguelikeCardMods = require('app/sdk/roguelike/roguelikeCardMods');
var i18next = require('i18next');
var Template = require('app/ui/templates/item/roguelike_progression.hbs');

/**
 * Roguelike meta progression screen: the account level with every level's unlocks, and each general's level.
 * Reuses the profile modal styles (faction levels tab).
 */
var RoguelikeProgressionItemView = Backbone.Marionette.ItemView.extend({

  id: 'app-profile',
  className: 'modal duelyst-modal roguelike-progression',
  template: Template,

  events: {
    'click #roguelike_progression_tabs li': 'onTabChanged',
  },

  animateIn: Animations.fadeIn,
  animateOut: Animations.fadeOut,

  _selectedTab: 'account',

  initialize: function () {
    this.model = new Backbone.Model();
    this._bindModel();
  },

  onShow: function () {
    // the progression may have changed since the last fetch
    var roguelikeManager = RoguelikeManager.getInstance();
    roguelikeManager.whenRunResultsSent().then(function () { return roguelikeManager.fetchProgression(); }).then(function () {
      if (this.isDestroyed) return;
      this._bindModel();
      this.render();
    }.bind(this));
  },

  onRender: function () {
    this._showSelectedTab();
  },

  onTabChanged: function (e) {
    var selectedTab = $(e.currentTarget).data('value');
    if (selectedTab !== this._selectedTab) {
      this._selectedTab = selectedTab;
      audio_engine.current().play_effect_for_interaction(RSX.sfx_ui_tab_in.audio, CONFIG.SELECT_SFX_PRIORITY);
      this._showSelectedTab();
    }
  },

  _showSelectedTab: function () {
    this.$el.find('#roguelike_progression_tabs li').removeClass('active');
    this.$el.find('#roguelike_progression_tabs [data-value=\'' + this._selectedTab + '\']').addClass('active');
    this.$el.find('.roguelike-progression-tab').addClass('hide');
    this.$el.find('.roguelike-progression-tab[data-tab=\'' + this._selectedTab + '\']').removeClass('hide');
  },

  _getProgressPercent: function (xpProgress) {
    if (xpProgress.isMaxLevel) {
      return 100;
    }
    return Math.floor(100 * (xpProgress.xp - xpProgress.levelXp) / (xpProgress.nextLevelXp - xpProgress.levelXp));
  },

  _getXpLabel: function (xpProgress) {
    return xpProgress.isMaxLevel
      ? i18next.t('main_menu.roguelike_max_level_label')
      : i18next.t('main_menu.roguelike_xp_label', { xp: xpProgress.xp, next: xpProgress.nextLevelXp });
  },

  _bindModel: function () {
    var progression = RoguelikeManager.getInstance().getProgression();
    var cardCaches = SDK.GameSession.getCardCaches();

    // account
    var accountXpProgress = RoguelikeProgression.getAccountXpProgress(progression);
    var accountLevels = _.map(RoguelikeProgressionData.accountLevels, function (levelEntry) {
      return {
        level: levelEntry.level,
        xp: levelEntry.xp,
        unlocks: RoguelikeProgression.getLevelDescriptions(false, levelEntry.level).join(', '),
        reached: levelEntry.level <= accountXpProgress.level,
        current: levelEntry.level === accountXpProgress.level,
      };
    });

    // generals, by faction
    var factions = _.map(SDK.FactionFactory.getAllPlayableFactions(), function (faction) {
      var generals = _.map(RoguelikeGenerals.getGeneralIdsForFaction(faction.id), function (generalId) {
        var generalCard = cardCaches.getCardById(generalId);
        var xpProgress = RoguelikeProgression.getGeneralXpProgress(progression, generalId);
        var unlocked = RoguelikeProgression.getIsGeneralUnlocked(progression, generalId);
        var unlockingGeneralId = RoguelikeProgression.getUnlockingGeneralId(generalId);
        var startingMods = _.map(RoguelikeProgression.getStartingCardMods(generalId), function (startingMod) {
          var card = cardCaches.getCardById(startingMod.cardId);
          return {
            level: startingMod.level,
            label: (card != null ? card.getName() : startingMod.cardId) + ': ' + (RoguelikeCardMods.getModsLabel(startingMod.cardId, [startingMod.modId]) || startingMod.modId),
            reached: startingMod.level <= xpProgress.level,
          };
        });
        var nextLevel = xpProgress.level + 1;
        var nextUnlocks = xpProgress.isMaxLevel ? [] : RoguelikeProgression.getLevelDescriptions(true, nextLevel)
          .concat(_.pluck(_.where(startingMods, { level: nextLevel }), 'label'));
        return {
          name: generalCard.getName(),
          faction_id: faction.id,
          portrait_img: generalCard.getPortraitResource() && generalCard.getPortraitResource().img,
          level: xpProgress.level,
          xp_label: this._getXpLabel(xpProgress),
          progress_percent: this._getProgressPercent(xpProgress),
          unlocked: unlocked,
          lock_label: unlocked || unlockingGeneralId == null ? '' : i18next.t('main_menu.roguelike_locked_general_message', {
            name: generalCard.getName(),
            unlocker: cardCaches.getCardById(unlockingGeneralId).getName(),
            level: RoguelikeProgression.getNextGeneralUnlockLevel(),
          }),
          next_unlocks: nextUnlocks.join(', '),
          next_level: nextLevel,
          starting_mods: startingMods,
        };
      }, this);
      return { faction_name: faction.name, generals: generals };
    }, this);

    this.model.set({
      account_level: accountXpProgress.level,
      account_xp_label: this._getXpLabel(accountXpProgress),
      account_progress_percent: this._getProgressPercent(accountXpProgress),
      account_levels: accountLevels,
      factions: factions,
    });
  },

});

module.exports = RoguelikeProgressionItemView;
