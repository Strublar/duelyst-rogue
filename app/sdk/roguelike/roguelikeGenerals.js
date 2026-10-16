const _ = require('underscore');
const Cards = require('app/sdk/cards/cardsLookupComplete');
const FactionFactory = require('app/sdk/cards/factionFactory');

/**
 * Roguelike heroes: a run starts with a choice between the 3 generals of the chosen faction.
 * Each general has its own starting deck and may replace its Bloodbound Spell.
 * See roguelike_csv/generals/ for the design tables (one per general).
 *
 * General format: {
 *   signatureCardId: cardId, // replaces the general's Bloodbound Spell (null keeps its own)
 *   cards: [[cardId, copies], ...], // starting deck excluding the general
 *   signatureSpawnDeckCardId: cardId, // optional, the Bloodbound Spell summons this card with the mods it has in the deck
 * }
 */

const RoguelikeGenerals = {};

RoguelikeGenerals.generals = {};

function general(generalId, signatureCardId, cards, options) {
  RoguelikeGenerals.generals[generalId] = _.extend({ signatureCardId, cards }, options);
}

// Argeon Highmayne
general(Cards.Faction1.General, null, [
  [Cards.Faction1.WindbladeAdept, 3],
  [Cards.Spell.DauntlessAdvance, 3],
  [Cards.Spell.Afterblaze, 3],
  [Cards.Faction1.SilverguardKnight, 3],
  [Cards.Faction1.SuntideMaiden, 3],
]);
// Zir'An Sunforge
general(Cards.Faction1.AltGeneral, null, [
  [Cards.Spell.SundropElixir, 3],
  [Cards.Faction1.Lightchaser, 3],
  [Cards.Spell.LucentBeam, 3],
  [Cards.Neutral.SunSeer, 3],
  [Cards.Faction1.Sunriser, 3],
]);
// Brome Warcrest
general(Cards.Faction1.ThirdGeneral, null, [
  [Cards.Faction1.WindbladeAdept, 3],
  [Cards.Faction1.LysianBrawler, 3],
  [Cards.Spell.TrueStrike, 3],
  [Cards.Spell.WarSurge, 3],
  [Cards.Neutral.PrimusShieldmaster, 3],
]);
// Kaleos Xaan
general(Cards.Faction2.General, null, [
  [Cards.Faction2.KaidoAssassin, 3],
  [Cards.Spell.KillingEdge, 3],
  [Cards.Faction2.GoreHorn, 3],
  [Cards.Spell.MistDragonSeal, 3],
  [Cards.Spell.Backstabbery, 3], // Obscuring Blow
]);
// Reva Eventide
general(Cards.Faction2.AltGeneral, Cards.Spell.ArcaneHeart, [
  [Cards.Faction2.Heartseeker, 3],
  [Cards.Spell.SaberspineSeal, 3],
  [Cards.Faction2.KiBeholder, 3],
  [Cards.Spell.TwinStrike, 3],
  [Cards.Faction2.Widowmaker, 3],
], { signatureSpawnDeckCardId: Cards.Faction2.Heartseeker });
// Shidai Stormblossom
general(Cards.Faction2.ThirdGeneral, null, [
  [Cards.Spell.Gotatsu, 3],
  [Cards.Faction2.ChakriAvatar, 3],
  [Cards.Spell.PhoenixFire, 3],
  [Cards.Faction2.Suzumebachi, 3],
  [Cards.Faction2.MageOfFourWinds, 3],
]);
// Zirix Starstrider
general(Cards.Faction3.General, null, [
  [Cards.Faction3.Pyromancer, 3],
  [Cards.Faction3.WindShrike, 3],
  [Cards.Spell.ScionsFirstWish, 3],
  [Cards.Spell.EntropicDecay, 3],
  [Cards.Neutral.PrimusShieldmaster, 3],
]);
// Scioness Sajj
general(Cards.Faction3.AltGeneral, null, [
  [Cards.Faction3.Pyromancer, 3],
  [Cards.Faction3.WindShrike, 3],
  [Cards.Spell.ScionsFirstWish, 3],
  [Cards.Spell.EntropicDecay, 3],
  [Cards.Neutral.PrimusShieldmaster, 3],
]);
// Ciphyron Ascendant
general(Cards.Faction3.ThirdGeneral, null, [
  [Cards.Faction3.Pyromancer, 3],
  [Cards.Faction3.WindShrike, 3],
  [Cards.Spell.ScionsFirstWish, 3],
  [Cards.Spell.EntropicDecay, 3],
  [Cards.Neutral.PrimusShieldmaster, 3],
]);
// Lilithe Blightchaser
general(Cards.Faction4.General, null, [
  [Cards.Faction4.Furosa, 3], // Furiosa
  [Cards.Faction4.GloomChaser, 3],
  [Cards.Spell.AbyssianStrength, 3], // Wraithling Fury
  [Cards.Spell.WraithlingSwarm, 3],
  [Cards.Faction4.BloodmoonPriestess, 3], // Bloodtide Priestess
]);
// Cassyva Soulreaper
general(Cards.Faction4.AltGeneral, null, [
  [Cards.Faction4.GloomChaser, 3],
  [Cards.Faction4.ShadowWatcher, 3],
  [Cards.Spell.WraithlingSwarm, 3],
  [Cards.Spell.DarkTransformation, 3],
  [Cards.Neutral.ThornNeedler, 3],
]);
// Maehv Skinsolder
general(Cards.Faction4.ThirdGeneral, null, [
  [Cards.Faction4.GloomChaser, 3],
  [Cards.Faction4.ShadowWatcher, 3],
  [Cards.Spell.WraithlingSwarm, 3],
  [Cards.Spell.DarkTransformation, 3],
  [Cards.Neutral.ThornNeedler, 3],
]);
// Vaath the Immortal
general(Cards.Faction5.General, null, [
  [Cards.Spell.DampeningWave, 3],
  [Cards.Faction5.Rancour, 3],
  [Cards.Spell.VaathsBrutality, 3],
  [Cards.Faction5.Thraex, 3],
  [Cards.Neutral.SilhoutteTracer, 3],
]);
// Starhorn the Seeker
general(Cards.Faction5.AltGeneral, null, [
  [Cards.Spell.FlashReincarnation, 3],
  [Cards.Spell.Amplification, 3],
  [Cards.Faction5.Kujata, 3],
  [Cards.Faction5.EarthSister, 3], // Earth Sister Taygete
  [Cards.Faction5.MakantorWarbeast, 3],
]);
// Ragnora the Relentless
general(Cards.Faction5.ThirdGeneral, null, [
  [Cards.Spell.LavaLance, 3],
  [Cards.Spell.Reggplicate, 3], // Mitotic Induction
  [Cards.Faction5.YoungSilithar, 3],
  [Cards.Faction5.VeteranSilithar, 3],
  [Cards.Faction5.WildInceptor, 3],
]);
// Faie Bloodwing
general(Cards.Faction6.General, null, [
  [Cards.Faction6.CrystalCloaker, 3],
  [Cards.Faction6.ArcticDisplacer, 3],
  [Cards.Spell.FlashFreeze, 3],
  [Cards.Spell.PermafrostShield, 3],
  [Cards.Neutral.FlameWing, 3],
]);
// Kara Winterblade
general(Cards.Faction6.AltGeneral, null, [
  [Cards.Faction6.CrystalWisp, 3],
  [Cards.Spell.IceCage, 3], // Hailstone Prison
  [Cards.Spell.ManaDeathgrip, 3],
  [Cards.Neutral.Thunderhorn, 3],
  [Cards.Neutral.WarTalon, 3],
]);
// Ilena Cryobyte
general(Cards.Faction6.ThirdGeneral, null, [
  [Cards.Spell.FlashFreeze, 3],
  [Cards.Faction6.FrostbladeFiend, 3], // Cryoblade
  [Cards.Spell.FrigidCorona, 3],
  [Cards.Faction6.SnowElemental, 3], // Glacial Elemental
  [Cards.Faction6.SleetDasher, 3],
]);

/**
 * Returns the general ids offered when starting a run with a faction (primary, secondary then tertiary).
 * @param {Number} factionId
 * @returns {Array}
 */
RoguelikeGenerals.getGeneralIdsForFaction = function (factionId) {
  const orders = [FactionFactory.GeneralOrder.Primary, FactionFactory.GeneralOrder.Secondary, FactionFactory.GeneralOrder.Tertiary];
  return _.filter(_.map(orders, (order) => FactionFactory.generalIdForFactionByOrder(factionId, order)), (generalId) => RoguelikeGenerals.generals[generalId] != null);
};

/**
 * Returns the starting deck card ids of a general (excluding the general).
 * @param {Number} generalId
 * @returns {Array}
 */
RoguelikeGenerals.getStartingDeckCardIds = function (generalId) {
  const generalData = RoguelikeGenerals.generals[generalId];
  if (generalData == null) {
    return [];
  }
  return _.reduce(generalData.cards, (cardIds, [cardId, copies]) => cardIds.concat(_.times(copies, () => cardId)), []);
};

/**
 * Returns the Bloodbound Spell card data replacing a general's own, or null if it keeps its own.
 * @param {Number} generalId
 * @param {Array} deckCardsData run deck card data (with mods)
 * @returns {Object|null}
 */
RoguelikeGenerals.getSignatureCardDataOverride = function (generalId, deckCardsData) {
  const generalData = RoguelikeGenerals.generals[generalId];
  if (generalData == null || generalData.signatureCardId == null) {
    return null;
  }
  const signatureCardData = { id: generalData.signatureCardId };
  if (generalData.signatureSpawnDeckCardId != null) {
    // summon the deck card with its mods
    const deckCardData = _.find(deckCardsData, (cardData) => cardData != null && cardData.id === generalData.signatureSpawnDeckCardId);
    signatureCardData.cardDataOrIndexToSpawn = deckCardData != null ? JSON.parse(JSON.stringify(deckCardData)) : { id: generalData.signatureSpawnDeckCardId };
  }
  return signatureCardData;
};

/**
 * Returns the Bloodbound Spell card id of a general during runs.
 * @param {Number} generalId
 * @returns {Number|null}
 */
RoguelikeGenerals.getSignatureCardId = function (generalId) {
  const generalData = RoguelikeGenerals.generals[generalId];
  if (generalData != null && generalData.signatureCardId != null) {
    return generalData.signatureCardId;
  }
  // required lazily to avoid a circular dependency with the sdk
  const GameSession = require('app/sdk/gameSession');
  const generalCard = GameSession.getCardCaches().getCardById(generalId);
  const signatureCardData = generalCard != null ? generalCard.getBaseSignatureCardData() : null;
  return signatureCardData != null ? signatureCardData.id : null;
};

module.exports = RoguelikeGenerals;
