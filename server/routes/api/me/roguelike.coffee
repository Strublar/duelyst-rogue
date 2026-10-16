express = require 'express'
t = require 'tcomb-validation'
Logger = require '../../../../app/common/logger.coffee'
RoguelikeProgressionModule = require '../../../lib/roguelike_progression'
validators = require '../../../validators'

router = express.Router()

# roguelike meta progression: {xp, general_xp}
router.get '/progression', (req, res, next) ->
  RoguelikeProgressionModule.load(req.user.d.id)
  .then (state) -> res.status(200).json(state)
  .catch (error) -> next(error)

# records a finished roguelike run, giving its xp to the account and the run general (plus quest xp earned during the run)
router.post '/progression/run_result', (req, res, next) ->
  result = t.validate(req.body, validators.roguelikeRunResultInput)
  if not result.isValid()
    return res.status(400).json(result.errors)

  userId = req.user.d.id
  RoguelikeProgressionModule.addRunResult(userId, result.value.general_id, Math.max(0, result.value.wins), result.value.is_loss)
  .then (runResult) ->
    Logger.module("ROGUELIKE").debug "Progression #{userId} : general #{result.value.general_id} : run over after #{result.value.wins} wins : +#{runResult.xpEarned} xp, +#{runResult.questXpEarned} quest xp"
    res.status(200).json(xp_earned: runResult.xpEarned, quest_xp_earned: runResult.questXpEarned, previous_progression: runResult.previousState, progression: runResult.state)
  .catch (error) -> next(error)

module.exports = router
