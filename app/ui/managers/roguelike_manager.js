// See: https://coderwall.com/p/myzvmg for why managers are created this way

var _RoguelikeManager = {};
_RoguelikeManager.instance = null;
_RoguelikeManager.getInstance = function () {
  if (this.instance == null) {
    this.instance = new RoguelikeManager();
  }
  return this.instance;
};
_RoguelikeManager.current = _RoguelikeManager.getInstance;

module.exports = _RoguelikeManager;

var _ = require('underscore');
var Logger = require('app/common/logger');
var EventBus = require('app/common/eventbus');
var EVENTS = require('app/common/event_types');
var Storage = require('app/common/storage');
var UtilsJavascript = require('app/common/utils/utils_javascript');
var SDK = require('app/sdk');
var RoguelikeEncounters = require('app/sdk/roguelike/roguelikeEncounters');
var RoguelikeCardMods = require('app/sdk/roguelike/roguelikeCardMods');
var RoguelikeGenerals = require('app/sdk/roguelike/roguelikeGenerals');
var RoguelikeCardTags = require('app/sdk/roguelike/roguelikeCardTags');
var RoguelikeProgression = require('app/sdk/roguelike/roguelikeProgression');
var Promise = require('bluebird');
var ProfileManager = require('./profile_manager');

var STORAGE_KEY = 'roguelikeRun';
// finished runs not yet sent to the server
var RUN_RESULTS_STORAGE_KEY = 'roguelikeRunResults';

// the number of card drop choices, mods per drop, upgrade choices and the synergy (tag) roll chance come from the account level (see RoguelikeProgression)
var CARD_DROP_SETS = [
  SDK.CardSet.Core,
  SDK.CardSet.Shimzar,
  SDK.CardSet.CombinedUnlockables,
  SDK.CardSet.FirstWatch,
  SDK.CardSet.Wartech,
  SDK.CardSet.Coreshatter,
];
// chance that a drop offers spells instead of minions (shared by all choices)
var CARD_DROP_SPELL_CHANCE = 0.3;
// relative odds of the drop rarity (shared by all choices) by level of the encounter won: [common, rare, epic, legendary]
// encounters past the last level use the last entry
var LOOPED_RARITY_LEVEL = 99;
var CARD_DROP_RARITIES = [SDK.Rarity.Common, SDK.Rarity.Rare, SDK.Rarity.Epic, SDK.Rarity.Legendary];
var CARD_DROP_RARITY_WEIGHTS_BY_LEVEL = {
  1: [80, 20, 0, 0],
  2: [70, 25, 5, 0],
  3: [60, 30, 10, 0],
  4: [50, 30, 15, 5],
  5: [40, 35, 20, 5],
  6: [30, 35, 25, 10],
  7: [20, 35, 30, 15],
  8: [10, 35, 35, 20],
  9: [0, 30, 40, 30],
  10: [0, 20, 40, 40],
};

/**
 * Tracks the state of the current roguelike run: the run deck, wins, and whether a fight is in progress.
 * Run state is kept client side (local storage) and is independent from the player's collection.
 */
function RoguelikeManager() {
  this._run = this._load();
  // set when a roguelike fight ends, so post game navigation returns to the run screen
  this._returnToRunAfterGame = false;
  // meta progression (account and general xp), kept server side
  this._progression = RoguelikeProgression.createEmptyState();
  // finished runs to show the progression of
  this._runSummaries = [];

  // a fight still in progress on load was abandoned (e.g. page reload), which counts as a loss
  if (this.getIsInFight()) {
    this.recordResult(false);
    this._returnToRunAfterGame = false;
  }
}

RoguelikeManager.prototype._createEmptyRun = function () {
  return {
    active: false,
    factionId: null,
    generalId: null,
    // generals to choose from before the first fight of a run
    generalChoices: null,
    deck: [],
    wins: 0,
    inFight: false,
    lastResult: null,
    cardChoices: null,
    // bonus reward to give once the card drop is picked
    pendingBonusReward: null,
    upgradeChoices: null,
    // encounter level used for the rarity of the pending card choices (kept to reroll them)
    cardChoicesRarityLevel: null,
    // reward rerolls used this run (the account level gives the rerolls per run)
    rerollsUsed: 0,
  };
};

RoguelikeManager.prototype._load = function () {
  var run = null;
  try {
    run = Storage.get(STORAGE_KEY);
  } catch (e) {
    Logger.module('ROGUELIKE').log('failed to load run', e);
  }
  return _.extend(this._createEmptyRun(), run || {});
};

RoguelikeManager.prototype._save = function () {
  try {
    Storage.set(STORAGE_KEY, this._run);
  } catch (e) {
    Logger.module('ROGUELIKE').log('failed to save run', e);
  }
};

/* region PROGRESSION */

/**
 * Fetches the meta progression from the server.
 * @returns {Promise}
 */
RoguelikeManager.prototype.fetchProgression = function () {
  return new Promise(function (resolve) {
    $.ajax({
      url: process.env.API_URL + '/api/me/roguelike/progression',
      type: 'GET',
      dataType: 'json',
    }).done(function (state) {
      this._progression = RoguelikeProgression.normalizeState(state);
      resolve();
    }.bind(this)).fail(function () {
      Logger.module('ROGUELIKE').log('failed to fetch progression');
      resolve();
    });
  }.bind(this));
};

RoguelikeManager.prototype.getProgression = function () {
  return UtilsJavascript.deepCopy(this._progression);
};

/**
 * Sends a finished run to the server, which gives its xp to the account and the general (levels only change between runs).
 * The result is kept in local storage until the server has it (ex: a run lost by reloading the page is sent once logged in).
 */
RoguelikeManager.prototype._sendRunResult = function (generalId, wins, isLoss) {
  if (generalId == null) {
    return;
  }
  var runResults = this._getUnsentRunResults();
  runResults.push({ general_id: generalId, wins: wins, is_loss: isLoss });
  this._setUnsentRunResults(runResults);
  this._sendUnsentRunResults();
};

RoguelikeManager.prototype._getUnsentRunResults = function () {
  try {
    return Storage.get(RUN_RESULTS_STORAGE_KEY) || [];
  } catch (e) {
    return [];
  }
};

RoguelikeManager.prototype._setUnsentRunResults = function (runResults) {
  try {
    Storage.set(RUN_RESULTS_STORAGE_KEY, runResults);
  } catch (e) {
    Logger.module('ROGUELIKE').log('failed to save run results', e);
  }
};

/**
 * Sends the run results the server doesn't have yet, one at a time, keeping a summary of each to show.
 * @returns {Promise}
 */
RoguelikeManager.prototype._sendUnsentRunResults = function () {
  if (this._runResultsPromise != null) {
    return this._runResultsPromise;
  }
  var sendNext = function () {
    var runResult = this._getUnsentRunResults()[0];
    if (runResult == null) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      $.ajax({
        url: process.env.API_URL + '/api/me/roguelike/progression/run_result',
        data: JSON.stringify(runResult),
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
      }).done(function (res) {
        this._setUnsentRunResults(_.rest(this._getUnsentRunResults()));
        this._progression = RoguelikeProgression.normalizeState(res.progression);
        this._runSummaries.push({
          generalId: runResult.general_id,
          wins: runResult.wins,
          xpEarned: res.xp_earned,
          questXpEarned: res.quest_xp_earned,
          previousProgression: RoguelikeProgression.normalizeState(res.previous_progression),
          progression: this._progression,
        });
        resolve();
      }.bind(this)).fail(function () {
        Logger.module('ROGUELIKE').log('failed to send run result, will retry');
        reject();
      });
    }.bind(this)).then(sendNext);
  }.bind(this);
  this._runResultsPromise = sendNext().catch(function () {}).finally(function () {
    this._runResultsPromise = null;
  }.bind(this));
  return this._runResultsPromise;
};

/**
 * Resolves once the finished runs were sent, so screens show the updated progression.
 * @returns {Promise}
 */
RoguelikeManager.prototype.whenRunResultsSent = function () {
  return this._sendUnsentRunResults();
};

/**
 * Returns the summaries of the runs finished since the last call: {generalId, wins, xpEarned, questXpEarned, previousProgression, progression}.
 * @returns {Array}
 */
RoguelikeManager.prototype.consumeRunSummaries = function () {
  var runSummaries = this._runSummaries;
  this._runSummaries = [];
  return runSummaries;
};

RoguelikeManager.prototype._getAccountUnlockValue = function (unlock) {
  return RoguelikeProgression.getAccountUnlockValue(this._progression, unlock);
};

/* endregion PROGRESSION */

RoguelikeManager.prototype.getRun = function () {
  return UtilsJavascript.deepCopy(this._run);
};

RoguelikeManager.prototype.getHasActiveRun = function () {
  return this._run.active;
};

RoguelikeManager.prototype.getIsInFight = function () {
  return this._run.active && this._run.inFight;
};

/**
 * Starts a new run for a faction. The general (and its starting deck) is chosen before the first fight.
 */
RoguelikeManager.prototype.startRun = function (factionId) {
  this._run = this._createEmptyRun();
  this._run.active = true;
  this._run.factionId = factionId;
  this._run.generalChoices = _.filter(RoguelikeGenerals.getGeneralIdsForFaction(factionId), function (generalId) {
    return RoguelikeProgression.getIsGeneralUnlocked(this._progression, generalId);
  }, this);
  this._save();
};

/**
 * Returns the general ids to choose from, or null if the general is already chosen.
 */
RoguelikeManager.prototype.getGeneralChoices = function () {
  if (!this._run.active || this._run.generalChoices == null || this._run.generalChoices.length === 0) {
    return null;
  }
  return this._run.generalChoices.slice(0);
};

/**
 * Picks the run general from the general choices, giving the run its starting deck with the mods unlocked by the general's level.
 */
RoguelikeManager.prototype.pickGeneral = function (generalId) {
  if (!_.contains(this.getGeneralChoices() || [], generalId)) {
    return false;
  }
  var progression = this._progression;
  var startingDeck = _.map(RoguelikeGenerals.getStartingDeckCardIds(generalId), function (cardId) {
    var modIds = RoguelikeCardMods.filterModIds(cardId, RoguelikeProgression.getStartingCardModIds(progression, generalId, cardId));
    return modIds.length > 0 ? { id: cardId, mods: modIds } : { id: cardId };
  });
  this._run.generalId = generalId;
  this._run.generalChoices = null;
  this._run.deck = [{ id: generalId }].concat(startingDeck);
  this._save();
  return true;
};

RoguelikeManager.prototype.abandonRun = function () {
  if (this._run.active) {
    this._sendRunResult(this._run.generalId, this._run.wins, false);
  }
  this._run = this._createEmptyRun();
  this._save();
};

RoguelikeManager.prototype.getFightNumber = function () {
  return this._run.wins + 1;
};

RoguelikeManager.prototype.getNextEncounter = function () {
  return RoguelikeEncounters.getEncounterForFight(this.getFightNumber());
};

/**
 * Returns the run general's stats for the next fight, level bonuses included: {hp, atk, mana}.
 */
RoguelikeManager.prototype.getPlayerProgression = function () {
  return RoguelikeProgression.getPlayerProgression(this._run.wins, this._progression, this._run.generalId);
};

RoguelikeManager.prototype.startNextFight = function () {
  if (!this._run.active || this._run.generalId == null) {
    return;
  }

  this._run.inFight = true;
  this._save();

  var encounter = this.getNextEncounter();
  EventBus.getInstance().trigger(
    EVENTS.start_single_player,
    UtilsJavascript.deepCopy(this._run.deck),
    this._run.factionId,
    this._run.generalId,
    null,
    ProfileManager.getInstance().get('battle_map_id'),
    encounter.generalId,
    null,
    null,
    { fight_number: this.getFightNumber(), wins: this._run.wins },
  );
};

/**
 * Records the outcome of the current fight. A win extends the run, anything else ends it.
 */
RoguelikeManager.prototype.recordResult = function (isWinner) {
  if (!this.getIsInFight()) {
    return;
  }

  this._run.inFight = false;
  if (isWinner) {
    // looped encounters always use the best drop odds
    var encounterWon = this.getNextEncounter();
    this._run.wins += 1;
    // looped encounters use the best odds (any level past the table does)
    var rarityLevel = encounterWon.loop > 0 ? LOOPED_RARITY_LEVEL : encounterWon.level + this._getAccountUnlockValue(RoguelikeProgression.Unlock.RarityBonus);
    this._run.cardChoicesRarityLevel = rarityLevel;
    this._run.cardChoices = this._generateCardChoices(this._run.factionId, rarityLevel);
    this._run.pendingBonusReward = RoguelikeEncounters.getBonusReward(encounterWon);
    this._run.lastResult = 'win';
  } else {
    var wins = this._run.wins;
    // the run is over: its xp is given now
    this._sendRunResult(this._run.generalId, wins, true);
    this._run = this._createEmptyRun();
    this._run.wins = wins;
    this._run.lastResult = 'loss';
  }
  this._returnToRunAfterGame = true;
  this._save();
};

/**
 * Cancels a fight that never started (e.g. matchmaking failed or was cancelled).
 */
RoguelikeManager.prototype.cancelFight = function () {
  if (this._run.inFight) {
    this._run.inFight = false;
    this._save();
  }
};

/**
 * Returns a random drop rarity for the level of the encounter won.
 * @param {Number} encounterLevel
 */
RoguelikeManager.prototype._getRandomCardDropRarityId = function (encounterLevel) {
  var levels = _.map(_.keys(CARD_DROP_RARITY_WEIGHTS_BY_LEVEL), Number);
  var weights = CARD_DROP_RARITY_WEIGHTS_BY_LEVEL[Math.min(Math.max(1, encounterLevel), _.max(levels))];
  var roll = Math.random() * _.reduce(weights, function (memo, weight) { return memo + weight; }, 0);
  for (var i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) {
      return CARD_DROP_RARITIES[i];
    }
  }
  return SDK.Rarity.Common;
};

/**
 * Returns all droppable card ids for a faction, rarity and card type (same pool rules as gauntlet drafts).
 * Every drop comes with a mod, so cards no mod can apply to are excluded.
 */
RoguelikeManager.prototype._getCardDropPool = function (factionId, rarityId, cardType) {
  var cardCaches = SDK.GameSession.getCardCaches();
  return _.reduce(CARD_DROP_SETS, function (cardIds, cardSetId) {
    var cards = cardCaches.getCardSet(cardSetId).getFaction(factionId).getRarity(rarityId)
      .getIsPrismatic(false)
      .getIsGeneral(false)
      .getIsHiddenInCollection(false)
      .getIsSkinned(false)
      .getType(cardType)
      .getCards();
    var moddableCards = _.filter(cards, function (card) { return RoguelikeCardMods.getApplicableModIds(card.getId()).length > 0; });
    return cardIds.concat(_.map(moddableCards, function (card) { return card.getId(); }));
  }, []);
};

/**
 * Generates distinct card choices of a single rarity and card type (minions or spells) from the run faction or neutral cards.
 * Each choice is either a random roll or a tag roll (see _getRandomTagCardId), falling back to a random roll.
 * Cards already in the run deck are never offered. Each choice comes with a random mod.
 * @param {Number} factionId
 * @param {Number} encounterLevel level of the encounter won, higher levels drop rarer cards
 * @returns {Array} choices as {id, mods}
 */
RoguelikeManager.prototype._generateCardChoices = function (factionId, encounterLevel) {
  var rarityId = this._getRandomCardDropRarityId(encounterLevel);
  var cardType = Math.random() < CARD_DROP_SPELL_CHANCE ? SDK.CardType.Spell : SDK.CardType.Unit;
  var numCardChoices = Math.max(1, this._getAccountUnlockValue(RoguelikeProgression.Unlock.CardChoices));
  var numLootMods = this._getAccountUnlockValue(RoguelikeProgression.Unlock.LootMods);
  var deckCardIds = _.map(this._run.deck || [], function (card) { return _.isObject(card) ? card.id : card; });
  var factionPool = _.difference(this._getCardDropPool(factionId, rarityId, cardType), deckCardIds);
  var neutralPool = _.difference(this._getCardDropPool(SDK.Factions.Neutral, rarityId, cardType), deckCardIds);
  // not enough spells of this rarity for a full drop: offer minions instead
  if (cardType === SDK.CardType.Spell && _.union(factionPool, neutralPool).length < numCardChoices) {
    cardType = SDK.CardType.Unit;
    factionPool = _.difference(this._getCardDropPool(factionId, rarityId, cardType), deckCardIds);
    neutralPool = _.difference(this._getCardDropPool(SDK.Factions.Neutral, rarityId, cardType), deckCardIds);
  }
  var tagPool = _.difference(this._getTagCardDropPool(factionId, rarityId, cardType), deckCardIds);
  // chance that a choice is a tag roll (a card sharing a tag with a random deck card) instead of a random roll, increased after each win
  var tagChancePercent = this._getAccountUnlockValue(RoguelikeProgression.Unlock.TagChance)
    + this._getAccountUnlockValue(RoguelikeProgression.Unlock.TagChancePerWin) * Math.max(0, this._run.wins - 1);
  var tagChance = Math.min(1, tagChancePercent / 100);
  var cardIds = [];
  while (cardIds.length < numCardChoices) {
    var cardId = Math.random() < tagChance ? this._getRandomTagCardId(_.without(deckCardIds, this._run.generalId), _.difference(tagPool, cardIds)) : null;
    if (cardId == null) {
      var remainingFactionPool = _.difference(factionPool, cardIds);
      var remainingNeutralPool = _.difference(neutralPool, cardIds);
      // pick from the faction or neutral cards evenly, or from whichever still has cards
      var pool = (Math.random() < 0.5 && remainingFactionPool.length > 0) || remainingNeutralPool.length === 0 ? remainingFactionPool : remainingNeutralPool;
      if (pool.length === 0) {
        break;
      }
      cardId = _.sample(pool);
    }
    cardIds.push(cardId);
  }
  return _.map(cardIds, function (cardId) {
    var modIds = [];
    for (var i = 0; i < numLootMods; i++) {
      var modId = RoguelikeCardMods.getRandomModId(cardId, modIds);
      if (modId != null) {
        modIds.push(modId);
      }
    }
    return { id: cardId, mods: modIds };
  });
};

/**
 * Returns the droppable faction and neutral card ids of a card type for tag rolls: the drop rarity or any lower one.
 */
RoguelikeManager.prototype._getTagCardDropPool = function (factionId, rarityId, cardType) {
  var rarityIds = CARD_DROP_RARITIES.slice(0, _.indexOf(CARD_DROP_RARITIES, rarityId) + 1);
  return _.reduce(rarityIds, function (cardIds, dropRarityId) {
    return cardIds.concat(this._getCardDropPool(factionId, dropRarityId, cardType), this._getCardDropPool(SDK.Factions.Neutral, dropRarityId, cardType));
  }.bind(this), []);
};

/**
 * Tag roll: picks a random distinct card of the run deck (excluding the general), a random tag of that card, then a random card of the pool sharing that tag.
 * @param {Array} deckCardIds
 * @param {Array} pool card ids that can be offered
 * @returns {Number|null} null when the deck card has no tags or no card of the pool shares the tag
 */
RoguelikeManager.prototype._getRandomTagCardId = function (deckCardIds, pool) {
  var tag = _.sample(RoguelikeCardTags.getTags(_.sample(_.uniq(deckCardIds))));
  if (tag == null) {
    return null;
  }
  var cardIds = _.filter(pool, function (cardId) { return RoguelikeCardTags.hasTag(cardId, tag); });
  return cardIds.length > 0 ? _.sample(cardIds) : null;
};

/**
 * Returns a run card ({id, mods}) from a stored card, which may be a card id (runs from before mods).
 */
RoguelikeManager.prototype._normalizeRunCard = function (card) {
  return _.isObject(card) ? { id: card.id, mods: (card.mods || []).slice(0) } : { id: card, mods: [] };
};

/**
 * Returns the pending card choices as {id, mods}, or null if there are none.
 */
RoguelikeManager.prototype.getCardChoices = function () {
  if (!this._run.active || this._run.cardChoices == null || this._run.cardChoices.length === 0) {
    return null;
  }
  return _.map(this._run.cardChoices, this._normalizeRunCard);
};

/**
 * Adds copies of a card from the current card choices to the run deck, mods included.
 */
RoguelikeManager.prototype.pickCard = function (cardId) {
  var choice = _.find(this.getCardChoices() || [], function (cardChoice) { return cardChoice.id === cardId; });
  if (choice == null) {
    return false;
  }
  for (var i = 0; i < RoguelikeEncounters.LOOT_COPIES; i++) {
    this._run.deck.push(choice.mods.length > 0 ? { id: choice.id, mods: choice.mods.slice(0) } : { id: choice.id });
  }
  this._run.cardChoices = null;
  this._giveBonusReward();
  this._save();
  return true;
};

/**
 * Gives the pending bonus reward of the last won encounter, once its card drop is picked.
 */
RoguelikeManager.prototype._giveBonusReward = function () {
  var bonusReward = this._run.pendingBonusReward;
  this._run.pendingBonusReward = null;
  if (bonusReward === RoguelikeEncounters.BonusReward.Upgrade && this._getAccountUnlockValue(RoguelikeProgression.Unlock.UpgradeReward) > 0) {
    var upgradeChoices = this._generateUpgradeChoices();
    this._run.upgradeChoices = upgradeChoices.length > 0 ? upgradeChoices : null;
  }
};

RoguelikeManager.prototype._getRunCardKey = function (card) {
  return card.id + ':' + card.mods.slice(0).sort().join(',');
};

/**
 * Returns the distinct cards of the run deck (excluding the general) as {id, mods}, a card with different mods counting as another card.
 */
RoguelikeManager.prototype._getDistinctDeckCards = function () {
  var cards = _.map(_.rest(this._run.deck), this._normalizeRunCard);
  return _.uniq(cards, false, this._getRunCardKey);
};

/**
 * Generates cards of the run deck to upgrade with a new random mod, picking cards with the fewest mods first.
 * @returns {Array} choices as {id, mods, newModId}
 */
RoguelikeManager.prototype._generateUpgradeChoices = function () {
  var upgradableCards = _.filter(this._getDistinctDeckCards(), function (card) {
    return RoguelikeCardMods.getUpgradeModIds(card.id, card.mods).length > 0;
  });
  // fewest mods first and random among cards with as many mods, preferring different cards
  var sortedCards = _.sortBy(_.shuffle(upgradableCards), function (card) { return card.mods.length; });
  var numUpgradeChoices = this._getAccountUnlockValue(RoguelikeProgression.Unlock.UpgradeChoices);
  var choices = [];
  _.each(sortedCards, function (card) {
    if (choices.length < numUpgradeChoices && !_.findWhere(choices, { id: card.id })) {
      choices.push(card);
    }
  });
  _.each(sortedCards, function (card) {
    if (choices.length < numUpgradeChoices && !_.contains(choices, card)) {
      choices.push(card);
    }
  });
  return _.map(choices, function (card) {
    return { id: card.id, mods: card.mods, newModId: RoguelikeCardMods.getRandomModId(card.id, card.mods) };
  });
};

/**
 * Returns how many reward rerolls are left this run.
 */
RoguelikeManager.prototype.getRemainingRerolls = function () {
  return Math.max(0, this._getAccountUnlockValue(RoguelikeProgression.Unlock.Rerolls) - (this._run.rerollsUsed || 0));
};

/**
 * Rerolls the pending reward (card drop or upgrade choices), using a reroll.
 * @returns {Boolean} whether the reward was rerolled
 */
RoguelikeManager.prototype.rerollReward = function () {
  if (this.getRemainingRerolls() <= 0) {
    return false;
  }
  if (this.getCardChoices() != null) {
    var rarityLevel = this._run.cardChoicesRarityLevel != null ? this._run.cardChoicesRarityLevel : this._run.wins;
    this._run.cardChoices = this._generateCardChoices(this._run.factionId, rarityLevel);
  } else if (this.getUpgradeChoices() != null) {
    var upgradeChoices = this._generateUpgradeChoices();
    if (upgradeChoices.length === 0) {
      return false;
    }
    this._run.upgradeChoices = upgradeChoices;
  } else {
    return false;
  }
  this._run.rerollsUsed = (this._run.rerollsUsed || 0) + 1;
  this._save();
  return true;
};

/**
 * Returns the pending card upgrades as {id, mods, newModId}, or null if there are none.
 */
RoguelikeManager.prototype.getUpgradeChoices = function () {
  if (!this._run.active || this._run.upgradeChoices == null || this._run.upgradeChoices.length === 0) {
    return null;
  }
  return UtilsJavascript.deepCopy(this._run.upgradeChoices);
};

/**
 * Adds the new mod of an upgrade choice to every copy of that card in the run deck. Adds no copies.
 * @param {Number} index index of the upgrade choice
 */
RoguelikeManager.prototype.pickUpgrade = function (index) {
  var choices = this.getUpgradeChoices();
  var choice = choices && choices[index];
  if (choice == null) {
    return false;
  }
  var upgradedKey = this._getRunCardKey(this._normalizeRunCard(choice));
  this._run.deck = _.map(this._run.deck, function (card, i) {
    var runCard = this._normalizeRunCard(card);
    if (i > 0 && this._getRunCardKey(runCard) === upgradedKey) {
      return { id: runCard.id, mods: runCard.mods.concat(choice.newModId) };
    }
    return card;
  }, this);
  this._run.upgradeChoices = null;
  this._save();
  return true;
};

/**
 * Returns a run card ({id, mods}) as card data with its mods applied, for display.
 */
RoguelikeManager.prototype.getCardDataForRunCard = function (card) {
  card = this._normalizeRunCard(card);
  return RoguelikeCardMods.createCardData(card.id, card.mods);
};

/**
 * Returns whether the last fight was won, only once so the win is celebrated a single time.
 */
RoguelikeManager.prototype.consumeWonLastFight = function () {
  var wonLastFight = this._run.active && this._run.lastResult === 'win';
  if (wonLastFight) {
    this._run.lastResult = null;
    this._save();
  }
  return wonLastFight;
};

RoguelikeManager.prototype.getShouldReturnToRunAfterGame = function () {
  return this._returnToRunAfterGame;
};

RoguelikeManager.prototype.consumeReturnToRunAfterGame = function () {
  var shouldReturn = this._returnToRunAfterGame;
  this._returnToRunAfterGame = false;
  return shouldReturn;
};
