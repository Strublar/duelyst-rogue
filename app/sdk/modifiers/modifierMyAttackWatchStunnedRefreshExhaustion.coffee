ModifierMyAttackWatch = require './modifierMyAttackWatch'
ModifierStunned = require './modifierStunned'
AttackAction = require 'app/sdk/actions/attackAction'
RefreshExhaustionAction = require 'app/sdk/actions/refreshExhaustionAction'

###
  Whenever this minion attacks a stunned enemy, reactivate it and remove the stun.
###
class ModifierMyAttackWatchStunnedRefreshExhaustion extends ModifierMyAttackWatch

  type:"ModifierMyAttackWatchStunnedRefreshExhaustion"
  @type:"ModifierMyAttackWatchStunnedRefreshExhaustion"

  fxResource: ["FX.Modifiers.ModifierKillWatch", "FX.Modifiers.ModifierGenericHeal"]

  getPrivateDefaults: (gameSession) ->
    p = super(gameSession)
    p.targetWasStunned = false
    return p

  onBeforeAction: (event) ->
    super(event)
    action = event.action
    # remember if the target was stunned when the attack started
    if action instanceof AttackAction and action.getSource() == @getCard() and (!action.getIsImplicit() or action.getIsAutomatic())
      @_private.targetWasStunned = action.getTarget()?.hasActiveModifierClass(ModifierStunned) || false

  onMyAttackWatch: (action) ->
    if @_private.targetWasStunned
      @_private.targetWasStunned = false
      target = action.getTarget()
      if target?
        for modifier in target.getModifiersByClass(ModifierStunned)
          @getGameSession().removeModifier(modifier)

      refreshExhaustionAction = @getGameSession().createActionForType(RefreshExhaustionAction.type)
      refreshExhaustionAction.setSource(@getCard())
      refreshExhaustionAction.setTarget(@getCard())
      @getGameSession().executeAction(refreshExhaustionAction)

module.exports = ModifierMyAttackWatchStunnedRefreshExhaustion
