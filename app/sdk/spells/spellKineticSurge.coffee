CONFIG = require 'app/common/config'
Spell = require './spell'
CardType = require 'app/sdk/cards/cardType'
DamageAction = require 'app/sdk/actions/damageAction'
BonusManaCoreAction = require 'app/sdk/actions/bonusManaCoreAction'

###
  Kara's Bloodbound Spell (roguelike): permanently gain 1 mana crystal.
  If you already had the maximum, deal 3 damage to all enemies around your General.
###
class SpellKineticSurge extends Spell

  damageAmount: 3

  onApplyEffectToBoardTile: (board,x,y,sourceAction) ->
    super(board,x,y,sourceAction)

    if @getGameSession().getIsRunningAsAuthoritative()
      hadMaxMana = @getOwner().getMaximumMana() >= CONFIG.MAX_MANA

      bonusManaCoreAction = new BonusManaCoreAction(@getGameSession())
      bonusManaCoreAction.setSource(@)
      bonusManaCoreAction.setOwnerId(@getOwnerId())
      @getGameSession().executeAction(bonusManaCoreAction)

      if hadMaxMana
        general = @getGameSession().getGeneralForPlayerId(@getOwnerId())
        for enemy in board.getEnemyEntitiesAroundEntity(general, CardType.Unit, 1)
          damageAction = new DamageAction(@getGameSession())
          damageAction.setOwnerId(@getOwnerId())
          damageAction.setSource(@)
          damageAction.setTarget(enemy)
          damageAction.setDamageAmount(@damageAmount)
          @getGameSession().executeAction(damageAction)

module.exports = SpellKineticSurge
