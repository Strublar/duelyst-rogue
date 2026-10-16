// pragma PKGS: nongame

'use strict';

var _ = require('underscore');
var SDK = require('app/sdk');
var RSX = require('app/data/resources');
var CONFIG = require('app/common/config');
var audio_engine = require('app/audio/audio_engine');
var Animations = require('app/ui/views/animations');
var NavigationManager = require('app/ui/managers/navigation_manager');
var RoguelikeProgression = require('app/sdk/roguelike/roguelikeProgression');
var RoguelikeGenerals = require('app/sdk/roguelike/roguelikeGenerals');
var RoguelikeCardMods = require('app/sdk/roguelike/roguelikeCardMods');
var Promise = require('bluebird');
var i18next = require('i18next');
var Template = require('app/ui/templates/item/roguelike_run_summary.hbs');

var FILL_DURATION = 1000;

/**
 * Shown when a roguelike run ends, like the end of game screen (reuses its styles): the xp earned,
 * then the account and general level bars filling one after the other, with level ups and what they unlock.
 */
var RoguelikeRunSummaryItemView = Backbone.Marionette.ItemView.extend({

  id: 'app-victory',
  className: 'status roguelike-run-summary',
  template: Template,

  ui: {
    $resultContent: '.result-content',
    $levelUpNotice: '.level-up-notice',
  },

  events: {
    'click .continue-button': 'onContinue',
  },

  animateIn: Animations.fadeIn,
  animateOut: Animations.fadeOut,

  initialize: function (options) {
    var runSummary = options.runSummary;
    var generalId = runSummary.generalId;
    var generalCard = SDK.GameSession.getCardCaches().getCardById(generalId);
    var previous = runSummary.previousProgression;
    var current = runSummary.progression;

    this._sections = [
      {
        key: 'account',
        name: i18next.t('main_menu.roguelike_global_progression_label'),
        getXpProgress: function (xp) { return RoguelikeProgression.getAccountXpProgress({ xp: xp }); },
        getUnlocks: function (level) { return RoguelikeProgression.getLevelDescriptions(false, level); },
        startXp: previous.xp,
        endXp: current.xp,
      },
      {
        key: 'general',
        name: generalCard != null ? generalCard.getName() : '',
        getXpProgress: function (xp) {
          var generalXp = {};
          generalXp[generalId] = xp;
          return RoguelikeProgression.getGeneralXpProgress({ general_xp: generalXp }, generalId);
        },
        getUnlocks: function (level) { return this._getGeneralLevelUnlocks(generalId, level, current); }.bind(this),
        startXp: RoguelikeProgression.getGeneralXp(previous, generalId),
        endXp: RoguelikeProgression.getGeneralXp(current, generalId),
      },
    ];

    // the general's concept art in the background, like the end of game screen
    var conceptResource = generalCard != null ? generalCard.getConceptResource() : null;

    this.model = new Backbone.Model({
      general_concept_img: conceptResource != null ? RSX.getResourcePathForScale(conceptResource.img, CONFIG.resourceScaleCSS) : null,
      wins_label: i18next.t('main_menu.roguelike_run_over_message', { count: runSummary.wins }),
      xp_earned: runSummary.xpEarned,
      quest_xp_earned: runSummary.questXpEarned,
      sections: _.map(this._sections, function (section) {
        var xpProgress = section.getXpProgress(section.startXp);
        return {
          key: section.key,
          name: section.name,
          start_level: xpProgress.level,
          start_percent: this._getPercent(xpProgress, section.startXp),
        };
      }, this),
    });
  },

  onRender: function () {
    _.each(this._sections, function (section) {
      this._getSectionElement(section).find('.section-xp-label').text(this._getXpLabel(section.getXpProgress(section.startXp), section.startXp));
    }, this);
  },

  onShow: function () {
    // same entrance as the end of game result, then fill the bars one after the other
    _.defer(function () {
      if (this.isDestroyed) return;
      this.ui.$resultContent.addClass('active');
    }.bind(this));
    Promise.delay(800).then(function () {
      return Promise.each(this._sections, function (section) {
        return this._animateSection(section);
      }.bind(this));
    }.bind(this));
  },

  onContinue: function () {
    NavigationManager.getInstance().destroyModalView();
  },

  /* region ANIMATION */

  _getSectionElement: function (section) {
    return this.$el.find('.progression-section[data-section=\'' + section.key + '\']');
  },

  _getPercent: function (xpProgress, xp) {
    if (xpProgress.isMaxLevel) {
      return 100;
    }
    return Math.min(100, 100 * (xp - xpProgress.levelXp) / (xpProgress.nextLevelXp - xpProgress.levelXp));
  },

  _getXpLabel: function (xpProgress, xp) {
    return xpProgress.isMaxLevel
      ? i18next.t('main_menu.roguelike_max_level_label')
      : i18next.t('main_menu.roguelike_xp_label', { xp: xp, next: xpProgress.nextLevelXp });
  },

  /**
   * Fills a level bar from the start to the end xp of the run, level by level.
   * @returns {Promise}
   */
  _animateSection: function (section) {
    var fillFrom = function (xp) {
      if (this.isDestroyed || xp >= section.endXp) {
        return Promise.resolve();
      }
      var xpProgress = section.getXpProgress(xp);
      if (xpProgress.isMaxLevel) {
        return Promise.resolve();
      }
      var levelUp = section.endXp >= xpProgress.nextLevelXp;
      var toXp = levelUp ? xpProgress.nextLevelXp : section.endXp;
      return this._fillBar(section, this._getPercent(xpProgress, xp), this._getPercent(xpProgress, toXp)).then(function () {
        if (this.isDestroyed) return null;
        if (!levelUp) {
          this._getSectionElement(section).find('.section-xp-label').text(this._getXpLabel(xpProgress, section.endXp));
          return null;
        }
        return this._showLevelUp(section, xpProgress.level + 1).then(function () {
          return fillFrom(toXp);
        });
      }.bind(this));
    }.bind(this);
    return fillFrom(section.startXp);
  },

  /**
   * Fills the earned part of a bar, like the end of game faction xp bar.
   * @returns {Promise}
   */
  _fillBar: function (section, fromPercent, toPercent) {
    var $section = this._getSectionElement(section);
    var $complete = $section.find('.level-progress-bar.complete');
    var $earned = $section.find('.level-progress-bar.earned');
    $complete.css('width', fromPercent + '%');
    $earned.css({ width: '0%', backgroundColor: '#6dcff6' });
    return new Promise(function (resolve) {
      $earned.velocity({ width: [(toPercent - fromPercent) + '%', 'none', '0%'] }, {
        duration: FILL_DURATION,
        complete: function () {
          $earned.velocity({ backgroundColor: '#ffffff' }, { duration: 400, complete: resolve });
        },
      });
    });
  },

  /**
   * Shows the level up notice, the new level and its unlocks, then empties the bar for the next level.
   * @returns {Promise}
   */
  _showLevelUp: function (section, level) {
    var $section = this._getSectionElement(section);
    audio_engine.current().play_effect(RSX.sfx_ui_confirm.audio);
    return new Promise(function (resolve) {
      this.ui.$levelUpNotice.velocity({
        opacity: [1, 'easeOutCubic', 0],
        translateY: ['0px', 'easeOutCubic', '100px'],
      }, {
        duration: 800,
        complete: function () {
          $section.find('.section-level').text(level);
          var $unlocks = $section.find('.section-unlocks');
          _.each(section.getUnlocks(level), function (unlock) {
            $('<li></li>').text(i18next.t('main_menu.roguelike_general_level_label', { level: level }) + ': ' + unlock)
              .css('opacity', 0).appendTo($unlocks).velocity({ opacity: [1, 0] }, { duration: 400 });
          });
          this.ui.$levelUpNotice.velocity({ opacity: [0, 1] }, { duration: 400, delay: 300 });
          $section.find('.level-progress-bar.complete').css('width', '0%');
          $section.find('.level-progress-bar.earned').css('width', '0%');
          resolve();
        }.bind(this),
      });
    }.bind(this));
  },

  /* endregion ANIMATION */

  /**
   * Returns what a general level unlocks: its level unlocks, starting deck mods and the next general of the faction.
   */
  _getGeneralLevelUnlocks: function (generalId, level, progression) {
    var cardCaches = SDK.GameSession.getCardCaches();
    var unlocks = RoguelikeProgression.getLevelDescriptions(true, level);
    _.each(_.where(RoguelikeProgression.getStartingCardMods(generalId), { level: level }), function (startingMod) {
      var card = cardCaches.getCardById(startingMod.cardId);
      unlocks.push((card != null ? card.getName() : startingMod.cardId) + ': ' + (RoguelikeCardMods.getModsLabel(startingMod.cardId, [startingMod.modId]) || startingMod.modId));
    });
    if (level === RoguelikeProgression.getNextGeneralUnlockLevel()) {
      var nextGeneralId = _.find(RoguelikeGenerals.getGeneralIdsForFaction(cardCaches.getCardById(generalId).getFactionId()), function (factionGeneralId) {
        return RoguelikeProgression.getUnlockingGeneralId(factionGeneralId) === generalId;
      });
      if (nextGeneralId != null && RoguelikeProgression.getIsGeneralUnlocked(progression, nextGeneralId)) {
        unlocks.push(i18next.t('main_menu.roguelike_general_unlocked_label', { name: cardCaches.getCardById(nextGeneralId).getName() }));
      }
    }
    return _.uniq(unlocks);
  },

});

module.exports = RoguelikeRunSummaryItemView;
