ModifierEnemyStunWatch = require './modifierEnemyStunWatch'
DamageAction = require 'app/sdk/actions/damageAction'

###
  Whenever an enemy is stunned, deal damage to it.
###
class ModifierEnemyStunWatchDamageStunned extends ModifierEnemyStunWatch

  type:"ModifierEnemyStunWatchDamageStunned"
  @type:"ModifierEnemyStunWatchDamageStunned"

  fxResource: ["FX.Modifiers.ModifierMyMoveWatch"]

  damageAmount: 0

  @createContextObject: (damageAmount, options) ->
    contextObject = super(options)
    contextObject.damageAmount = damageAmount
    return contextObject

  onEnemyStunWatch: (action) ->
    target = action.getTarget()
    if target?
      damageAction = new DamageAction(@getGameSession())
      damageAction.setOwnerId(@getCard().getOwnerId())
      damageAction.setSource(@getCard())
      damageAction.setTarget(target)
      damageAction.setDamageAmount(@damageAmount)
      @getGameSession().executeAction(damageAction)

module.exports = ModifierEnemyStunWatchDamageStunned
