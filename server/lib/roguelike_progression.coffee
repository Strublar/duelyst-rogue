_ = require 'underscore'
knex = require './data_access/knex'
RoguelikeProgression = require '../../app/sdk/roguelike/roguelikeProgression'

###
Roguelike meta progression storage (account xp and xp per general), see app/sdk/roguelike/roguelikeProgression.js
Progression only changes when a run ends: quest xp earned meanwhile waits in pending_xp.
###
class RoguelikeProgressionModule

  ###*
  # Returns a user's progression state: {xp, general_xp}.
  # @param {String} userId
  # @return {Promise}
  ###
  @load: (userId) ->
    return knex('user_roguelike_progression').where('user_id', userId).first()
    .then (row) -> RoguelikeProgression.normalizeState(row)

  ###*
  # Gives the xp of a finished run to a user's account and general, plus the pending quest xp to the account.
  # @param {Boolean} isLoss whether the run ended with a lost fight (rather than being abandoned)
  # @return {Promise} {previousState, state, xpEarned, questXpEarned}
  ###
  @addRunResult: (userId, generalId, wins, isLoss) ->
    return knex.transaction (tx) ->
      tx('user_roguelike_progression').where('user_id', userId).first().forUpdate()
      .then (row) ->
        previousState = RoguelikeProgression.normalizeState(row)
        result = RoguelikeProgression.addRunResult(previousState, generalId, wins, isLoss)
        questXpEarned = (row? and row.pending_xp) or 0
        result.state.xp += questXpEarned
        data = { xp: result.state.xp, general_xp: JSON.stringify(result.state.general_xp), pending_xp: 0, updated_at: new Date() }
        query = if row? then tx('user_roguelike_progression').where('user_id', userId).update(data) else tx('user_roguelike_progression').insert(_.extend({ user_id: userId }, data))
        return query.then () ->
          return { previousState: previousState, state: result.state, xpEarned: result.xpEarned, questXpEarned: questXpEarned }

  ###*
  # Adds account xp to a user (ex: quest reward) inside an existing transaction, given when the current run ends.
  # @return {Promise}
  ###
  @addAccountXp: (tx, userId, xp) ->
    return tx('user_roguelike_progression').where('user_id', userId).first().forUpdate()
    .then (row) ->
      data = { pending_xp: ((row? and row.pending_xp) or 0) + xp, updated_at: new Date() }
      if row?
        return tx('user_roguelike_progression').where('user_id', userId).update(data)
      return tx('user_roguelike_progression').insert(_.extend({ user_id: userId, general_xp: JSON.stringify({}) }, data))

module.exports = RoguelikeProgressionModule
