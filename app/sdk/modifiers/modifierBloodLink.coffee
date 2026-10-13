Modifier = require './modifier'
PlaySignatureCardAction = require 'app/sdk/actions/playSignatureCardAction'
DrawCardAction = require 'app/sdk/actions/drawCardAction'
CardType = require 'app/sdk/cards/cardType'

###
  Blood Link: when you cast your Bloodbound Spell, draw one copy of this card from your deck.
  Watches from the deck, and only the first linked copy of a card in the deck is drawn.
###
class ModifierBloodLink extends Modifier

  type: "ModifierBloodLink"
  @type: "ModifierBloodLink"

  @isKeyworded: true
  @keywordDefinition: "When you cast your Bloodbound Spell, draw a copy of this card from your deck."

  @modifierName: "Blood Link"
  @description: null

  activeInHand: false
  activeInDeck: true
  activeInSignatureCards: false
  activeOnBoard: false

  fxResource: ["FX.Modifiers.ModifierSynergize"]

  onAfterCleanupAction: (e) ->
    super(e)

    action = e.action

    # watch for my Bloodbound Spell being cast
    if action instanceof PlaySignatureCardAction and action.getOwnerId() is @getCard().getOwnerId() and action.getCard()?.type is CardType.Spell
      # only one copy is drawn: the first linked copy of this card in the deck
      deck = @getCard().getOwner().getDeck()
      for cardIndex in deck.getDrawPile()
        card = @getGameSession().getCardByIndex(cardIndex)
        if card? and card.getBaseCardId() == @getCard().getBaseCardId() and card.hasModifierType(ModifierBloodLink.type)
          if card is @getCard()
            drawCardAction = new DrawCardAction(@getGameSession(), @getCard().getOwnerId())
            drawCardAction.setCardIndexFromDeck(@getCard().getIndex())
            @getGameSession().executeAction(drawCardAction)
          break

module.exports = ModifierBloodLink
