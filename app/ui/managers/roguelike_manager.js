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
var ProfileManager = require('./profile_manager');

var STORAGE_KEY = 'roguelikeRun';

// card drops after each won fight
var NUM_CARD_CHOICES = 4;
// card upgrades (bonus reward) after the card drop
var NUM_UPGRADE_CHOICES = 3;
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
  this._run.generalChoices = RoguelikeGenerals.getGeneralIdsForFaction(factionId);
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
 * Picks the run general from the general choices, giving the run its starting deck.
 */
RoguelikeManager.prototype.pickGeneral = function (generalId) {
  if (!_.contains(this.getGeneralChoices() || [], generalId)) {
    return false;
  }
  var cardIds = [generalId].concat(RoguelikeGenerals.getStartingDeckCardIds(generalId));
  this._run.generalId = generalId;
  this._run.generalChoices = null;
  this._run.deck = _.map(cardIds, function (cardId) { return { id: cardId }; });
  this._save();
  return true;
};

RoguelikeManager.prototype.abandonRun = function () {
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
 * Returns the run general's stats for the next fight: {hp, atk, mana}.
 */
RoguelikeManager.prototype.getPlayerProgression = function () {
  return RoguelikeEncounters.getPlayerProgressionForWins(this._run.wins);
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
    this._run.cardChoices = this._generateCardChoices(this._run.factionId, encounterWon.loop > 0 ? Infinity : encounterWon.level);
    this._run.pendingBonusReward = RoguelikeEncounters.getBonusReward(encounterWon);
    this._run.lastResult = 'win';
  } else {
    var wins = this._run.wins;
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
 * Cards already in the run deck are never offered. Each choice comes with a random mod.
 * @param {Number} factionId
 * @param {Number} encounterLevel level of the encounter won, higher levels drop rarer cards
 * @returns {Array} choices as {id, mods}
 */
RoguelikeManager.prototype._generateCardChoices = function (factionId, encounterLevel) {
  var rarityId = this._getRandomCardDropRarityId(encounterLevel);
  var cardType = Math.random() < CARD_DROP_SPELL_CHANCE ? SDK.CardType.Spell : SDK.CardType.Unit;
  var deckCardIds = _.map(this._run.deck || [], function (card) { return _.isObject(card) ? card.id : card; });
  var factionPool = _.difference(this._getCardDropPool(factionId, rarityId, cardType), deckCardIds);
  var neutralPool = _.difference(this._getCardDropPool(SDK.Factions.Neutral, rarityId, cardType), deckCardIds);
  // not enough spells of this rarity for a full drop: offer minions instead
  if (cardType === SDK.CardType.Spell && _.union(factionPool, neutralPool).length < NUM_CARD_CHOICES) {
    factionPool = _.difference(this._getCardDropPool(factionId, rarityId, SDK.CardType.Unit), deckCardIds);
    neutralPool = _.difference(this._getCardDropPool(SDK.Factions.Neutral, rarityId, SDK.CardType.Unit), deckCardIds);
  }
  var cardIds = [];
  while (cardIds.length < NUM_CARD_CHOICES) {
    var remainingFactionPool = _.difference(factionPool, cardIds);
    var remainingNeutralPool = _.difference(neutralPool, cardIds);
    // pick from the faction or neutral cards evenly, or from whichever still has cards
    var pool = (Math.random() < 0.5 && remainingFactionPool.length > 0) || remainingNeutralPool.length === 0 ? remainingFactionPool : remainingNeutralPool;
    if (pool.length === 0) {
      break;
    }
    cardIds.push(_.sample(pool));
  }
  return _.map(cardIds, function (cardId) {
    return { id: cardId, mods: [RoguelikeCardMods.getRandomModId(cardId)] };
  });
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
  if (bonusReward === RoguelikeEncounters.BonusReward.Upgrade) {
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
  var choices = [];
  _.each(sortedCards, function (card) {
    if (choices.length < NUM_UPGRADE_CHOICES && !_.findWhere(choices, { id: card.id })) {
      choices.push(card);
    }
  });
  _.each(sortedCards, function (card) {
    if (choices.length < NUM_UPGRADE_CHOICES && !_.contains(choices, card)) {
      choices.push(card);
    }
  });
  return _.map(choices, function (card) {
    return { id: card.id, mods: card.mods, newModId: RoguelikeCardMods.getRandomModId(card.id, card.mods) };
  });
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
