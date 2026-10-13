Modifier = require './modifier'
UtilsGameSession = require 'app/common/utils/utils_game_session'
ReplaceCardFromHandAction = require 'app/sdk/actions/replaceCardFromHandAction'
PlayCardSilentlyAction = require 'app/sdk/actions/playCardSilentlyAction'

###
  Warp: when this minion is replaced from hand, summon it in front of your General (if that space is free).
###
class ModifierWarp extends Modifier

  type: "ModifierWarp"
  @type: "ModifierWarp"

  @isKeyworded: true
  @keywordDefinition: "When you replace this minion, summon it in front of your General."

  @modifierName: "Warp"
  @description: null

  activeInHand: true
  activeInDeck: true
  activeInSignatureCards: false
  activeOnBoard: false

  fxResource: ["FX.Modifiers.ModifierBuffSelfOnReplace"]

  onAction: (e) ->
    super(e)

    action = e.action

    # watch for my player replacing THIS card
    if action instanceof ReplaceCardFromHandAction and action.getOwnerId() is @getCard().getOwnerId()
      replacedCard = @getGameSession().getExistingCardFromIndexOrCreateCardFromData(action.replacedCardIndex)
      if replacedCard is @getCard()
        # summon it on the space in front of the owner's General, i.e. towards the opponent
        general = @getGameSession().getGeneralForPlayerId(@getCard().getOwnerId())
        frontOffset = if @getCard().isOwnedByPlayer1() then 1 else -1
        spawnPositions = UtilsGameSession.getSmartSpawnPositionsFromPattern(@getGameSession(), general.getPosition(), [{x: frontOffset, y: 0}], @getCard())
        if spawnPositions.length > 0
          playCardAction = new PlayCardSilentlyAction(@getGameSession(), @getCard().getOwnerId(), spawnPositions[0].x, spawnPositions[0].y, @getCard().getIndex())
          @getGameSession().executeAction(playCardAction)

module.exports = ModifierWarp
