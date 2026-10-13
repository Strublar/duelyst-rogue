Modifier = require 'app/sdk/modifiers/modifier'

###
  Echo: the first card with Echo played each turn returns to hand.
  Only a keyword for display, the effect is handled by Card.echo when a card is played from hand.
###
class ModifierEcho extends Modifier

  type: "ModifierEcho"
  @type: "ModifierEcho"

  @isKeyworded: true
  @keywordDefinition: "The first card with Echo you play each turn returns to your hand."

  @modifierName: "Echo"
  @description: null

module.exports = ModifierEcho
