Quest = require './quest'
GameStatus = require 'app/sdk/gameStatus'
GameType = require 'app/sdk/gameType'
UtilsGameSession = require 'app/common/utils/utils_game_session'

###
Roguelike quest: progresses with roguelike fights (single player games) and rewards roguelike account xp instead of gold.
Name and description may be functions, resolved when displayed (ex: general names need the card caches).
###
class QuestRoguelike extends Quest

  generalId: null # when set, only fights with this general count and the quest is only offered once the general is unlocked

  constructor: (id, name, typesIn, roguelikeXpReward, completionProgress, description, progressForGameData, generalId) ->
    super(id, null, typesIn, null)
    @_name = name
    @_description = description
    @_progressForGameData = progressForGameData
    @roguelikeXpReward = roguelikeXpReward
    @generalId = generalId ? null
    @params["completionProgress"] = completionProgress
    @isReplaceable = true

  progressForGameDataForPlayerId: (gameData, playerId) ->
    if gameData.status != GameStatus.over or gameData.gameType != GameType.SinglePlayer
      return 0
    playerData = UtilsGameSession.getPlayerDataForId(gameData, playerId)
    playerSetupData = UtilsGameSession.getPlayerSetupDataForPlayerId(gameData, playerId)
    if !playerData? or !playerSetupData?
      return 0
    if @generalId? and playerSetupData.generalId != @generalId
      return 0
    return @_progressForGameData(playerData, playerSetupData) or 0

  getName: () ->
    return if typeof @_name == "function" then @_name() else @_name

  getDescription: () ->
    return if typeof @_description == "function" then @_description(@params["completionProgress"]) else @_description

  getGeneralId: () ->
    return @generalId

module.exports = QuestRoguelike
