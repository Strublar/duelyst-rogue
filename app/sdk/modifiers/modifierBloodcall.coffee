Modifier = require 'app/sdk/modifiers/modifier'

###
  Bloodcall: when played, refresh your Bloodbound Spell.
  Only a keyword for display, the effect is handled by Card.refreshSignatureCardOnPlay when a card is played from hand.
###
class ModifierBloodcall extends Modifier

  type: "ModifierBloodcall"
  @type: "ModifierBloodcall"

  @isKeyworded: true
  @keywordDefinition: "When played, refresh your Bloodbound Spell."

  @modifierName: "Bloodcall"
  @description: null

module.exports = ModifierBloodcall
