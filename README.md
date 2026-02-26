# Duel Card Game — Prototype

## How to Run

Open `index.html` via Live Server (VSCode extension) or any static file server.
Keep all files in the same folder: `index.html`, `style.css`, `script.js`, `cards.json`, and the `art/` folder.

---

## Rules

### Overview
- **2 players**, local hotseat, alternating turns
- Each player starts with **30 HP**
- Starting deck — **40 cards** (37 in deck + 3 drawn as opening hand)
- Maximum hand size — **4 cards**
- Maximum creatures on board — **5**
- Maximum mana — **10**

### Win Conditions
- Reduce the opponent's HP to **0**
- Opponent must draw a card but their **deck is empty**

### Mana
- Player 1 starts with 1 mana, Player 2 starts with 2 mana
- Each turn: **+2 mana** (cap 10)
- Player 1 **skips the draw** on their very first turn

---

## Turn Structure

### Phase 1 · Maintenance (automatic)
- All your creatures **untap**
- **Summoning sickness** is removed from creatures played last turn
- Gain +2 mana, draw 1 card

### Phase 2 · Play / Summon
- Play **creatures** from hand by clicking them (costs mana)
- Creatures played this turn receive the **⏳ summoned** tag — they cannot attack this turn unless they have Rush
- Click **"Enter Combat"** to proceed or **"Skip to End Turn"**

### Phase 3 · Combat

**3.0 · Pre-Combat Actions** — play action cards before declaring any attacker. Effects resolve immediately.

**3.1 · Select Attacker** — click an untapped creature without ⏳ on your board.

**3.2 · Attack Actions** — play action cards to support this attacker. Click **"Apply & Select Target"** or **"Skip Actions"**.

**3.4 · Apply Actions** — action effects resolve, cards go to the graveyard.

**3.5 · Select Target** — click an enemy creature or attack the player directly.
- **Untapped creatures must be targeted before tapped ones**
- Tapped creatures deal **no counterattack damage**

**3.6 · Block** — the defending player may play a card with a 🛡 value from hand to reduce incoming damage. Block reduces damage but never kills the attacker. Click **"No Block"** to skip.

**3.7 · Resolve** — damage applied: `ATK − block = damage to target`
- An **untapped** target creature deals **counterattack damage** equal to its ATK back to the attacker
- Creatures at HP ≤ 0 die, go to the graveyard, and trigger **on_death** abilities
- The attacking creature becomes **tapped**

The loop 3.1–3.7 repeats for each additional attacker. Click **"End Turn"** when done.

### Phase 4 · End Turn
- Cards in hand beyond 4 are discarded
- Turn passes to the opponent

---

## Key Mechanics

**Summoning Sickness** — a creature tagged ⏳ cannot attack. Removed at the start of its owner's next turn.

**Rush** — immediately removes summoning sickness on entry. The creature can attack the same turn it was played.

**Tapped / Untapped** — a tapped creature cannot attack and does not deal counterattack damage. It untaps at the start of its owner's turn.

**Counterattack** — attacking an untapped enemy creature causes it to deal damage back equal to its ATK. Tapped creatures do not counterattack.

**Persistent Damage** — damage does not reset between turns. A creature at 3/6 HP stays that way until healed or killed.

---

## Files
- `index.html` — layout
- `style.css` — styles
- `script.js` — all game logic and state machine
- `cards.json` — 34 cards (23 creatures + 11 actions)
- `art/` — card artwork (23 creature images + 11 action images)