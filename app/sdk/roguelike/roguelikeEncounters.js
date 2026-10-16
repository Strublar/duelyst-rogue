const _ = require('underscore');
const Cards = require('app/sdk/cards/cardsLookupComplete');

/**
 * Roguelike run encounters, one per difficulty level (1 to 10).
 * Fight N of a run uses the level N encounter; past level 10 encounters loop with extra general health.
 *
 * Encounter format: {
 *   level: number,
 *   name: string,
 *   generalId: cardId,
 *   generalAtk: number, // overrides the general's base attack
 *   generalHP: number, // overrides the general's base health
 *   aiDifficulty: number, // 0.0 to 1.0
 *   bonusReward: string, // optional reward after the card drop, defaults to DEFAULT_BONUS_REWARD (null for none)
 *   cardMods: {cardId: [modId, ...]}, // optional roguelike card mods given to every copy of a card in the deck
 *   deck: [cardId, ...] // cards excluding the general
 * }
 */

const RoguelikeEncounters = {};

RoguelikeEncounters.LOOP_BONUS_HP = 10;

// player general progression by fight (fight N is played after N - 1 wins): health, attack and starting mana
// fights past the table use its last row, with health still growing per win
// see roguelike_csv/hero_progression.csv for the design table
RoguelikeEncounters.PLAYER_HP_PER_WIN_PAST_TABLE = 2;
RoguelikeEncounters.playerProgression = [
  { hp: 10, atk: 2, mana: 2 }, // fight 1
  { hp: 12, atk: 2, mana: 2 }, // fight 2
  { hp: 14, atk: 2, mana: 2 }, // fight 3
  { hp: 16, atk: 3, mana: 2 }, // fight 4
  { hp: 18, atk: 3, mana: 2 }, // fight 5
  { hp: 20, atk: 3, mana: 3 }, // fight 6
  { hp: 22, atk: 3, mana: 3 }, // fight 7
  { hp: 24, atk: 4, mana: 3 }, // fight 8
  { hp: 26, atk: 4, mana: 3 }, // fight 9
  { hp: 28, atk: 4, mana: 3 }, // fight 10
  { hp: 30, atk: 4, mana: 3 }, // fight 11
  { hp: 32, atk: 4, mana: 3 }, // fight 12
  { hp: 34, atk: 4, mana: 3 }, // fight 13
  { hp: 36, atk: 4, mana: 3 }, // fight 14
  { hp: 38, atk: 4, mana: 3 }, // fight 15
  { hp: 40, atk: 4, mana: 3 }, // fight 16
  { hp: 42, atk: 4, mana: 3 }, // fight 17
  { hp: 44, atk: 4, mana: 3 }, // fight 18
  { hp: 46, atk: 4, mana: 3 }, // fight 19
  { hp: 48, atk: 4, mana: 3 }, // fight 20
];

// copies of each looted card
RoguelikeEncounters.LOOT_COPIES = 3;

// bonus rewards given after the card drop of a won encounter
RoguelikeEncounters.BonusReward = {
  Upgrade: 'upgrade', // add a mod to a card already in the deck
};
RoguelikeEncounters.DEFAULT_BONUS_REWARD = RoguelikeEncounters.BonusReward.Upgrade;

function copies(cardId, count) {
  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push(cardId);
  }
  return cards;
}

function pairs(cardIds) {
  return cardIds.reduce((deck, cardId) => deck.concat(copies(cardId, 2)), []);
}

RoguelikeEncounters.encounters = [
  {
    level: 1,
    name: 'Bandit Camp',
    generalId: Cards.Boss.RoguelikeRagtooth,
    generalAtk: 1,
    generalHP: 10,
    aiDifficulty: 0.1,
    deck: pairs([
      Cards.Neutral.PlanarScout,
      Cards.Neutral.RockPulverizer,
      Cards.Neutral.SaberspineTiger,
      Cards.Neutral.BloodtearAlchemist,
      Cards.Neutral.HealingMystic,
      Cards.Neutral.KomodoCharger,
      Cards.Neutral.PrimusShieldmaster,
      Cards.Neutral.BluetipScorpion,
      Cards.Neutral.ValeHunter,
      Cards.Neutral.SilvertongueCorsair,
    ]),
  },
  {
    level: 2,
    name: 'Desert Raiders',
    generalId: Cards.Faction3.General,
    generalAtk: 2,
    generalHP: 14,
    aiDifficulty: 0.2,
    cardMods: {
      [Cards.Faction3.Pyromancer]: ['rush'],
      [Cards.Faction3.SandHowler]: ['mixed_stats'],
    },
    deck: pairs([
      Cards.Faction3.SandHowler,
      Cards.Faction3.Pyromancer,
      Cards.Faction3.StarfireScarab,
      Cards.Faction3.Dunecaster,
      Cards.Faction3.PortalGuardian,
      Cards.Faction3.BrazierRedSand,
      Cards.Faction3.WindSlicer,
      Cards.Faction3.AymaraHealer,
      Cards.Spell.Blindscorch,
      Cards.Spell.StarsFury,
    ]),
  },
  {
    level: 3,
    name: 'Wraith Cult',
    generalId: Cards.Faction4.General,
    generalAtk: 2,
    generalHP: 19,
    aiDifficulty: 0.3,
    cardMods: {
      [Cards.Faction4.GloomChaser]: ['echo'],
      [Cards.Faction4.BloodmoonPriestess]: ['provoke'],
      [Cards.Spell.WraithlingSwarm]: ['spell_draw'],
      [Cards.Spell.DaemonicLure]: ['spell_power'],
    },
    deck: pairs([
      Cards.Faction4.AbyssalCrawler,
      Cards.Faction4.BloodmoonPriestess,
      Cards.Faction4.GloomChaser,
      Cards.Faction4.DarkspineElemental,
      Cards.Faction4.NightsorrowAssassin,
      Cards.Faction4.ShadowWatcher,
      Cards.Faction4.Furosa,
      Cards.Spell.WraithlingSwarm,
      Cards.Spell.ShadowNova,
      Cards.Spell.DaemonicLure,
    ]),
  },
  {
    level: 4,
    name: 'Frozen Wastes',
    generalId: Cards.Boss.Boss1,
    generalAtk: 2,
    generalHP: 23,
    aiDifficulty: 0.4,
    cardMods: {
      [Cards.Spell.FlashFreeze]: ['mirror'],
      [Cards.Faction6.Icy]: ['provoke'],
      [Cards.Neutral.HailstoneGolem]: ['provoke'],
      [Cards.Spell.GravityWell]: ['spell_draw'],
      [Cards.Spell.ChromaticCold]: ['spell_power'],
    },
    deck: pairs([
      Cards.Faction6.CrystalCloaker,
      Cards.Faction6.HearthSister,
      Cards.Faction6.Icy,
      Cards.Faction6.WyrBeast,
      Cards.Faction6.ArcticDisplacer,
      Cards.Neutral.HailstoneGolem,
      Cards.Spell.FlashFreeze,
      Cards.Spell.ChromaticCold,
      Cards.Spell.BlazingSpines,
      Cards.Spell.GravityWell,
    ]),
  },
  {
    level: 5,
    name: 'Mechaz0r Workshop',
    generalId: Cards.Boss.Boss7,
    generalAtk: 2,
    generalHP: 28,
    aiDifficulty: 0.5,
    cardMods: {
      [Cards.Neutral.Mechaz0rHelm]: ['cost'],
      [Cards.Neutral.Mechaz0rWings]: ['cost'],
      [Cards.Neutral.Mechaz0rCannon]: ['cost'],
      [Cards.Neutral.Mechaz0rChassis]: ['provoke'],
      [Cards.Neutral.Metaltooth]: ['mixed_stats'],
      [Cards.Neutral.Replicant]: ['echo'],
    },
    deck: [].concat(
      copies(Cards.Neutral.Mechaz0rHelm, 3),
      copies(Cards.Neutral.Mechaz0rWings, 3),
      copies(Cards.Neutral.Mechaz0rCannon, 3),
      copies(Cards.Neutral.Mechaz0rSword, 3),
      copies(Cards.Neutral.Mechaz0rChassis, 3),
      copies(Cards.Neutral.Metaltooth, 2),
      copies(Cards.Neutral.Replicant, 2),
      copies(Cards.Neutral.Ironclad, 1),
    ),
  },
  {
    level: 6,
    name: 'Golem Quarry',
    generalId: Cards.Boss.Boss8,
    generalAtk: 2,
    generalHP: 32,
    aiDifficulty: 0.6,
    cardMods: {
      [Cards.Neutral.GolemMetallurgist]: ['draw'],
      [Cards.Neutral.SkyrockGolem]: ['mixed_stats'],
      [Cards.Neutral.BloodshardGolem]: ['provoke'],
      [Cards.Neutral.HailstoneGolem]: ['mixed_stats'],
      [Cards.Neutral.BrightmossGolem]: ['provoke'],
      [Cards.Neutral.StormmetalGolem]: ['cost'],
      [Cards.Neutral.RazorcragGolem]: ['frenzy'],
    },
    deck: pairs([
      Cards.Neutral.GolemMetallurgist,
      Cards.Neutral.BrightmossGolem,
      Cards.Neutral.StormmetalGolem,
      Cards.Neutral.DragoneboneGolem,
      Cards.Neutral.SkyrockGolem,
      Cards.Neutral.HailstoneGolem,
      Cards.Neutral.BloodshardGolem,
      Cards.Neutral.GolemVanquisher,
      Cards.Neutral.RazorcragGolem,
      Cards.Neutral.DiamondGolem,
    ]),
  },
  {
    level: 7,
    name: 'Primal Jungle',
    generalId: Cards.Boss.Boss18,
    generalAtk: 3,
    generalHP: 37,
    aiDifficulty: 0.7,
    cardMods: {
      [Cards.Spell.GreaterFortitude]: ['spell_buff', 'mirror'],
      [Cards.Faction5.Kujata]: ['echo'],
      [Cards.Faction5.Phalanxar]: ['rush'],
      [Cards.Faction5.YoungSilithar]: ['mixed_stats'],
      [Cards.Faction5.EarthWalker]: ['mixed_stats'],
      [Cards.Faction5.MolokiHuntress]: ['draw'],
      [Cards.Spell.EggMorph]: ['spell_draw'],
    },
    deck: pairs([
      Cards.Faction5.YoungSilithar,
      Cards.Faction5.EarthWalker,
      Cards.Faction5.Kujata,
      Cards.Faction5.PrimordialGazer,
      Cards.Faction5.Grimrock,
      Cards.Faction5.MolokiHuntress,
      Cards.Faction5.Phalanxar,
      Cards.Spell.GreaterFortitude,
      Cards.Spell.NaturalSelection,
      Cards.Spell.EggMorph,
    ]),
  },
  {
    level: 8,
    name: 'Shadow Dojo',
    generalId: Cards.Boss.Boss25,
    generalAtk: 3,
    generalHP: 41,
    aiDifficulty: 0.8,
    cardMods: {
      [Cards.Spell.PhoenixFire]: ['spell_power'],
      [Cards.Spell.MistDragonSeal]: ['spell_buff', 'mirror'],
      [Cards.Spell.InnerFocus]: ['spell_draw'],
      [Cards.Spell.Juxtaposition]: ['mirror'],
      [Cards.Faction2.KaidoAssassin]: ['rush'],
      [Cards.Faction2.Heartseeker]: ['echo'],
      [Cards.Faction2.ChakriAvatar]: ['mixed_stats'],
    },
    deck: pairs([
      Cards.Faction2.KaidoAssassin,
      Cards.Faction2.ScarletViper,
      Cards.Faction2.GoreHorn,
      Cards.Faction2.ChakriAvatar,
      Cards.Faction2.Widowmaker,
      Cards.Faction2.Heartseeker,
      Cards.Spell.Juxtaposition,
      Cards.Spell.MistDragonSeal,
      Cards.Spell.InnerFocus,
      Cards.Spell.PhoenixFire,
    ]),
  },
  {
    level: 9,
    name: 'Arcane Academy',
    generalId: Cards.Boss.Boss26,
    generalAtk: 2,
    generalHP: 46,
    aiDifficulty: 0.9,
    cardMods: {
      [Cards.Spell.TrueStrike]: ['spell_power', 'mirror'],
      [Cards.Spell.PhoenixFire]: ['spell_power'],
      [Cards.Spell.FlashFreeze]: ['echo'],
      [Cards.Spell.ChromaticCold]: ['spell_draw'],
      [Cards.Neutral.Manaforger]: ['draw'],
      [Cards.Neutral.PrismaticIllusionist]: ['mixed_stats'],
      [Cards.Neutral.AlcuinLoremaster]: ['draw'],
      [Cards.Neutral.OwlbeastSage]: ['provoke'],
    },
    deck: pairs([
      Cards.Neutral.PrismaticIllusionist,
      Cards.Neutral.Manaforger,
      Cards.Neutral.OwlbeastSage,
      Cards.Neutral.Spelljammer,
      Cards.Neutral.AlcuinLoremaster,
      Cards.Neutral.SunSeer,
      Cards.Spell.PhoenixFire,
      Cards.Spell.TrueStrike,
      Cards.Spell.ChromaticCold,
      Cards.Spell.FlashFreeze,
    ]),
  },
  {
    level: 10,
    name: 'The Void',
    generalId: Cards.Boss.Boss16,
    generalAtk: 2,
    generalHP: 50,
    aiDifficulty: 1.0,
    cardMods: {
      [Cards.Spell.DarkTransformation]: ['spell_cost'],
      [Cards.Spell.ShadowNova]: ['spell_draw'],
      [Cards.Spell.DaemonicLure]: ['spell_power', 'mirror'],
      [Cards.Neutral.VoidHunter]: ['rush'],
      [Cards.Faction4.BlackSolus]: ['provoke'],
      [Cards.Faction4.SpectralRevenant]: ['mixed_stats'],
      [Cards.Faction4.VorpalReaver]: ['provoke'],
      [Cards.Faction4.AbyssalJuggernaut]: ['mixed_stats'],
      [Cards.Faction4.DarkSiren]: ['echo'],
      [Cards.Faction4.Nightshroud]: ['frenzy'],
    },
    deck: pairs([
      Cards.Faction4.SpectralRevenant,
      Cards.Faction4.BlackSolus,
      Cards.Faction4.AbyssalJuggernaut,
      Cards.Faction4.VorpalReaver,
      Cards.Faction4.DarkSiren,
      Cards.Faction4.Nightshroud,
      Cards.Neutral.VoidHunter,
      Cards.Spell.DarkTransformation,
      Cards.Spell.ShadowNova,
      Cards.Spell.DaemonicLure,
    ]),
  },
];

/**
 * Returns the encounter for a fight number (1-based), looping past the last encounter with extra general health.
 * @param {Number} fightNumber
 * @returns {Object} encounter copy with a `loop` property (0 for the first pass)
 */
RoguelikeEncounters.getEncounterForFight = function (fightNumber) {
  const numEncounters = RoguelikeEncounters.encounters.length;
  const index = Math.max(0, fightNumber - 1);
  const loop = Math.floor(index / numEncounters);
  const encounter = RoguelikeEncounters.encounters[index % numEncounters];
  return _.extend({}, encounter, {
    loop,
    generalHP: encounter.generalHP + loop * RoguelikeEncounters.LOOP_BONUS_HP,
    aiDifficulty: loop > 0 ? 1.0 : encounter.aiDifficulty,
  });
};

/**
 * Returns the bonus reward for winning an encounter, or null if there is none.
 * @param {Object} encounter
 * @returns {String|null}
 */
RoguelikeEncounters.getBonusReward = function (encounter) {
  return encounter.bonusReward !== undefined ? encounter.bonusReward : RoguelikeEncounters.DEFAULT_BONUS_REWARD;
};

/**
 * Returns the player general's stats for the next fight of a run with a number of wins.
 * @param {Number} wins
 * @returns {Object} {hp, atk, mana}
 */
RoguelikeEncounters.getPlayerProgressionForWins = function (wins) {
  const table = RoguelikeEncounters.playerProgression;
  const index = Math.max(0, wins);
  if (index < table.length) {
    return _.clone(table[index]);
  }
  const last = table[table.length - 1];
  return _.extend({}, last, { hp: last.hp + (index - (table.length - 1)) * RoguelikeEncounters.PLAYER_HP_PER_WIN_PAST_TABLE });
};

/**
 * Returns the card data of an encounter deck (excluding the general), with card mods applied.
 * @param {Object} encounter
 * @returns {Array}
 */
RoguelikeEncounters.getDeckCardsData = function (encounter) {
  // required lazily as card mods need the card caches
  const RoguelikeCardMods = require('app/sdk/roguelike/roguelikeCardMods');
  const cardMods = encounter.cardMods || {};
  return _.map(encounter.deck, (cardId) => RoguelikeCardMods.createCardData(cardId, cardMods[cardId] || []));
};

module.exports = RoguelikeEncounters;
