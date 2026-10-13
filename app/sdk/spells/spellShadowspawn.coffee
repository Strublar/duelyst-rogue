CONFIG = require '../../common/config'
SpellSpawnEntity = require './spellSpawnEntity.coffee'
CardType = require './../cards/cardType.coffee'
Cards = require '../cards/cardsLookupComplete.coffee'
UtilsGameSession = require '../../common/utils/utils_game_session.coffee'
Modifier = require 'app/sdk/modifiers/modifier'
_ = require 'underscore'

class SpellShadowspawn extends SpellSpawnEntity

  targetType: CardType.Unit
  spawnSilently: true
  numUnits: 2
  cardDataOrIndexToSpawn: {id: Cards.Faction4.Wraithling} # spawns wraithlings
  wraithlingBuffAmount: 0 # if set, all friendly Wraithlings gain +X/+X after the summon
  isTargeted: false # if set, the player chooses the space nearby the General (summons a single unit)

  _getPrefilteredValidTargetPositions: () ->
    if @isTargeted
      return UtilsGameSession.getValidBoardPositionsFromPattern(@getGameSession().getBoard(), @getGameSession().getGeneralForPlayerId(@getOwnerId()).getPosition(), CONFIG.PATTERN_3x3)
    return super()

  _findApplyEffectPositions: (position, sourceAction) ->
    if @isTargeted then return [position]

    card = @getEntityToSpawn()
    generalPosition = @getGameSession().getGeneralForPlayerId(@ownerId).getPosition()
    numberOfApplyPositions = @numUnits

    if numberOfApplyPositions > 0
      applyEffectPositions = UtilsGameSession.getRandomSmartSpawnPositionsFromPattern(@getGameSession(), generalPosition, CONFIG.PATTERN_3x3, card, @, numberOfApplyPositions)
    else
      applyEffectPositions = []

    return applyEffectPositions

  getCardDataOrIndexToSpawn: (x, y) ->
    cardDataOrIndexToSpawn = super(x, y)
    # summoned Wraithlings are spawned with the buff, since they resolve after the rest of the spell
    if @wraithlingBuffAmount > 0 and _.isObject(cardDataOrIndexToSpawn)
      cardDataOrIndexToSpawn.additionalModifiersContextObjects = [@_createWraithlingBuffContextObject()]
    return cardDataOrIndexToSpawn

  onApplyOneEffectToBoard: (board,x,y,sourceAction) ->
    super(board,x,y,sourceAction)

    if @wraithlingBuffAmount > 0
      for unit in board.getUnits()
        if unit?.getOwnerId() == @getOwnerId() and unit.getBaseCardId() == Cards.Faction4.Wraithling
          @getGameSession().applyModifierContextObject(@_createWraithlingBuffContextObject(), unit)

  _createWraithlingBuffContextObject: () ->
    buffContextObject = Modifier.createContextObjectWithAttributeBuffs(@wraithlingBuffAmount, @wraithlingBuffAmount)
    buffContextObject.appliedName = @getName()
    return buffContextObject

  getAppliesSameEffectToMultipleTargets: () ->
    return true

  # Shadowspawn picks its apply locations by itself, so don't set limits on where it can be cast
  _postFilterPlayPositions: (validPositions) ->
    # targeted version can only be cast on spaces where the entity can be summoned
    if @isTargeted then return super(validPositions)
    return validPositions

module.exports = SpellShadowspawn
