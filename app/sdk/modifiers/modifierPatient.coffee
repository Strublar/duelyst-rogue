Modifier = require './modifier'
ModifierManaCostChange = require 'app/sdk/modifiers/modifierManaCostChange'

###
  Patient: at the end of your turn, this card costs 1 less while it is in your hand (stacks each turn).
###
class ModifierPatient extends Modifier

  type: "ModifierPatient"
  @type: "ModifierPatient"

  @isKeyworded: true
  @keywordDefinition: "At the end of your turn, if this card is in your hand, it costs 1 less."

  @modifierName: "Patient"
  @description: null

  activeInHand: true
  activeInDeck: false
  activeInSignatureCards: false
  activeOnBoard: false

  fxResource: ["FX.Modifiers.ModifierBuffSelfOnReplace"]

  onEndTurn: (e) ->
    super(e)

    if @getGameSession().getCurrentPlayer().getPlayerId() is @getCard().getOwnerId() and @getCard().getOwner().getDeck().getHand().indexOf(@getCard().getIndex()) != -1
      @getGameSession().applyModifierContextObject(ModifierManaCostChange.createContextObject(-1), @getCard())

module.exports = ModifierPatient
