Modifier = require './modifier'
RemoveCardFromHandAction = require 'app/sdk/actions/removeCardFromHandAction'

###
  Ethereal: the card is discarded at the end of its owner's turn if it is still in hand.
###
class ModifierEthereal extends Modifier

  type: "ModifierEthereal"
  @type: "ModifierEthereal"

  @isKeyworded: true
  @keywordDefinition: "Discarded at the end of your turn if it is still in your hand."

  @modifierName: "Ethereal"
  @description: null
  isRemovable: false

  activeInHand: true
  activeInDeck: false
  activeInSignatureCards: false
  activeOnBoard: false

  fxResource: ["FX.Modifiers.ModifierEphemeral"]

  onEndTurn: (e) ->
    super(e)

    if @getGameSession().getCurrentPlayer().getPlayerId() is @getCard().getOwnerId()
      handIndex = @getCard().getOwner().getDeck().getHand().indexOf(@getCard().getIndex())
      if handIndex != -1
        @getGameSession().executeAction(new RemoveCardFromHandAction(@getGameSession(), handIndex, @getCard().getOwnerId()))

module.exports = ModifierEthereal
