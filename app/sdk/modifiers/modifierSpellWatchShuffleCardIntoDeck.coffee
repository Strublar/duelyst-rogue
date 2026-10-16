ModifierSpellWatch = require './modifierSpellWatch'
PutCardInDeckAction = require 'app/sdk/actions/putCardInDeckAction'
Cards = require 'app/sdk/cards/cardsLookupComplete'

###
  Whenever you cast a spell (other than the shuffled card itself), shuffle a card into your deck.
###
class ModifierSpellWatchShuffleCardIntoDeck extends ModifierSpellWatch

  type:"ModifierSpellWatchShuffleCardIntoDeck"
  @type:"ModifierSpellWatchShuffleCardIntoDeck"

  fxResource: ["FX.Modifiers.ModifierSpellWatch", "FX.Modifiers.ModifierGenericBuff"]

  @createContextObject: (cardDataOrIndexToSpawn, numOfCopies=1, options=undefined) ->
    contextObject = super(options)
    contextObject.cardDataOrIndexToSpawn = cardDataOrIndexToSpawn
    contextObject.numOfCopies = numOfCopies
    return contextObject

  onSpellWatch: (action) ->
    spellCard = action.getCard()
    if @cardDataOrIndexToSpawn? and @numOfCopies > 0 and spellCard?.getBaseCardId() != Cards.getBaseCardId(@cardDataOrIndexToSpawn.id)
      for i in [0...@numOfCopies]
        @getGameSession().executeAction(new PutCardInDeckAction(@getGameSession(), @getCard().getOwnerId(), @cardDataOrIndexToSpawn))

module.exports = ModifierSpellWatchShuffleCardIntoDeck
