Spell = require './spell'
CardType = require 'app/sdk/cards/cardType'
ModifierStunned = require 'app/sdk/modifiers/modifierStunned'
ModifierStunnedVanar = require 'app/sdk/modifiers/modifierStunnedVanar'
ModifierInsight = require 'app/sdk/modifiers/modifierInsight'

###
  Frigid Corona (roguelike): stun an enemy. If it was already stunned, Insight 2 and Bloodcall.
###
class SpellFrigidCorona extends Spell

  insightCostReduction: 2

  onApplyEffectToBoardTile: (board,x,y,sourceAction) ->
    super(board,x,y,sourceAction)

    if @getGameSession().getIsRunningAsAuthoritative()
      target = board.getCardAtPosition({x: x, y: y}, CardType.Unit)
      if target?
        wasStunned = target.hasActiveModifierClass(ModifierStunned)
        @getGameSession().applyModifierContextObject(ModifierStunnedVanar.createContextObject(), target)

        if wasStunned
          ModifierInsight.drawCards(@getGameSession(), @getOwnerId(), 1, @insightCostReduction)
          activateSignatureCardAction = @getOwner().actionActivateSignatureCard()
          if activateSignatureCardAction? then @getGameSession().executeAction(activateSignatureCardAction)

module.exports = SpellFrigidCorona
