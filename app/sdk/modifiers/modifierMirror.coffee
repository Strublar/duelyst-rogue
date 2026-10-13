Modifier = require 'app/sdk/modifiers/modifier'

###
  Mirror: when cast, add an Ethereal copy of this card that costs 0 (without Mirror) to your hand.
  Only a keyword for display, the effect is handled by Card.mirrorCardData when a card is played from hand.
###
class ModifierMirror extends Modifier

  type: "ModifierMirror"
  @type: "ModifierMirror"

  @isKeyworded: true
  @keywordDefinition: "When cast, add an Ethereal copy of this card that costs 0 (without Mirror) to your hand."

  @modifierName: "Mirror"
  @description: null

module.exports = ModifierMirror
