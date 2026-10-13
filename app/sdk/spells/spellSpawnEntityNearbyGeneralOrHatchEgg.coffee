CONFIG = require 'app/common/config'
SpellSpawnEntityNearbyGeneral = require './spellSpawnEntityNearbyGeneral'
Spell = require './spell'
UtilsGameSession = require 'app/common/utils/utils_game_session'
UtilsPosition = require 'app/common/utils/utils_position'
ModifierEgg = require 'app/sdk/modifiers/modifierEgg'

###
  Summons an entity nearby my General, or hatches a friendly Egg anywhere.
###
class SpellSpawnEntityNearbyGeneralOrHatchEgg extends SpellSpawnEntityNearbyGeneral

  _getPrefilteredValidTargetPositions: () ->
    return @getGameSession().getBoard().getPositions()

  _postFilterPlayPositions: (validPositions) ->
    board = @getGameSession().getBoard()
    general = @getGameSession().getGeneralForPlayerId(@getOwnerId())
    spawnPositions = UtilsGameSession.getValidBoardPositionsFromPattern(board, general.getPosition(), CONFIG.PATTERN_3x3)
    spawnPositions = super(spawnPositions)
    filteredPositions = []
    for position in validPositions
      if @_getHatchableEggAtPosition(position)? or UtilsPosition.getIsPositionInPositions(spawnPositions, position)
        filteredPositions.push(position)
    return filteredPositions

  onApplyEffectToBoardTile: (board,x,y,sourceAction) ->
    egg = @_getHatchableEggAtPosition({x: x, y: y})
    if egg?
      Spell::onApplyEffectToBoardTile.call(@, board, x, y, sourceAction)
      eggModifier = egg.getModifierByClass(ModifierEgg)
      @getGameSession().pushTriggeringModifierOntoStack(eggModifier)
      eggModifier.removeAndReplace()
      @getGameSession().popTriggeringModifierFromStack()
    else
      super(board,x,y,sourceAction)

  _getHatchableEggAtPosition: (position) ->
    # friendly, non-dispelled Egg
    entity = @getGameSession().getBoard().getUnitAtPosition(position)
    if entity? and entity.getOwnerId() == @getOwnerId() and entity.hasModifierClass(ModifierEgg)
      return entity

module.exports = SpellSpawnEntityNearbyGeneralOrHatchEgg
