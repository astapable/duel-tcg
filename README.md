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

## Cards

### Creatures (23 types)

| Cost | Name | ATK | BLK | HP | Ability |
|------|------|-----|-----|----|---------|
| 1 | **Spark Imp** | 1 | 0 | 1 | on_play: deal 1 damage to enemy player |
| 1 | **Rush Pup** | 2 | 0 | 1 | on_play: Rush |
| 1 | **Thorn Rat** | 1 | 1 | 2 | on_death: draw 1 card |
| 1 | **Ember Sprite** | 2 | 0 | 1 | on_play: Rush |
| 1 | **Swamp Toad** | 1 | 0 | 2 | on_play: Rush |
| 1 | **Viper Mage** | 1 | 2 | 1 | on_death: draw 1 card |
| 2 | **Bog Rat** | 1 | 1 | 3 | on_play: tap a random enemy creature |
| 2 | **Gloom Imp** | 3 | 0 | 1 | on_play: Rush |
| 2 | **Stone Pup** | 2 | 1 | 2 | on_play: draw 1 card |
| 2 | **Vine Crawler** | 1 | 2 | 3 | on_death: draw 1 card |
| 3 | **Sand Stalker** | 3 | 1 | 3 | on_attack: tap a random enemy creature |
| 3 | **Fungal Brute** | 2 | 2 | 4 | on_damage: heal self 1 |
| 3 | **Plague Hound** | 3 | 1 | 2 | on_attack: deal 1 damage to enemy player |
| 3 | **Herald of Thorns** | 2 | 1 | 3 | on_play: all allied creatures gain +1 HP |
| 4 | **Iron Golem** | 2 | 3 | 5 | on_damage: heal self 1 |
| 4 | **Ashwood Scout** | 4 | 1 | 3 | on_play: tap a random enemy creature |
| 4 | **Bog Witch** | 3 | 2 | 4 | on_attack: deal 1 damage to enemy player |
| 5 | **Storm Hawk** | 5 | 1 | 3 | on_play: deal 2 damage to enemy player |
| 5 | **Tide Warden** | 3 | 3 | 6 | on_damage: heal self 2 |
| 6 | **Bone Colossus** | 6 | 2 | 5 | on_play: deal 2 damage to enemy player |
| 6 | **Frost Specter** | 5 | 1 | 6 | on_attack: tap a random enemy creature |
| 7 | **Shadow Dragon** | 7 | 2 | 5 | on_play: deal 2 damage to enemy player |
| 7 | **Void Sentinel** | 5 | 3 | 7 | on_attack: deal 2 damage to enemy player |

**Ability triggers:**
- `on_play` — fires when the creature enters the board
- `on_attack` — fires each time the creature attacks
- `on_damage` — fires each time the creature receives damage
- `on_death` — fires when the creature dies

---

### Action Cards (11 types)

Played during phase **3.0 Pre-Combat** or **3.2 Attack Actions**. After resolving, they go to the graveyard. Cards with a BLK value can also be used as **block cards** in phase 3.6.

| Cost | Name | BLK | Effect |
|------|------|-----|--------|
| 0 | **Iron Shield** | 3 | Discard this card → gain 1 mana |
| 1 | **Second Wind** | 2 | Heal yourself for 2 HP |
| 2 | **Fireball** | — | Deal 2 damage to enemy player |
| 2 | **Mending Touch** | 1 | Heal the most damaged allied creature for 3 |
| 2 | **Arcane Scroll** | 1 | Draw 2 cards |
| 2 | **Battle Cry** | — | Grant Rush to an allied creature |
| 2 | **Ambush** | — | Deal 2 damage to an enemy creature and tap it |
| 3 | **Smite** | — | Deal 3 damage to an enemy creature |
| 3 | **Stasis Coil** | 1 | Tap an enemy creature |
| 3 | **War Drum** | — | All allied creatures gain +1 ATK |
| 3 | **Drain Life** | 1 | Deal 2 damage to enemy player, heal yourself 2 |

---

## Files
- `index.html` — layout
- `style.css` — styles
- `script.js` — all game logic and state machine
- `cards.json` — 34 cards (23 creatures + 11 actions)
- `art/` — card artwork (23 creature images + 11 action images)