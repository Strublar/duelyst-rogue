const _ = require('underscore');
const CardType = require('app/sdk/cards/cardType');
const ModifierProvoke = require('app/sdk/modifiers/modifierProvoke');
const ModifierFrenzy = require('app/sdk/modifiers/modifierFrenzy');
const ModifierFirstBlood = require('app/sdk/modifiers/modifierFirstBlood');
const ModifierInsight = require('app/sdk/modifiers/modifierInsight');
const ModifierEcho = require('app/sdk/modifiers/modifierEcho');
const ModifierWarp = require('app/sdk/modifiers/modifierWarp');
const ModifierBloodcall = require('app/sdk/modifiers/modifierBloodcall');
const ModifierPatient = require('app/sdk/modifiers/modifierPatient');
const ModifierEthereal = require('app/sdk/modifiers/modifierEthereal');
const ModifierMirror = require('app/sdk/modifiers/modifierMirror');

/**
 * Roguelike card mods: permanent upgrades on run deck cards (ex: +1 attack, -1 cost, an extra keyword).
 * Run deck entries store mods by id ({id, mods: ['atk']}), which are converted to card data for games and UI.
 * Mod strength scales with the card's base cost tier, so the same mod id is stronger on expensive cards.
 * Stat mods change the card's base stats, so they persist everywhere (hand, deck, board) and can't be dispelled.
 * Keyword mods add inherent modifiers, so they behave like the card's own keywords (dispel removes them).
 * Mods with effects not shown by stats are shown in the card's description (keywords at the top, changed amounts in place).
 * NOTE: labels and descriptions are in english, as card data is created on the server where translations aren't loaded.
 * See roguelike_csv/roguelike_mods.csv for the design table.
 */

const RoguelikeCardMods = {};

// minimum base cost of each tier: 0-2, 3-4, 5-6, 7+
RoguelikeCardMods.COST_TIER_MIN_COSTS = [0, 3, 5, 7];

// mod amounts by cost tier (null when the mod isn't available at that tier)
const MIXED_STATS_BY_TIER = [1, 2, 3, 5];
const COST_REDUCTION_BY_TIER = [1, 1, 2, 3];
const PROVOKE_STATS_BY_TIER = [[0, 1], [0, 2], [1, 3], [2, 5]];
const FRENZY_STATS_BY_TIER = [[1, 0], [2, 0], [3, 0], [5, 0]];
const RUSH_STATS_BY_TIER = [[0, 0], [0, 0], [0, 0], [0, 0]];
const INSIGHT_BY_TIER = [0, 1, 2, 3];
const SPELL_COST_REDUCTION_BY_TIER = [1, 1, 2, 3];
const SPELL_POWER_BY_TIER = [2, 3, 4, 5];
const SPELL_BUFF_BY_TIER = [1, 2, 3, 5];

// mod ids from earlier versions of the run state (removed mods are ignored)
const LEGACY_MOD_IDS = {
  // the removed attack and health mods are replaced by the stats mod
  atk1: 'mixed_stats', atk2: 'mixed_stats', hp2: 'mixed_stats', atk: 'mixed_stats', hp: 'mixed_stats', cost1: 'cost',
};

function getBaseCard(cardId) {
  // required lazily to avoid a circular dependency with the sdk
  const GameSession = require('app/sdk/gameSession');
  return GameSession.getCardCaches().getCardById(cardId);
}

function isMinion(card) {
  return card.getType() === CardType.Unit && !card.getIsGeneral();
}

function isSpell(card) {
  return card.getType() === CardType.Spell;
}

function hasKeyword(card, modifierClass) {
  return _.contains(card.getKeywordClasses(), modifierClass);
}

function addStat(cardData, card, key, amount) {
  if (amount !== 0) {
    cardData[key] = (cardData[key] != null ? cardData[key] : card[key]) + amount;
  }
}

function addModifier(cardData, contextObject) {
  contextObject.isInherent = true;
  cardData.additionalInherentModifiersContextObjects = (cardData.additionalInherentModifiersContextObjects || []).concat(contextObject);
}

function addDescriptionPrefix(cardData, text) {
  cardData.descriptionPrefix = cardData.descriptionPrefix ? `${cardData.descriptionPrefix}, ${text}` : text;
}


function statsLabel(stats) {
  return stats[0] > 0 || stats[1] > 0 ? ` +${stats[0]}/+${stats[1]}` : '';
}

/**
 * Returns the cost tier (0 to 3) of a card from its base cost.
 * @param {Card} card
 * @returns {Number}
 */
RoguelikeCardMods.getCostTier = function (card) {
  const minCosts = RoguelikeCardMods.COST_TIER_MIN_COSTS;
  for (let tier = minCosts.length - 1; tier > 0; tier--) {
    if (card.manaCost >= minCosts[tier]) {
      return tier;
    }
  }
  return 0;
};

function keywordMod(modifierClass, name, statsByTier) {
  return {
    getLabel: (tier) => `+ ${name}${statsLabel(statsByTier[tier])}`,
    canApply: (card) => isMinion(card) && !hasKeyword(card, modifierClass),
    apply: (cardData, card, tier) => {
      addModifier(cardData, modifierClass.createContextObject({ isAddedKeyword: true }));
      // cards without a written description already list their keywords
      if (card.getDescription()) {
        addDescriptionPrefix(cardData, name);
      }
      addStat(cardData, card, 'atk', statsByTier[tier][0]);
      addStat(cardData, card, 'maxHP', statsByTier[tier][1]);
    },
  };
}

function addDescriptionReplacement(cardData, from, to) {
  cardData.descriptionReplacements = (cardData.descriptionReplacements || []).concat([[from, to]]);
}

/**
 * Returns the damage properties of a damage spell, ex: Lucent Beam picks its damage from a base and a bonus amount when played.
 */
function getSpellDamageKeys(card) {
  return _.filter(['damageAmount', 'baseDamage', 'bonusDamage'], (key) => _.isNumber(card[key]) && card[key] > 0);
}

/**
 * Returns the indices of a spell's target modifiers that add stats (not stats set to a value, nor stat losses).
 */
function getSpellBuffIndices(card) {
  const contextObjects = card.targetModifiersContextObjects || [];
  return _.filter(_.range(contextObjects.length), (i) => {
    const contextObject = contextObjects[i];
    const buffs = contextObject && contextObject.attributeBuffs;
    return buffs != null
      && _.isEmpty(contextObject.attributeBuffsAbsolute) && _.isEmpty(contextObject.attributeBuffsRebased) && _.isEmpty(contextObject.attributeBuffsFixed)
      && ((buffs.atk || 0) > 0 || (buffs.maxHP || 0) > 0) && (buffs.atk || 0) >= 0 && (buffs.maxHP || 0) >= 0;
  });
}

function spellBuffLabel(card, amount) {
  const buffs = card.targetModifiersContextObjects[getSpellBuffIndices(card)[0]].attributeBuffs;
  if ((buffs.atk || 0) > 0 && (buffs.maxHP || 0) > 0) {
    return `+${amount}/+${amount} Buff`;
  }
  return `+${amount} ${(buffs.atk || 0) > 0 ? 'Attack' : 'Health'} Buff`;
}

function reduceCost(cardData, card, amount) {
  const manaCost = cardData.manaCost != null ? cardData.manaCost : card.manaCost;
  cardData.manaCost = Math.max(0, manaCost - amount);
}

function insightName(tier) {
  return ModifierInsight.getNameForCostReduction(INSIGHT_BY_TIER[tier]);
}

RoguelikeCardMods.mods = {
  // minions
  mixed_stats: {
    getLabel: (tier) => `+${MIXED_STATS_BY_TIER[tier]}/+${MIXED_STATS_BY_TIER[tier]}`,
    canApply: (card, tier) => isMinion(card) && MIXED_STATS_BY_TIER[tier] != null,
    apply: (cardData, card, tier) => {
      addStat(cardData, card, 'atk', MIXED_STATS_BY_TIER[tier]);
      addStat(cardData, card, 'maxHP', MIXED_STATS_BY_TIER[tier]);
    },
  },
  provoke: keywordMod(ModifierProvoke, 'Provoke', PROVOKE_STATS_BY_TIER),
  frenzy: keywordMod(ModifierFrenzy, 'Frenzy', FRENZY_STATS_BY_TIER),
  rush: keywordMod(ModifierFirstBlood, 'Rush', RUSH_STATS_BY_TIER),
  // cheapest minions only
  warp: {
    getLabel: () => '+ Warp',
    canApply: (card, tier) => isMinion(card) && tier === 0 && !hasKeyword(card, ModifierWarp),
    apply: (cardData, card) => {
      addModifier(cardData, ModifierWarp.createContextObject({ isAddedKeyword: true }));
      // cards without a written description already list their keywords
      if (card.getDescription()) {
        addDescriptionPrefix(cardData, 'Warp');
      }
    },
  },
  draw: {
    getLabel: (tier) => `+ ${insightName(tier)}`,
    canApply: isMinion,
    apply: (cardData, card, tier) => {
      addModifier(cardData, ModifierInsight.createContextObject(INSIGHT_BY_TIER[tier], { isAddedKeyword: true }));
      // cards without a written description generate it from their modifiers
      if (card.getDescription()) {
        addDescriptionPrefix(cardData, insightName(tier));
      }
    },
  },

  // spells
  spell_draw: {
    getLabel: (tier) => `+ ${insightName(tier)}`,
    canApply: isSpell,
    apply: (cardData, card, tier) => {
      cardData.insight = INSIGHT_BY_TIER[tier];
      cardData.keywordTypesToInclude = (cardData.keywordTypesToInclude || []).concat(ModifierInsight.type);
      addDescriptionPrefix(cardData, insightName(tier));
    },
  },
  // cheapest spells only, the copy is created with the card's other mods by RoguelikeCardMods.createCardData
  mirror: {
    getLabel: () => '+ Mirror',
    canApply: (card, tier) => isSpell(card) && tier === 0,
    apply: (cardData) => {
      cardData.keywordTypesToInclude = (cardData.keywordTypesToInclude || []).concat(ModifierMirror.type);
      addDescriptionPrefix(cardData, 'Mirror');
    },
  },
  spell_power: {
    getLabel: (tier) => `+${SPELL_POWER_BY_TIER[tier]} Damage`,
    canApply: (card) => isSpell(card) && getSpellDamageKeys(card).length > 0,
    apply: (cardData, card, tier) => {
      const amount = SPELL_POWER_BY_TIER[tier];
      const keys = getSpellDamageKeys(card);
      _.each(keys, (key) => { cardData[key] = card[key] + amount; });
      // highest amounts first, so a replaced amount is never replaced again
      const damageAmounts = _.sortBy(_.uniq(_.map(keys, (key) => card[key])), (damage) => -damage);
      _.each(damageAmounts, (damage) => { addDescriptionReplacement(cardData, `${damage} damage`, `${damage + amount} damage`); });
    },
  },
  spell_buff: {
    getLabel: (tier, card) => spellBuffLabel(card, SPELL_BUFF_BY_TIER[tier]),
    canApply: (card) => isSpell(card) && getSpellBuffIndices(card).length > 0,
    apply: (cardData, card, tier) => {
      const amount = SPELL_BUFF_BY_TIER[tier];
      const contextObjects = JSON.parse(JSON.stringify(card.targetModifiersContextObjects));
      _.each(getSpellBuffIndices(card), (i) => {
        const buffs = contextObjects[i].attributeBuffs;
        const atk = buffs.atk || 0;
        const maxHP = buffs.maxHP || 0;
        if (atk > 0) buffs.atk = atk + amount;
        if (maxHP > 0) buffs.maxHP = maxHP + amount;
        if (i === getSpellBuffIndices(card)[0]) {
          if (atk > 0 && maxHP > 0) addDescriptionReplacement(cardData, `+${atk}/+${maxHP}`, `+${buffs.atk}/+${buffs.maxHP}`);
          if (atk > 0) addDescriptionReplacement(cardData, `+${atk} Attack`, `+${buffs.atk} Attack`);
          if (maxHP > 0) addDescriptionReplacement(cardData, `+${maxHP} Health`, `+${buffs.maxHP} Health`);
        }
      });
      cardData.targetModifiersContextObjects = contextObjects;
    },
  },

  // all cards
  echo: {
    getLabel: () => '+ Echo',
    canApply: (card) => (isMinion(card) || isSpell(card) || card.getType() === CardType.Artifact) && !card.echo,
    apply: (cardData) => {
      cardData.echo = true;
      cardData.keywordTypesToInclude = (cardData.keywordTypesToInclude || []).concat(ModifierEcho.type);
      addDescriptionPrefix(cardData, 'Echo');
    },
  },

  bloodcall: {
    getLabel: () => '+ Bloodcall',
    canApply: (card) => (isMinion(card) || isSpell(card) || card.getType() === CardType.Artifact) && !card.refreshSignatureCardOnPlay,
    apply: (cardData) => {
      cardData.refreshSignatureCardOnPlay = true;
      cardData.keywordTypesToInclude = (cardData.keywordTypesToInclude || []).concat(ModifierBloodcall.type);
      addDescriptionPrefix(cardData, 'Bloodcall');
    },
  },

  // cards costing 3+ only
  patient: {
    getLabel: () => '+ Patient',
    canApply: (card, tier) => (isMinion(card) || isSpell(card) || card.getType() === CardType.Artifact) && tier >= 1 && !hasKeyword(card, ModifierPatient),
    apply: (cardData, card) => {
      addModifier(cardData, ModifierPatient.createContextObject({ isAddedKeyword: true }));
      // cards without a written description already list their keywords
      if (card.getDescription()) {
        addDescriptionPrefix(cardData, 'Patient');
      }
    },
  },

  // spells also have their own cost mod, available on cheap spells
  spell_cost: {
    getLabel: (tier) => `-${SPELL_COST_REDUCTION_BY_TIER[tier]} Cost`,
    canApply: (card) => isSpell(card) && card.manaCost >= 1,
    apply: (cardData, card, tier) => { reduceCost(cardData, card, SPELL_COST_REDUCTION_BY_TIER[tier]); },
  },

  // minions and artifacts
  cost: {
    getLabel: (tier) => `-${COST_REDUCTION_BY_TIER[tier]} Cost`,
    canApply: (card, tier) => !isSpell(card) && card.manaCost >= 1 && COST_REDUCTION_BY_TIER[tier] != null,
    apply: (cardData, card, tier) => { reduceCost(cardData, card, COST_REDUCTION_BY_TIER[tier]); },
  },
};

function normalizeModIds(modIds) {
  return _.map(modIds, (modId) => LEGACY_MOD_IDS[modId] || modId);
}

/**
 * Returns the ids of the mods that can apply to a card.
 * @param {Number} cardId
 * @returns {Array}
 */
RoguelikeCardMods.getApplicableModIds = function (cardId) {
  const card = getBaseCard(cardId);
  if (card == null) {
    return [];
  }
  const tier = RoguelikeCardMods.getCostTier(card);
  return _.filter(_.keys(RoguelikeCardMods.mods), (modId) => RoguelikeCardMods.mods[modId].canApply(card, tier));
};

/**
 * Returns a random mod id that can apply to a card, or null if none can.
 * @param {Number} cardId
 * @returns {String|null}
 */
RoguelikeCardMods.getRandomModId = function (cardId, excludedModIds) {
  return _.sample(RoguelikeCardMods.getUpgradeModIds(cardId, excludedModIds || [])) || null;
};

/**
 * Returns the mod ids that can still be added to a card that already has mods.
 * @param {Number} cardId
 * @param {Array} modIds mods the card already has
 * @returns {Array}
 */
RoguelikeCardMods.getUpgradeModIds = function (cardId, modIds) {
  return _.difference(RoguelikeCardMods.getApplicableModIds(cardId), RoguelikeCardMods.filterModIds(cardId, modIds));
};

/**
 * Returns only the known mods that can apply to a card.
 * @param {Number} cardId
 * @param {Array} modIds
 * @returns {Array}
 */
RoguelikeCardMods.filterModIds = function (cardId, modIds) {
  if (!_.isArray(modIds) || modIds.length === 0) {
    return [];
  }
  // spells looted before spells had their own cost mod use the generic one
  const card = getBaseCard(cardId);
  const normalizedModIds = _.map(normalizeModIds(modIds), (modId) => (modId === 'cost' && card != null && isSpell(card) ? 'spell_cost' : modId));
  return _.intersection(normalizedModIds, RoguelikeCardMods.getApplicableModIds(cardId));
};

/**
 * Returns a display label for a card's mods at the card's cost tier, ex: "+2 Attack, + Provoke +0/+1".
 * @param {Number} cardId
 * @param {Array} modIds
 * @returns {String}
 */
RoguelikeCardMods.getModsLabel = function (cardId, modIds) {
  const validModIds = RoguelikeCardMods.filterModIds(cardId, modIds);
  if (validModIds.length === 0) {
    return '';
  }
  const tier = RoguelikeCardMods.getCostTier(getBaseCard(cardId));
  return _.map(validModIds, (modId) => RoguelikeCardMods.mods[modId].getLabel(tier, getBaseCard(cardId))).join(', ');
};

/**
 * Returns the card data of a card with mods applied, usable in game decks and to create cards for display.
 * Invalid mods are ignored.
 * @param {Number} cardId
 * @param {Array} [modIds]
 * @returns {Object} card data
 */
RoguelikeCardMods.createCardData = function (cardId, modIds) {
  const cardData = { id: cardId };
  const validModIds = RoguelikeCardMods.filterModIds(cardId, modIds);
  if (validModIds.length > 0) {
    const card = getBaseCard(cardId);
    const tier = RoguelikeCardMods.getCostTier(card);
    _.each(validModIds, (modId) => {
      RoguelikeCardMods.mods[modId].apply(cardData, card, tier);
    });
    // mirror copies have the other mods, cost 0 and are ethereal
    if (_.contains(validModIds, 'mirror')) {
      const mirrorCardData = RoguelikeCardMods.createCardData(cardId, _.without(validModIds, 'mirror'));
      mirrorCardData.manaCost = 0;
      addModifier(mirrorCardData, ModifierEthereal.createContextObject({ isAddedKeyword: true }));
      addDescriptionPrefix(mirrorCardData, 'Ethereal');
      cardData.mirrorCardData = mirrorCardData;
    }
    // copies of the card (ex: eggs hatching) keep its mods
    cardData.copyCardData = JSON.parse(JSON.stringify(cardData));
  }
  return cardData;
};

module.exports = RoguelikeCardMods;
