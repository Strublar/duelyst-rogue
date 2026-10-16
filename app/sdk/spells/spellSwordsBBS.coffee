Spell = require './spell'
CardType = require 'app/sdk/cards/cardType'
ModifierManaCostChange = require 'app/sdk/modifiers/modifierManaCostChange'
ModifierEthereal = require 'app/sdk/modifiers/modifierEthereal'

###
  Shidai's Bloodbound Spell (roguelike): draw 2 random spells from your deck, they cost 1 less and are Ethereal.
###
class SpellSwordsBBS extends Spell

  numSpells: 2
  costChange: -1

  onApplyOneEffectToBoard: (board, x, y, sourceAction) ->
    super(board, x, y, sourceAction)

    if @getGameSession().getIsRunningAsAuthoritative()
      deck = @getOwner().getDeck()

      # pick X random spells from the draw pile
      spellIndices = []
      for cardIndex in deck.getDrawPile()
        if @getGameSession().getCardByIndex(cardIndex)?.getType() == CardType.Spell
          spellIndices.push(cardIndex)
      cardIndicesToDraw = []
      for [0...@numSpells]
        if spellIndices.length > 0
          cardIndicesToDraw.push(spellIndices.splice(@getGameSession().getRandomIntegerForExecution(spellIndices.length), 1)[0])

      # draws are executed after this spell, so modify the cards while they are still in the deck
      for cardIndex in cardIndicesToDraw
        card = @getGameSession().getCardByIndex(cardIndex)
        @getGameSession().applyModifierContextObject(ModifierManaCostChange.createContextObject(@costChange), card)
        @getGameSession().applyModifierContextObject(ModifierEthereal.createContextObject({isAddedKeyword: true}), card)
        @getGameSession().executeAction(deck.actionDrawCard(cardIndex))

module.exports = SpellSwordsBBS
