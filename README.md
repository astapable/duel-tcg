# Duel Card Game — Prototype

## How to Run
Open `index.html` via Live Server (VSCode extension) or any static file server.

## How to Play
The game is **2-player local** on one device. Players take turns.

### Turn Structure
1. **Maintenance** — Draw 1 card, gain mana, untap creatures (automatic)
2. **Summon / Attack Phase:**
   - Click creature cards in your hand to play them (if affordable)
   - Click "Select Attacker" then click a creature on your board
   - Play action cards for that attacker
   - Click "Proceed to Select Target" → pick enemy creature or attack player
3. **Block Phase** — Defender clicks a card in hand with a block stat to block
4. **Combat resolves** — damage calculated, dead creatures go to graveyard
5. Repeat attacking with more creatures, then **End Turn**

### Win Conditions
- Reduce opponent HP to 0
- Opponent has empty deck and must draw

### Mana
- P1 starts with 1, P2 starts with 2
- Each turn: +2 mana (max 10)

### Zones (matching wireframe)
```
[Graveyard] [   P2 Hand   ] [Mana]
[Deck    ] [ P2 Board x5  ] [HP  ]
           [ P1 Board x5  ] [HP  ]
[HP     ] [   P1 Hand   ] [Deck ]
[Mana   ]                  [Graveyard]
```

## Files
- `index.html` — Layout
- `style.css` — Styles
- `script.js` — All game logic + state machine
- `cards.json` — 30 cards (20 creatures, 10 actions)