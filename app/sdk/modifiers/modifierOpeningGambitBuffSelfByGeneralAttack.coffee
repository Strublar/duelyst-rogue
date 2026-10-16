ModifierOpeningGambit = require './modifierOpeningGambit'
Modifier = require './modifier'

###
Opening Gambit: this minion gains as much Attack as its General has.
###
class ModifierOpeningGambitBuffSelfByGeneralAttack extends ModifierOpeningGambit

  type: "ModifierOpeningGambitBuffSelfByGeneralAttack"
  @type: "ModifierOpeningGambitBuffSelfByGeneralAttack"

  @description: "Gain as much Attack as your General"

  fxResource: ["FX.Modifiers.ModifierOpeningGambit", "FX.Modifiers.ModifierGenericBuff"]

  @createContextObject: (appliedName, options) ->
    contextObject = super(options)
    contextObject.appliedName = appliedName
    return contextObject

  onOpeningGambit: () ->
    super()

    if @getGameSession().getIsRunningAsAuthoritative()
      general = @getGameSession().getGeneralForPlayerId(@getCard().getOwnerId())
      attack = if general? then general.getATK() else 0
      if attack > 0
        buffContextObject = Modifier.createContextObjectWithAttributeBuffs(attack, 0)
        buffContextObject.appliedName = @appliedName
        @getGameSession().applyModifierContextObject(buffContextObject, @getCard())

module.exports = ModifierOpeningGambitBuffSelfByGeneralAttack
