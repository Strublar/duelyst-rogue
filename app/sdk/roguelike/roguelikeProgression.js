const _ = require('underscore');
const RoguelikeProgressionData = require('app/sdk/roguelike/roguelikeProgressionData');
const RoguelikeEncounters = require('app/sdk/roguelike/roguelikeEncounters');
const RoguelikeGenerals = require('app/sdk/roguelike/roguelikeGenerals');

/**
 * Roguelike meta progression, kept between runs (server side, see /api/me/roguelike/progression):
 * - account level: global xp, unlocks run features (reward choices, rarity, upgrades...) and general stats
 * - general (hero) level: xp per general, unlocks the next general of its faction, starting deck mods and general stats
 * Each fight gives the same xp to the account and to the run general, all given when the run ends (levels never change during a run).
 * Design tables: roguelike_csv/account_progression.csv, general_progression.csv, progression_xp.csv and the mods column of roguelike_csv/generals/*.csv,
 * generated into roguelikeProgressionData.js by scripts/roguelike_progression.py.
 * An unlock's value is the sum of its values on every level reached.
 *
 * Progression state format: { xp: Number, general_xp: { generalId: Number } }
 */

const RoguelikeProgression = {};

RoguelikeProgression.Unlock = {
  CardChoices: 'card_choices', // number of card reward choices
  LootMods: 'loot_mods', // number of mods on each looted card
  UpgradeReward: 'upgrade_reward', // > 0 gives the upgrade bonus reward
  UpgradeChoices: 'upgrade_choices', // number of upgrade bonus reward choices
  RarityBonus: 'rarity_bonus', // card rewards use the rarity odds of this many encounter levels higher
  TagChance: 'tag_chance', // synergy (tag) roll chance after the first win (%)
  TagChancePerWin: 'tag_chance_per_win', // synergy (tag) roll chance gained per win (%)
  GeneralHP: 'general_hp', // bonus general health
  GeneralAtk: 'general_atk', // bonus general attack
  StartingMana: 'starting_mana', // bonus starting mana
  Rerolls: 'rerolls', // reward rerolls per run
  NextGeneral: 'next_general', // general levels only: > 0 unlocks the next general of the faction
};

// stat unlocks given by both the account and the general levels
const STAT_UNLOCKS = {
  hp: RoguelikeProgression.Unlock.GeneralHP,
  atk: RoguelikeProgression.Unlock.GeneralAtk,
  mana: RoguelikeProgression.Unlock.StartingMana,
};

RoguelikeProgression.createEmptyState = function () {
  return { xp: 0, general_xp: {} };
};

RoguelikeProgression.normalizeState = function (state) {
  return {
    xp: (state && state.xp) || 0,
    general_xp: _.extend({}, state && state.general_xp),
  };
};

function getLevelEntryIndexForXp(levels, xp) {
  let index = 0;
  for (let i = 0; i < levels.length; i++) {
    if (xp >= levels[i].xp) {
      index = i;
    }
  }
  return index;
}

/**
 * Returns the level reached and xp details: {level, xp, levelXp, nextLevelXp (null at max level), isMaxLevel}.
 */
function getXpProgress(levels, xp) {
  const index = getLevelEntryIndexForXp(levels, xp);
  const next = levels[index + 1];
  return {
    level: levels[index].level,
    xp,
    levelXp: levels[index].xp,
    nextLevelXp: next != null ? next.xp : null,
    isMaxLevel: next == null,
  };
}

function getUnlockValue(levels, xp, unlock) {
  const index = getLevelEntryIndexForXp(levels, xp);
  return _.reduce(levels.slice(0, index + 1), (total, entry) => total + _.reduce(entry.unlocks, (sum, entryUnlock) => sum + (entryUnlock.unlock === unlock ? entryUnlock.value : 0), 0), 0);
}

RoguelikeProgression.getGeneralXp = function (state, generalId) {
  return (state && state.general_xp && state.general_xp[generalId]) || 0;
};

RoguelikeProgression.getAccountXpProgress = function (state) {
  return getXpProgress(RoguelikeProgressionData.accountLevels, (state && state.xp) || 0);
};

RoguelikeProgression.getGeneralXpProgress = function (state, generalId) {
  return getXpProgress(RoguelikeProgressionData.generalLevels, RoguelikeProgression.getGeneralXp(state, generalId));
};

RoguelikeProgression.getAccountUnlockValue = function (state, unlock) {
  return getUnlockValue(RoguelikeProgressionData.accountLevels, (state && state.xp) || 0, unlock);
};

RoguelikeProgression.getGeneralUnlockValue = function (state, generalId, unlock) {
  return getUnlockValue(RoguelikeProgressionData.generalLevels, RoguelikeProgression.getGeneralXp(state, generalId), unlock);
};

/**
 * Returns the unlock descriptions of a level, ex: to announce a level up or show the next unlock.
 * @param {Boolean} isGeneral general levels instead of account levels
 * @param {Number} level
 * @returns {Array}
 */
RoguelikeProgression.getLevelDescriptions = function (isGeneral, level) {
  const levels = isGeneral ? RoguelikeProgressionData.generalLevels : RoguelikeProgressionData.accountLevels;
  const entry = _.findWhere(levels, { level });
  return entry != null ? _.compact(_.pluck(entry.unlocks, 'description')) : [];
};

/**
 * Returns the xp earned by a fight (account and general alike).
 * @param {Number} fightNumber
 * @param {Boolean} isWinner
 * @returns {Number}
 */
RoguelikeProgression.getXpForFight = function (fightNumber, isWinner) {
  const xpTable = RoguelikeProgressionData.xp;
  if (!isWinner) {
    return xpTable.loss || 0;
  }
  // fights won before this one in the run (looped encounters keep counting)
  return (xpTable.win || 0) + (xpTable.win_per_level || 0) * Math.max(0, fightNumber - 1);
};

/**
 * Returns the xp earned by a run: each fight won, plus the lost fight if the run ended with a loss.
 * @param {Number} wins
 * @param {Boolean} isLoss
 * @returns {Number}
 */
RoguelikeProgression.getXpForRun = function (wins, isLoss) {
  let xp = 0;
  for (let fightNumber = 1; fightNumber <= wins; fightNumber++) {
    xp += RoguelikeProgression.getXpForFight(fightNumber, true);
  }
  return xp + (isLoss ? RoguelikeProgression.getXpForFight(wins + 1, false) : 0);
};

/**
 * Returns a new progression state with the xp of a finished run added to the account and the general.
 * @returns {Object} {state, xpEarned}
 */
RoguelikeProgression.addRunResult = function (state, generalId, wins, isLoss) {
  const newState = RoguelikeProgression.normalizeState(state);
  const xpEarned = RoguelikeProgression.getXpForRun(wins, isLoss);
  newState.xp += xpEarned;
  newState.general_xp[generalId] = RoguelikeProgression.getGeneralXp(newState, generalId) + xpEarned;
  return { state: newState, xpEarned };
};

/**
 * Returns the general the given general is unlocked by (the previous general of its faction), or null if it is always unlocked.
 */
RoguelikeProgression.getUnlockingGeneralId = function (generalId) {
  // required lazily to avoid a circular dependency with the sdk
  const GameSession = require('app/sdk/gameSession');
  const generalCard = GameSession.getCardCaches().getCardById(generalId);
  if (generalCard == null) {
    return null;
  }
  const generalIds = RoguelikeGenerals.getGeneralIdsForFaction(generalCard.getFactionId());
  const index = _.indexOf(generalIds, generalId);
  return index > 0 ? generalIds[index - 1] : null;
};

/**
 * Returns whether a general can be picked: the first general of each faction always can, the others once the previous general unlocks them.
 */
RoguelikeProgression.getIsGeneralUnlocked = function (state, generalId) {
  const unlockingGeneralId = RoguelikeProgression.getUnlockingGeneralId(generalId);
  return unlockingGeneralId == null || RoguelikeProgression.getGeneralUnlockValue(state, unlockingGeneralId, RoguelikeProgression.Unlock.NextGeneral) > 0;
};

/**
 * Returns the general level that unlocks the next general, or null if no level does.
 */
RoguelikeProgression.getNextGeneralUnlockLevel = function () {
  const entry = _.find(RoguelikeProgressionData.generalLevels, (levelEntry) => _.some(levelEntry.unlocks, (unlock) => unlock.unlock === RoguelikeProgression.Unlock.NextGeneral && unlock.value > 0));
  return entry != null ? entry.level : null;
};

/**
 * Returns the starting deck mods of a card unlocked by the general's level.
 * @returns {Array} mod ids
 */
RoguelikeProgression.getStartingCardModIds = function (state, generalId, cardId) {
  const modsByCardId = RoguelikeProgressionData.startingCardMods[generalId] || {};
  const level = RoguelikeProgression.getGeneralXpProgress(state, generalId).level;
  return _.uniq(_.map(_.filter(modsByCardId[cardId] || [], ([, modLevel]) => modLevel <= level), ([modId]) => modId));
};

/**
 * Returns every starting deck mod of a general with the level unlocking it, sorted by level.
 * @returns {Array} [{cardId, modId, level}]
 */
RoguelikeProgression.getStartingCardMods = function (generalId) {
  const modsByCardId = RoguelikeProgressionData.startingCardMods[generalId] || {};
  const mods = [];
  _.each(modsByCardId, (cardMods, cardId) => {
    _.each(cardMods, ([modId, level]) => {
      mods.push({ cardId: parseInt(cardId, 10), modId, level });
    });
  });
  return _.sortBy(mods, 'level');
};

/**
 * Returns the run general's stats for the next fight ({hp, atk, mana}), including the account and general level bonuses.
 */
RoguelikeProgression.getPlayerProgression = function (wins, state, generalId) {
  const playerProgression = RoguelikeEncounters.getPlayerProgressionForWins(wins);
  _.each(STAT_UNLOCKS, (unlock, stat) => {
    playerProgression[stat] += RoguelikeProgression.getAccountUnlockValue(state, unlock)
      + (generalId != null ? RoguelikeProgression.getGeneralUnlockValue(state, generalId, unlock) : 0);
  });
  return playerProgression;
};

module.exports = RoguelikeProgression;
