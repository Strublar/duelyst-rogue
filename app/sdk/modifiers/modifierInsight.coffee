DrawCardAction = require 'app/sdk/actions/drawCardAction'
ModifierOpeningGambit = require 'app/sdk/modifiers/modifierOpeningGambit'
ModifierManaCostChange = require 'app/sdk/modifiers/modifierManaCostChange'

###
  Insight (X): when played, draw a card. Insight X: the drawn card costs X less.
  Minions trigger it as an opening gambit, spells through Spell.insight.
###
class ModifierInsight extends ModifierOpeningGambit

  type: "ModifierInsight"
  @type: "ModifierInsight"

  @isKeyworded: true
  @keywordHasValue: true
  @keywordDefinition: "When played, draw a card. Insight X: the drawn card costs X less."

  @modifierName: "Insight"
  @description: null

  fxResource: ["FX.Modifiers.ModifierOpeningGambit"]

  costReduction: 0

  @createContextObject: (costReduction=0, options) ->
    contextObject = super(options)
    contextObject.costReduction = costReduction
    return contextObject

  @getName: (contextObject) ->
    return @getNameForCostReduction(contextObject?.costReduction)

  @getNameForCostReduction: (costReduction) ->
    return if costReduction > 0 then @modifierName + " " + costReduction else @modifierName

  ###*
   * Draws cards for a player, reducing the cost of each drawn card.
   * Draws are executed after the current action, so the cards are picked and reduced while still in the deck.
  ###
  @drawCards: (gameSession, ownerId, numCards, costReduction) ->
    cardIndicesToDraw = []
    if costReduction > 0
      drawPile = gameSession.getPlayerById(ownerId).getDeck().getDrawPile().slice(0)
      for [0...Math.min(numCards, drawPile.length)]
        cardIndex = drawPile.splice(gameSession.getRandomIntegerForExecution(drawPile.length), 1)[0]
        cardToDraw = gameSession.getCardByIndex(cardIndex)
        if cardToDraw?
          gameSession.applyModifierContextObject(ModifierManaCostChange.createContextObject(-costReduction), cardToDraw)
        cardIndicesToDraw.push(cardIndex)

    for i in [0...numCards]
      drawCardAction = new DrawCardAction(gameSession, ownerId)
      if cardIndicesToDraw[i]?
        drawCardAction.setCardIndexFromDeck(cardIndicesToDraw[i])
      gameSession.executeAction(drawCardAction)

  onOpeningGambit: () ->
    ModifierInsight.drawCards(@getGameSession(), @getCard().getOwnerId(), 1, @costReduction)

module.exports = ModifierInsight
