// ============================================================
// DUEL CARD GAME - script.js
// ============================================================

const STARTING_HP = 30;
const MAX_HAND    = 4;
const MAX_BOARD   = 5;
const MAX_MANA    = 10;

// Phase states — follow exact sequence:
// MAINTENANCE → PLAY_CREATURES → COMBAT_SELECT_ATTACKER →
//   COMBAT_ATTACK_ACTIONS → COMBAT_APPLY_ACTIONS → COMBAT_SELECT_TARGET →
//   COMBAT_BLOCK → COMBAT_RESOLVE
// ...repeat COMBAT_SELECT_ATTACKER loop for next attacker...
// → END_TURN → (next player MAINTENANCE)
const STATE = {
  MAINTENANCE:              'MAINTENANCE',
  PLAY_CREATURES:           'PLAY_CREATURES',
  COMBAT_PRE_ACTIONS:       'COMBAT_PRE_ACTIONS',
  COMBAT_SELECT_ATTACKER:   'COMBAT_SELECT_ATTACKER',
  COMBAT_ATTACK_ACTIONS:    'COMBAT_ATTACK_ACTIONS',
  COMBAT_APPLY_ACTIONS:     'COMBAT_APPLY_ACTIONS',
  COMBAT_SELECT_TARGET:     'COMBAT_SELECT_TARGET',
  COMBAT_BLOCK:             'COMBAT_BLOCK',
  COMBAT_RESOLVE:           'COMBAT_RESOLVE',
  COMBAT_SELECT_TAP_TARGET: 'COMBAT_SELECT_TAP_TARGET', // player chooses which enemy to tap
  END_TURN:                 'END_TURN',
  GAME_OVER:                'GAME_OVER'
};

let G = null;

// ============================================================
// UTILITY
// ============================================================
function uid()    { return Math.random().toString(36).slice(2, 10); }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function log(msg) {
  G.log.unshift(msg);
  if (G.log.length > 100) G.log.pop();
  renderLog();
}

// ============================================================
// SETUP
// ============================================================
let CARD_DB = [];
async function loadCards() {
  const res = await fetch('cards.json');
  CARD_DB = await res.json();
}

function buildDeck() {
  const creatures = CARD_DB.filter(c => c.type === 'creature');
  const actions   = CARD_DB.filter(c => c.type === 'action');

  let pool = [];
  // Cheap creatures (cost 1-3): 2 copies each
  creatures.forEach(c => {
    pool.push({ ...c, uid: uid() });
    if (c.cost <= 3) pool.push({ ...c, uid: uid() });
  });
  // Actions: 2 copies each
  actions.forEach(c => {
    pool.push({ ...c, uid: uid() });
    pool.push({ ...c, uid: uid() });
  });

  // Target: 40 cards total (37 in deck + 3 drawn as starting hand)
  // Pad with extra cheap creature copies if under target
  const TARGET = 40;
  const cheap = creatures.filter(c => c.cost <= 3);
  while (pool.length < TARGET) {
    const c = cheap[Math.floor(Math.random() * cheap.length)];
    pool.push({ ...c, uid: uid() });
  }
  // Trim if somehow over
  pool = pool.slice(0, TARGET);

  return shuffle(pool);
}

function makePlayer(id, isP1) {
  return {
    id,
    hp:           STARTING_HP,
    manaAvailable: isP1 ? 1 : 2,
    manaCurrent:   isP1 ? 1 : 2,
    deck:      buildDeck(),
    hand:      [],
    board:     [],
    graveyard: [],
    turnCount: 0
  };
}

function initGame() {
  G = {
    players:      { p1: makePlayer('p1', true), p2: makePlayer('p2', false) },
    activePlayer: 'p1',
    state:        STATE.MAINTENANCE,
    globalTurn:   0,
    combat: {
      attacker:       null,   // uid of current attacking creature
      pendingActions: [],     // action cards queued
      resolvedActions: [],    // actions after resolution (for display in APPLY phase)
      target:         null,   // uid of defender creature OR 'player'
      blockCard:      null
    },
    log:       [],
    winner:    null,
    pendingTap: null   // { cardName, ownerPid, continuation } — set while waiting for tap target selection
  };
  // Starting hand: 3 cards each
  for (let i = 0; i < 3; i++) { drawCard('p1', true); drawCard('p2', true); }
  doMaintenance();
}

// ============================================================
// HELPERS
// ============================================================
function active()      { return G.players[G.activePlayer]; }
function defender()    { return G.players[defenderKey()]; }
function defenderKey() { return G.activePlayer === 'p1' ? 'p2' : 'p1'; }
function pLabel(pid)   { return pid === 'p1' ? 'Player 1' : 'Player 2'; }

// ============================================================
// CARDS
// ============================================================
function drawCard(pid, silent = false) {
  const p = G.players[pid];
  if (p.deck.length === 0) { triggerLoss(pid, 'deck empty'); return null; }
  const card = p.deck.shift();
  p.hand.push(card);
  if (!silent) log(`🃏 ${pLabel(pid)} draws ${card.name}`);
  return card;
}

// ============================================================
// WIN / LOSS
// ============================================================
function triggerLoss(pid, reason) {
  if (G.state === STATE.GAME_OVER) return;
  G.state  = STATE.GAME_OVER;
  G.winner = pid === 'p1' ? 'p2' : 'p1';
  log(`💀 ${pLabel(pid)} loses! (${reason})`);
  renderAll();
  showGameOver();
}

function checkDeath() {
  ['p1', 'p2'].forEach(pid => {
    const p = G.players[pid];
    const dead = p.board.filter(c => c.healthCurrent <= 0);
    dead.forEach(c => {
      log(`💀 ${c.name} dies`);
      p.board = p.board.filter(x => x.uid !== c.uid);
      p.graveyard.push(c);
      resolveAbility(c, 'on_death', pid);
    });
    if (p.hp <= 0) triggerLoss(pid, 'HP ≤ 0');
  });
}

// ============================================================
// ABILITIES
// ============================================================
function resolveAbility(card, trigger, ownerPid) {
  if (!card.ability || card.ability.trigger !== trigger) return;
  const ab      = card.ability;
  const owner   = G.players[ownerPid];
  const enemyPid= ownerPid === 'p1' ? 'p2' : 'p1';
  const enemy   = G.players[enemyPid];
  log(`✨ ${card.name}: ${ab.effect} ${ab.value} → ${ab.target}`);

  switch (ab.effect) {
    case 'deal_damage':
      if (ab.target === 'enemy_player') {
        enemy.hp -= ab.value;
        log(`💥 ${pLabel(enemyPid)} takes ${ab.value} → HP ${enemy.hp}`);
      } else if (ab.target === 'random_enemy_creature' || ab.target === 'enemy_creature') {
        const pool = (ab.target === 'enemy_creature' && G.combat.target && G.combat.target !== 'player')
          ? enemy.board.filter(c => c.uid === G.combat.target)
          : enemy.board;
        if (pool.length > 0) {
          const t = pool[Math.floor(Math.random() * pool.length)];
          t.healthCurrent -= ab.value;
          log(`💥 ${t.name} takes ${ab.value} → HP ${t.healthCurrent}`);
        }
      }
      break;
    case 'heal':
      if (ab.target === 'self') {
        owner.hp = Math.min(owner.hp + ab.value, STARTING_HP);
        log(`💚 ${pLabel(ownerPid)} heals ${ab.value} → HP ${owner.hp}`);
      } else if (ab.target === 'ally_creature') {
        // For creature abilities: heal self. For action cards: heal most damaged ally.
        const onBoard = owner.board.find(c => c.uid === card.uid);
        if (onBoard) {
          onBoard.healthCurrent = Math.min(onBoard.healthCurrent + ab.value, onBoard.healthMax);
          log(`💚 ${onBoard.name} heals ${ab.value} → HP ${onBoard.healthCurrent}`);
        } else {
          // Action card — heal most damaged ally creature
          const allies = [...owner.board].sort((a, b) => (a.healthMax - a.healthCurrent) - (b.healthMax - b.healthCurrent));
          const most = allies[allies.length - 1];
          if (most) {
            most.healthCurrent = Math.min(most.healthCurrent + ab.value, most.healthMax);
            log(`💚 ${most.name} heals ${ab.value} → HP ${most.healthCurrent}`);
          }
        }
      }
      break;
    case 'draw':
      for (let i = 0; i < ab.value; i++) drawCard(ownerPid);
      break;
    case 'buff_attack': {
      const tgts = ab.target === 'self'
        ? owner.board.filter(c => c.uid === card.uid)
        : owner.board.filter(c => c.uid !== card.uid);
      if (tgts.length > 0) { const t = tgts[Math.floor(Math.random() * tgts.length)]; t.attack += ab.value; log(`⬆ ${t.name} ATK +${ab.value}`); }
      break;
    }
    case 'buff_health': {
      const tgts = ab.target === 'self'
        ? owner.board.filter(c => c.uid === card.uid)
        : owner.board.filter(c => c.uid !== card.uid);
      if (tgts.length > 0) { const t = tgts[Math.floor(Math.random() * tgts.length)]; t.healthMax += ab.value; t.healthCurrent += ab.value; log(`⬆ ${t.name} HP +${ab.value}`); }
      break;
    }
    case 'prevent_damage':
      if (card._preventDmg === undefined) card._preventDmg = 0;
      card._preventDmg += ab.value;
      log(`🛡 ${card.name} will prevent ${ab.value} dmg`);
      break;

    case 'rush': {
      // Remove summoning sickness from self (on_play) or a random ally creature (action)
      if (ab.target === 'self') {
        const self = owner.board.find(c => c.uid === card.uid);
        if (self) { self.summonedThisTurn = false; log(`⚡ ${self.name} has Rush — can attack immediately!`); }
      } else if (ab.target === 'ally_creature') {
        // Action card: grant rush to the most recently summoned sick ally
        const sick = owner.board.filter(c => c.summonedThisTurn);
        if (sick.length > 0) {
          const t = sick[sick.length - 1];
          t.summonedThisTurn = false;
          log(`⚡ ${t.name} granted Rush — can attack immediately!`);
        } else {
          // No sick creatures — grant rush to a random untapped ally instead
          const untapped = owner.board.filter(c => !c.tapped);
          if (untapped.length > 0) {
            const t = untapped[Math.floor(Math.random() * untapped.length)];
            t.summonedThisTurn = false;
            log(`⚡ ${t.name} granted Rush`);
          }
        }
      }
      break;
    }

    case 'tap_enemy': {
      const pool = enemy.board.filter(c => !c.tapped);
      if (pool.length === 0) break;
      if (pool.length === 1) {
        // Only one target — auto-tap, no need to ask
        pool[0].tapped = true;
        log(`🌀 ${pool[0].name} is tapped by ${card.name}!`);
        break;
      }
      // Multiple targets — player chooses (caller must set G.pendingTap.continuation)
      G.pendingTap = { cardName: card.name, ownerPid, continuation: null };
      G.state = STATE.COMBAT_SELECT_TAP_TARGET;
      break;
    }

    case 'gain_mana':
      owner.manaCurrent = Math.min(owner.manaCurrent + ab.value, MAX_MANA);
      log(`💎 ${pLabel(ownerPid)} gains ${ab.value} mana → ${owner.manaCurrent}/${owner.manaAvailable}`);
      break;

    case 'damage_and_tap': {
      // Deal damage to a creature AND tap it
      const pool = (ab.target === 'enemy_creature' && G.combat.target && G.combat.target !== 'player')
        ? enemy.board.filter(c => c.uid === G.combat.target)
        : enemy.board;
      if (pool.length > 0) {
        const t = pool[Math.floor(Math.random() * pool.length)];
        t.healthCurrent -= ab.value;
        t.tapped = true;
        log(`🗡 ${card.name}: ${t.name} takes ${ab.value} dmg and is tapped → HP ${t.healthCurrent}`);
      }
      break;
    }

    case 'buff_attack_all': {
      // Buff ATK of all allied creatures on board
      if (owner.board.length === 0) { log(`📯 ${card.name}: no allies to buff`); break; }
      owner.board.forEach(c => { c.attack += ab.value; });
      log(`📯 ${card.name}: all allies +${ab.value} ATK (${owner.board.map(c => c.name).join(', ')})`);
      break;
    }

    case 'buff_health_all': {
      const alliesH = owner.board.filter(c => c.uid !== card.uid);
      if (alliesH.length === 0) { log(`💛 ${card.name}: no other allies to buff`); break; }
      alliesH.forEach(c => { c.healthMax += ab.value; c.healthCurrent += ab.value; });
      log(`💛 ${card.name}: all allies +${ab.value} HP (${alliesH.map(c => c.name).join(', ')}`);
      break;
    }

    case 'drain_life': {
      // Deal damage to enemy player AND heal self for same amount
      enemy.hp -= ab.value;
      owner.hp = Math.min(owner.hp + ab.value, STARTING_HP);
      log(`🩸 ${card.name}: deals ${ab.value} to ${pLabel(enemyPid)} (HP ${enemy.hp}), heals ${pLabel(ownerPid)} +${ab.value} (HP ${owner.hp})`);
      break;
    }
  }
  checkDeath();
}

// Called when the player clicks an enemy creature during COMBAT_SELECT_TAP_TARGET
function selectTapTarget(creatureUid) {
  if (G.state !== STATE.COMBAT_SELECT_TAP_TARGET || !G.pendingTap) return;
  const { cardName, ownerPid, continuation } = G.pendingTap;
  const enemyPid = ownerPid === 'p1' ? 'p2' : 'p1';
  const t = G.players[enemyPid].board.find(c => c.uid === creatureUid && !c.tapped);
  if (!t) return;
  t.tapped = true;
  log(`🌀 ${t.name} is tapped by ${cardName}!`);
  G.pendingTap = null;
  if (G.state === STATE.GAME_OVER) return;
  if (continuation) continuation();
  else renderAll();
}

// ============================================================
// PHASE LOGIC
// ============================================================

// ── 1. MAINTENANCE ──────────────────────────────────────────
function doMaintenance() {
  G.state = STATE.MAINTENANCE;
  G.globalTurn++;
  const p = active();
  p.turnCount++;

  // Untap all — clear summoning sickness on those that survived a full cycle
  p.board.forEach(c => {
    c.tapped = false;
    c.summonedThisTurn = false;  // clear sickness flag at start of THEIR next turn
  });

  // Draw — P1 skips draw on their very first turn
  const skipFirstDraw = (G.activePlayer === 'p1' && p.turnCount === 1);
  if (!skipFirstDraw) {
    if (!drawCard(G.activePlayer)) return;
  }

  // Mana
  if (p.turnCount > 1) p.manaAvailable = Math.min(p.manaAvailable + 2, MAX_MANA);
  p.manaCurrent = p.manaAvailable;

  log(`━━ Turn ${G.globalTurn} · ${pLabel(G.activePlayer)} · Mana ${p.manaCurrent} ━━`);
  G.state = STATE.PLAY_CREATURES;
  renderAll();
}

// ── 2. PLAY CREATURES ───────────────────────────────────────
function playCreature(handCardUid) {
  if (G.state !== STATE.PLAY_CREATURES) return;
  const p = active();
  if (p.board.length >= MAX_BOARD) return alert('Board full (max 5)');
  const idx = p.hand.findIndex(c => c.uid === handCardUid);
  if (idx === -1) return;
  const card = p.hand[idx];
  if (card.type !== 'creature') return;
  if (card.cost > p.manaCurrent) return alert(`Need ${card.cost} mana, have ${p.manaCurrent}`);

  p.manaCurrent -= card.cost;
  p.hand.splice(idx, 1);

  const instance = {
    ...card,
    uid:              card.uid,
    healthCurrent:    card.healthMax,
    tapped:           false,
    summonedThisTurn: true,   // SUMMONING SICKNESS — cannot attack this turn
    _preventDmg:      0
  };
  p.board.push(instance);
  log(`▶ ${pLabel(G.activePlayer)} plays ${card.name} (summoning sickness)`);
  resolveAbility(instance, 'on_play', G.activePlayer);

  if (G.state === STATE.COMBAT_SELECT_TAP_TARGET) {
    G.pendingTap.continuation = () => {
      G.state = STATE.PLAY_CREATURES;
      renderAll();
    };
    renderAll();
    return;
  }

  renderAll();
}

// Transition: leave PLAY_CREATURES → enter COMBAT_PRE_ACTIONS
function enterCombat() {
  if (G.state !== STATE.PLAY_CREATURES) return;
  G.state = STATE.COMBAT_PRE_ACTIONS;
  renderAll();
}

// ── 3.0 PRE-COMBAT ACTIONS (before selecting attacker) ──────
function playPreActionCard(handCardUid) {
  if (G.state !== STATE.COMBAT_PRE_ACTIONS) return;
  const p = active();
  const idx = p.hand.findIndex(c => c.uid === handCardUid);
  if (idx === -1) return;
  const card = p.hand[idx];
  if (card.type !== 'action') return;
  if (card.cost > p.manaCurrent) return alert(`Need ${card.cost} mana, have ${p.manaCurrent}`);

  p.manaCurrent -= card.cost;
  p.hand.splice(idx, 1);
  log(`▶ ${pLabel(G.activePlayer)} plays action: ${card.name}`);
  resolveAbility({ ...card }, 'on_resolve', G.activePlayer);

  if (G.state === STATE.COMBAT_SELECT_TAP_TARGET) {
    // Wait for player to choose which creature to tap
    G.pendingTap.continuation = () => {
      p.graveyard.push(card);
      G.state = STATE.COMBAT_PRE_ACTIONS;
      renderAll();
    };
    renderAll();
    return;
  }

  p.graveyard.push(card);
  renderAll();
}

function skipPreActions() {
  if (G.state !== STATE.COMBAT_PRE_ACTIONS) return;
  G.state = STATE.COMBAT_SELECT_ATTACKER;
  renderAll();
}

// ── 3.1 SELECT ATTACKER ─────────────────────────────────────
function selectAttacker(creatureUid) {
  if (G.state !== STATE.COMBAT_SELECT_ATTACKER) return;
  const p = active();
  const creature = p.board.find(c => c.uid === creatureUid);
  if (!creature) return;
  if (creature.tapped) return alert('Already attacked this turn');
  if (creature.summonedThisTurn) return alert(`${creature.name} has summoning sickness — cannot attack the turn it was played`);

  G.combat.attacker       = creatureUid;
  G.combat.pendingActions = [];
  G.combat.resolvedActions= [];
  G.combat.target         = null;
  G.combat.blockCard      = null;
  G.state = STATE.COMBAT_ATTACK_ACTIONS;
  log(`⚔ ${pLabel(G.activePlayer)} declares ${creature.name} as attacker`);
  renderAll();
}

// ── 3.2 ATTACK ACTIONS ──────────────────────────────────────
function playActionCard(handCardUid) {
  if (G.state !== STATE.COMBAT_ATTACK_ACTIONS) return;
  const p = active();
  const idx = p.hand.findIndex(c => c.uid === handCardUid);
  if (idx === -1) return;
  const card = p.hand[idx];
  if (card.type !== 'action') return;
  if (card.cost > p.manaCurrent) return alert(`Need ${card.cost} mana, have ${p.manaCurrent}`);

  p.manaCurrent -= card.cost;
  p.hand.splice(idx, 1);
  G.combat.pendingActions.push(card);
  log(`▶ ${pLabel(G.activePlayer)} plays action: ${card.name}`);
  renderAll();
}

function skipActions() {
  if (G.state !== STATE.COMBAT_ATTACK_ACTIONS) return;
  G.combat.pendingActions = [];
  G.state = STATE.COMBAT_APPLY_ACTIONS;
  doApplyActions();
}

// ── 3.3 / 3.4 APPLY ACTIONS ─────────────────────────────────
// After attacker's action cards are played, resolve them, then move to target
function proceedApplyActions() {
  if (G.state !== STATE.COMBAT_ATTACK_ACTIONS) return;
  G.state = STATE.COMBAT_APPLY_ACTIONS;
  doApplyActions();
}

function doApplyActions() {
  const actions = [...G.combat.pendingActions];
  G.combat.pendingActions = [];
  _applyActionsStep(actions, 0);
}

// Process action cards one by one so tap_enemy can pause for target selection
function _applyActionsStep(actions, i) {
  if (i >= actions.length) {
    G.combat.resolvedActions = actions;
    // After all action cards, fire attacker's on_attack ability
    const attCard = active().board.find(c => c.uid === G.combat.attacker);
    if (attCard) {
      resolveAbility(attCard, 'on_attack', G.activePlayer);
      if (G.state === STATE.COMBAT_SELECT_TAP_TARGET) {
        G.pendingTap.continuation = () => {
          if (G.state === STATE.GAME_OVER) return;
          G.state = STATE.COMBAT_SELECT_TARGET;
          renderAll();
        };
        renderAll();
        return;
      }
    }
    if (G.state === STATE.GAME_OVER) return;
    G.state = STATE.COMBAT_SELECT_TARGET;
    renderAll();
    return;
  }

  const ac = actions[i];
  resolveAbility({ ...ac, uid: ac.uid }, 'on_resolve', G.activePlayer);
  active().graveyard.push(ac);

  if (G.state === STATE.COMBAT_SELECT_TAP_TARGET) {
    G.pendingTap.continuation = () => {
      G.state = STATE.COMBAT_APPLY_ACTIONS;
      _applyActionsStep(actions, i + 1);
    };
    renderAll();
    return;
  }

  _applyActionsStep(actions, i + 1);
}

// ── 3.5 SELECT TARGET ───────────────────────────────────────
function selectTarget(targetUid) {
  if (G.state !== STATE.COMBAT_SELECT_TARGET) return;
  const def      = defender();
  const untapped = def.board.filter(c => !c.tapped);

  if (targetUid === 'player') {
    // Can only attack player directly if no untapped creatures exist (tapped ones can't defend)
    if (untapped.length > 0) return alert('Must attack an untapped creature first (tapped creatures cannot defend)');
    G.combat.target = 'player';
  } else {
    const t = def.board.find(c => c.uid === targetUid);
    if (!t) return;
    // Any creature can be attacked — tapped ones just won't counterattack
    G.combat.target = targetUid;
  }

  G.state = STATE.COMBAT_BLOCK;
  log(`🛡 ${pLabel(defenderKey())} may block`);
  renderAll();
}

// ── 3.6 BLOCK ───────────────────────────────────────────────
function playBlockCard(handCardUid) {
  if (G.state !== STATE.COMBAT_BLOCK) return;
  const def = defender();
  const idx = def.hand.findIndex(c => c.uid === handCardUid);
  if (idx === -1) return;
  const card = def.hand[idx];
  if (!card.block || card.block === 0) return alert('No block value on this card');

  def.hand.splice(idx, 1);
  def.graveyard.push(card);
  G.combat.blockCard = card;
  log(`🛡 ${pLabel(defenderKey())} blocks with ${card.name} (block ${card.block})`);
  resolveCombat();
}

function skipBlock() {
  if (G.state !== STATE.COMBAT_BLOCK) return;
  G.combat.blockCard = null;
  log(`${pLabel(defenderKey())} does not block`);
  resolveCombat();
}

// ── 3.7 COMBAT RESOLVE ──────────────────────────────────────
function resolveCombat() {
  G.state = STATE.COMBAT_RESOLVE;
  const attCard  = active().board.find(c => c.uid === G.combat.attacker);
  if (!attCard) { afterCombat(); return; }

  const blockVal = G.combat.blockCard ? G.combat.blockCard.block : 0;
  const def      = defender();
  const dKey     = defenderKey();

  // Block reduces outgoing damage but doesn't kill attacker
  const damage = Math.max(0, attCard.attack - blockVal);

  if (blockVal > 0) {
    log(`🛡 Block absorbs ${Math.min(blockVal, attCard.attack)} of ${attCard.attack} → ${damage} gets through`);
  }

  if (G.combat.target === 'player') {
    def.hp -= damage;
    log(`💥 ${damage} damage to ${pLabel(dKey)} → HP ${def.hp}`);
  } else {
    const target = def.board.find(c => c.uid === G.combat.target);
    if (target) {
      // Attacker → Target
      const prevent   = target._preventDmg || 0;
      const actualDmg = Math.max(0, damage - prevent);
      target._preventDmg    = 0;
      target.healthCurrent -= actualDmg;
      log(`💥 ${attCard.name} deals ${actualDmg} to ${target.name} → HP ${target.healthCurrent}/${target.healthMax}`);
      if (actualDmg > 0) resolveAbility(target, 'on_damage', dKey);

      // Counterattack — only untapped (non-exhausted) creatures fight back
      if (!target.tapped) {
        const counterDmg = target.attack;
        attCard.healthCurrent -= counterDmg;
        log(`⚡ ${target.name} counterattacks for ${counterDmg} → ${attCard.name} HP ${attCard.healthCurrent}/${attCard.healthMax}`);
        if (counterDmg > 0) resolveAbility(attCard, 'on_damage', G.activePlayer);
      } else {
        log(`💤 ${target.name} is tapped — no counterattack`);
      }
    }
  }

  attCard.tapped = true;
  checkDeath();
  if (G.state === STATE.GAME_OVER) return;
  afterCombat();
}

function afterCombat() {
  // Reset combat but stay in SELECT_ATTACKER loop — player picks next attacker or ends turn
  G.combat = { attacker: null, pendingActions: [], resolvedActions: [], target: null, blockCard: null };
  G.state  = STATE.COMBAT_SELECT_ATTACKER;
  renderAll();
}

// ── 4. END TURN ─────────────────────────────────────────────
function doEndTurn() {
  if (![STATE.PLAY_CREATURES, STATE.COMBAT_PRE_ACTIONS, STATE.COMBAT_SELECT_ATTACKER].includes(G.state)) return;
  G.state = STATE.END_TURN;
  const p = active();

  // NOTE: creature HP is NOT reset — damage accumulates between turns
  p.board.forEach(c => { c._preventDmg = 0; });

  // Discard to hand limit
  while (p.hand.length > MAX_HAND) {
    const disc = p.hand.pop();
    p.graveyard.push(disc);
    log(`🗑 ${pLabel(G.activePlayer)} discards ${disc.name}`);
  }

  log(`⏭ ${pLabel(G.activePlayer)} ends turn`);
  G.activePlayer = G.activePlayer === 'p1' ? 'p2' : 'p1';
  doMaintenance();
}

// ============================================================
// RENDER
// ============================================================
function renderAll() {
  renderPlayer('p2', true);
  renderPlayer('p1', false);
  renderControls();
  renderLog();
  renderPhaseBar();
}

function renderPlayer(pid, isTop) {
  const p            = G.players[pid];
  const prefix       = isTop ? 'top' : 'bot';
  const isActive     = G.activePlayer === pid;
  const isDefending  = !isActive;

  // Stats
  document.getElementById(`${prefix}-hp`).textContent    = p.hp;
  document.getElementById(`${prefix}-mana`).textContent  = `${p.manaCurrent}/${p.manaAvailable}`;
  document.getElementById(`${prefix}-deck`).textContent  = p.deck.length;
  document.getElementById(`${prefix}-grave`).textContent = p.graveyard.length;

  const labelEl = document.getElementById(`${prefix}-player-label`);
  if (labelEl) {
    labelEl.textContent = pid === 'p1' ? 'Player 1' : 'Player 2';
    labelEl.className   = 'player-label' + (isActive ? ' active-player' : '');
  }

  // ---- BOARD ----
  const boardEl = document.getElementById(`${prefix}-board`);
  boardEl.innerHTML = '';

  for (let i = 0; i < 5; i++) {
    const c    = p.board[i];
    const slot = document.createElement('div');
    slot.className = 'card-slot';

    if (c) {
      const isAttacking = G.combat.attacker === c.uid;
      const isTarget    = G.combat.target === c.uid;

      // Can be clicked as attacker?
      const canBeAttacker = isActive
        && !c.tapped
        && !c.summonedThisTurn
        && G.state === STATE.COMBAT_SELECT_ATTACKER;

      // Any defender creature can be targeted; tapped ones won't counterattack
      const canBeTarget = isDefending
        && G.state === STATE.COMBAT_SELECT_TARGET;

      // Can be clicked as tap target?
      const canBeTapTarget = G.state === STATE.COMBAT_SELECT_TAP_TARGET
        && G.pendingTap
        && pid !== G.pendingTap.ownerPid
        && !c.tapped;

      slot.classList.add('filled');
      if (c.tapped)           slot.classList.add('tapped-slot');
      if (canBeAttacker)      { slot.classList.add('can-attack'); slot.onclick = () => selectAttacker(c.uid); slot.title = `Attack with ${c.name}`; }
      if (canBeTarget)        { slot.classList.add('targetable');  slot.onclick = () => selectTarget(c.uid);
        slot.title = c.tapped ? `Attack ${c.name} (tapped — no counterattack)` : `Attack ${c.name} (will counterattack!)`; }
      if (canBeTapTarget)     { slot.classList.add('targetable'); slot.onclick = () => selectTapTarget(c.uid); slot.title = `Tap ${c.name}`; }
      if (c.summonedThisTurn && isActive) slot.classList.add('summoning-sick');

      // Incoming damage preview
      let incomingDmg = 0;
      if (isTarget && (G.state === STATE.COMBAT_BLOCK || G.state === STATE.COMBAT_SELECT_TARGET)) {
        const att = active().board.find(x => x.uid === G.combat.attacker);
        if (att) incomingDmg = att.attack;
      }

      slot.innerHTML = renderCreatureCard(c, isAttacking, isTarget, incomingDmg);
    } else {
      slot.innerHTML = '<span class="empty-slot-label">—</span>';
    }
    boardEl.appendChild(slot);
  }

  // ---- HAND ----
  const handEl = document.getElementById(`${prefix}-hand`);
  handEl.innerHTML = '';

  p.hand.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'hand-card';
    cardEl.innerHTML = renderHandCard(card);

    let clickable = false;
    let clickFn   = null;

    // Play creature during PLAY_CREATURES phase
    if (isActive && G.state === STATE.PLAY_CREATURES
        && card.type === 'creature'
        && card.cost <= p.manaCurrent
        && p.board.length < MAX_BOARD) {
      clickable = true; clickFn = () => playCreature(card.uid);
      cardEl.title = 'Summon this creature';
    }
    // Play action before selecting attacker (PRE_ACTIONS)
    if (isActive && G.state === STATE.COMBAT_PRE_ACTIONS
        && card.type === 'action'
        && card.cost <= p.manaCurrent) {
      clickable = true; clickFn = () => playPreActionCard(card.uid);
      cardEl.title = 'Play action before combat';
    }
    // Play action during COMBAT_ATTACK_ACTIONS
    if (isActive && G.state === STATE.COMBAT_ATTACK_ACTIONS
        && card.type === 'action'
        && card.cost <= p.manaCurrent) {
      clickable = true; clickFn = () => playActionCard(card.uid);
      cardEl.title = 'Play action card';
    }
    // Block during COMBAT_BLOCK (defender only)
    if (isDefending && G.state === STATE.COMBAT_BLOCK && (card.block || 0) > 0) {
      clickable = true; clickFn = () => playBlockCard(card.uid);
      cardEl.title  = `Block with ${card.name} (🛡 ${card.block})`;
      cardEl.classList.add('can-block');
    }

    if (clickable) { cardEl.classList.add('clickable'); cardEl.onclick = clickFn; }
    handEl.appendChild(cardEl);
  });
}

// ---- CREATURE ON BOARD ----
function renderCreatureCard(c, isAttacking, isTarget, incomingDmg) {
  const classes = [
    'creature-card',
    c.tapped            ? 'tapped'    : '',
    isAttacking         ? 'attacking' : '',
    isTarget            ? 'targeted'  : '',
    c.summonedThisTurn  ? 'sick'      : ''
  ].filter(Boolean).join(' ');

  const dmgBadge  = incomingDmg > 0
    ? `<div class="incoming-dmg">💥 -${incomingDmg}</div>` : '';
  const sickBadge = c.summonedThisTurn
    ? `<div class="sick-badge">⏳ summoned</div>` : '';

  let abilityText = '';
  if (c.ability) {
    const e = c.ability.effect;
    const t = c.ability.trigger;
    const v = c.ability.value;
    if (e === 'rush')            abilityText = `⚡ Rush`;
    else if (e === 'tap_enemy')       abilityText = `${t}: 🌀 Tap enemy`;
    else if (e === 'damage_and_tap')  abilityText = `${t}: 🗡 ${v} dmg + tap`;
    else if (e === 'buff_attack_all') abilityText = `${t}: 📯 All allies +${v} ATK`;
    else if (e === 'buff_health_all') abilityText = `${t}: 💛 All allies +${v} HP`;
    else if (e === 'drain_life')      abilityText = `${t}: 🩸 Drain ${v}`;
    else                              abilityText = `${t}: ${e} ${v}`;
  }

  const artStyle = c.art ? `style="background-image:url('${c.art}')"` : '';

  return `
    <div class="${classes} ${c.art ? 'has-art' : ''}" ${artStyle}>
      <div class="board-name-bar">${c.name}</div>
      <div class="board-bottom">
        <div class="board-stats-row">
          <span class="stat-pill atk">⚔${c.attack}</span>
          <span class="stat-pill hp-bar">${c.healthCurrent}/${c.healthMax}♥</span>
          <span class="stat-pill blk">🛡${c.block}</span>
        </div>
        ${abilityText ? `<div class="board-ability-bar">${abilityText}</div>` : ''}
      </div>
      ${sickBadge}
      ${dmgBadge}
    </div>`;
}

// ---- HAND CARD ----
function renderHandCard(card) {
  function abilityDesc(ab) {
    if (!ab) return '—';
    const { effect, trigger, value, target } = ab;
    if (effect === 'rush')            return '⚡ Rush (attack immediately)';
    if (effect === 'tap_enemy')       return `${trigger}: 🌀 Tap enemy creature`;
    if (effect === 'gain_mana')       return `Discard → +${value} mana`;
    if (effect === 'damage_and_tap')  return `${trigger}: 🗡 Deal ${value} dmg + tap enemy`;
    if (effect === 'buff_attack_all') return `${trigger}: 📯 All allies +${value} ATK`;
    if (effect === 'buff_health_all') return `${trigger}: 💛 All allies +${value} HP`;
    if (effect === 'drain_life')      return `${trigger}: 🩸 Drain ${value} from player`;
    if (effect === 'deal_damage') {
      const tLabel = target === 'enemy_player' ? 'player' : target === 'ally_creature' ? 'ally' : 'creature';
      return `${trigger}: deal ${value} dmg to ${tLabel}`;
    }
    if (effect === 'heal') {
      const tLabel = target === 'self' ? 'player' : 'creature';
      return `${trigger}: heal ${value} to ${tLabel}`;
    }
    if (effect === 'draw')        return `${trigger}: draw ${value}`;
    if (effect === 'buff_attack') return `${trigger}: +${value} ATK`;
    if (effect === 'buff_health') return `${trigger}: +${value} HP`;
    if (effect === 'prevent_damage') return `${trigger}: prevent ${value} dmg`;
    return `${trigger}: ${effect} ${value}`;
  }

  if (card.type === 'creature') {
    const artStyle = card.art ? `style="background-image:url('${card.art}')"` : '';
    const hasArt = card.art ? 'has-art' : '';
    const abilityHtml = card.ability
      ? `<div class="hand-ability-bar">${abilityDesc(card.ability)}</div>` : '';
    return `<div class="card-inner creature-type hand-creature ${hasArt}" ${artStyle}>
      <div class="hand-top-bar">
        <span class="card-type-badge">Creature</span>
        <span class="card-cost">💎${card.cost}</span>
      </div>
      <div class="hand-bottom-bar">
        <div class="hand-name">${card.name}</div>
        <div class="hand-stats-row">
          <span class="stat-pill atk">⚔${card.attack}</span>
          <span class="stat-pill hp-bar">♥${card.healthMax}</span>
          <span class="stat-pill blk">🛡${card.block}</span>
        </div>
        ${abilityHtml}
      </div>
    </div>`;
  }

  // Action
  const effectLabel = {
    deal_damage:     `💥 Deal ${card.ability.value} dmg to ${card.ability.target === 'enemy_player' ? 'player' : 'creature'}`,
    heal:            `💚 Heal ${card.ability.value} to ${card.ability.target === 'self' ? 'player' : 'creature'}`,
    draw:            `🃏 Draw ${card.ability.value} cards`,
    rush:            `⚡ Grant Rush to a creature`,
    gain_mana:       `💎 Discard → +${card.ability.value} mana`,
    tap_enemy:       `🌀 Tap an enemy creature`,
    buff_attack:     `⬆ +${card.ability.value} ATK`,
    prevent_damage:  `🛡 Prevent ${card.ability.value} damage`,
    damage_and_tap:  `🗡 Deal ${card.ability.value} dmg + tap enemy creature`,
    buff_attack_all: `📯 All allies +${card.ability.value} ATK`,
    buff_health_all: `💛 All allies +${card.ability.value} HP`,
    drain_life:      `🩸 Deal ${card.ability.value} dmg to player, heal self ${card.ability.value}`,
  }[card.ability.effect] || `${card.ability.effect} ${card.ability.value}`;

  const artStyle = card.art ? `style="background-image:url('${card.art}')"` : '';
  const hasArt = card.art ? 'has-art' : '';

  return `<div class="card-inner action-type hand-creature ${hasArt}" ${artStyle}>
    <div class="hand-top-bar">
      <span class="card-type-badge">Action</span>
      <span class="card-cost">💎${card.cost}</span>
    </div>
    <div class="hand-bottom-bar">
      <div class="hand-name">${card.name}</div>
      <div class="hand-stats-row">
        ${card.block ? `<span class="stat-pill blk">🛡${card.block}</span>` : ''}
      </div>
      <div class="hand-ability-bar">${effectLabel}</div>
    </div>
  </div>`;
}

// ---- CONTROLS ----
function renderControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';
  if (G.state === STATE.GAME_OVER) return;

  const attCard     = active().board.find(c => c.uid === G.combat.attacker);
  const def         = defender();
  const untappedDef = def.board.filter(c => !c.tapped);
  const canAttack   = active().board.filter(c => !c.tapped && !c.summonedThisTurn);

  switch (G.state) {

    case STATE.PLAY_CREATURES:
      hint(ctrl, `2 · Play creatures from hand. When ready, enter combat or skip to end turn.`);
      btn(ctrl, `⚔ Enter Combat`, enterCombat);
      skipBtn(ctrl, `⏭ Skip to End Turn`, doEndTurn);
      break;

    case STATE.COMBAT_PRE_ACTIONS: {
      const hasActions = active().hand.some(c => c.type === 'action' && c.cost <= active().manaCurrent);
      hint(ctrl, `3.0 · Play action cards before declaring attacker${hasActions ? ' (click action in hand)' : ' — no actions available'}`);
      btn(ctrl, `➡ Select Attacker`, skipPreActions);
      skipBtn(ctrl, `⏭ End Turn`, doEndTurn);
      break;
    }

    case STATE.COMBAT_SELECT_ATTACKER:
      if (canAttack.length > 0) {
        hint(ctrl, `3.1 · Click an untapped creature on your board to attack with it`);
      } else {
        hint(ctrl, `3.1 · No creatures available to attack`);
      }
      skipBtn(ctrl, `⏭ End Turn`, doEndTurn);
      break;

    case STATE.COMBAT_ATTACK_ACTIONS: {
      const nm = attCard ? attCard.name : '?';
      const atk = attCard ? attCard.attack : 0;
      hint(ctrl, `3.2 · ${nm} (⚔ ${atk}) — play action cards from hand to buff this attack`);
      btn(ctrl,  `➡ Apply & Select Target`, proceedApplyActions);
      skipBtn(ctrl, `⏩ Skip Actions`, skipActions);
      break;
    }

    case STATE.COMBAT_APPLY_ACTIONS:
      hint(ctrl, `3.4 · Applying action results…`);
      break;

    case STATE.COMBAT_SELECT_TARGET: {
      const untappedDef = def.board.filter(c => !c.tapped);
      const tappedDef   = def.board.filter(c => c.tapped);
      if (def.board.length === 0) {
        hint(ctrl, `3.5 · No defenders — attack player directly`);
        btn(ctrl, `⚔ Attack ${pLabel(defenderKey())}`, () => selectTarget('player'));
      } else if (untappedDef.length === 0 && tappedDef.length > 0) {
        hint(ctrl, `3.5 · All defenders are tapped (no counterattack) — or attack player`);
        btn(ctrl, `⚔ Attack ${pLabel(defenderKey())}`, () => selectTarget('player'));
      } else {
        hint(ctrl, `3.5 · Untapped creatures counterattack! Tapped ones don't. Choose wisely.`);
      }
      break;
    }

    case STATE.COMBAT_BLOCK: {
      const attk = attCard ? attCard.attack : 0;
      hint(ctrl, `3.6 · ${pLabel(defenderKey())}: click a 🛡 card in hand to block. Attacker has ${attk} ATK.`);
      skipBtn(ctrl, `🚫 No Block — take ${attk} damage`, skipBlock);
      break;
    }

    case STATE.COMBAT_SELECT_TAP_TARGET: {
      const tapName = G.pendingTap ? G.pendingTap.cardName : '?';
      hint(ctrl, `🌀 ${tapName}: click an enemy creature to tap it`);
      break;
    }

    case STATE.COMBAT_RESOLVE:
      hint(ctrl, `3.7 · Resolving combat…`);
      break;
  }
}

function btn(parent, label, fn) {
  const b = document.createElement('button');
  b.className = 'ctrl-btn';
  b.textContent = label;
  b.onclick = fn;
  parent.appendChild(b);
}

function skipBtn(parent, label, fn) {
  const b = document.createElement('button');
  b.className = 'ctrl-btn skip-btn';
  b.textContent = label;
  b.onclick = fn;
  parent.appendChild(b);
}

function hint(parent, text) {
  const d = document.createElement('div');
  d.className = 'ctrl-hint';
  d.textContent = text;
  parent.appendChild(d);
}

// ---- PHASE BAR ----
const PHASE_STEPS = [
  { key: STATE.MAINTENANCE,              label: '1 · Maintenance' },
  { key: STATE.PLAY_CREATURES,           label: '2 · Play / Summon' },
  { key: STATE.COMBAT_PRE_ACTIONS,       label: '3.0 · Pre-Combat Actions' },
  { key: STATE.COMBAT_SELECT_ATTACKER,   label: '3.1 · Select Attacker' },
  { key: STATE.COMBAT_ATTACK_ACTIONS,    label: '3.2 · Attack Actions' },
  { key: STATE.COMBAT_APPLY_ACTIONS,     label: '3.4 · Apply Actions' },
  { key: STATE.COMBAT_SELECT_TAP_TARGET, label: '· Select Tap Target' },
  { key: STATE.COMBAT_SELECT_TARGET,     label: '3.5 · Select Target' },
  { key: STATE.COMBAT_BLOCK,             label: '3.6 · Block' },
  { key: STATE.COMBAT_RESOLVE,           label: '3.7 · Resolve' },
  { key: STATE.END_TURN,                 label: '4 · End Turn' },
];

function renderPhaseBar() {
  const bar = document.getElementById('phase-bar');
  if (!bar) return;
  bar.innerHTML = '';

  const tc = document.createElement('div');
  tc.className   = 'turn-counter';
  tc.textContent = `Turn ${G.globalTurn}`;
  bar.appendChild(tc);

  const pi = document.createElement('div');
  pi.className   = 'active-player-badge';
  pi.textContent = pLabel(G.activePlayer);
  bar.appendChild(pi);

  const steps = document.createElement('div');
  steps.className = 'phase-steps';
  PHASE_STEPS.forEach(ph => {
    const s = document.createElement('div');
    s.className   = 'phase-step' + (G.state === ph.key ? ' phase-step-active' : '');
    s.textContent = ph.label;
    steps.appendChild(s);
  });
  bar.appendChild(steps);
}

// ---- LOG ----
function renderLog() {
  const el = document.getElementById('log');
  el.innerHTML = G.log.map(l => `<div class="log-entry">${l}</div>`).join('');
}

// ---- GAME OVER ----
function showGameOver() {
  document.getElementById('game-over-overlay').style.display = 'flex';
  document.getElementById('game-over-msg').textContent = `🏆 ${pLabel(G.winner)} Wins!`;
}

// ============================================================
// CARD PREVIEW — follows mouse, position: fixed, never clipped
// ============================================================
(function() {
  const preview = document.createElement('div');
  preview.id = 'card-preview';
  document.body.appendChild(preview);

  let currentX = 0, currentY = 0;

  document.addEventListener('mousemove', e => {
    currentX = e.clientX;
    currentY = e.clientY;
    if (preview.style.display === 'block') positionPreview();
  });

  function positionPreview() {
    const pw = 200, ph = 280;
    const vw = window.innerWidth, vh = window.innerHeight;
    const margin = 12;

    let x = currentX + 16;
    let y = currentY - ph - 16; // show above cursor

    // Flip left if too close to right edge
    if (x + pw + margin > vw) x = currentX - pw - 16;
    // If not enough room above, show below cursor
    if (y < margin) y = currentY + 16;
    // Clamp vertically to screen
    if (y + ph + margin > vh) y = vh - ph - margin;
    if (y < margin) y = margin;

    preview.style.left = x + 'px';
    preview.style.top  = y + 'px';
  }

  // Attach listeners via event delegation on document
  document.addEventListener('mouseover', e => {
    const card = e.target.closest('.hand-card');
    if (!card) return;
    const inner = card.querySelector('.card-inner');
    if (!inner) return;
    preview.innerHTML = inner.outerHTML;
    preview.style.display = 'block';

    // Add glow class based on card state
    const previewInner = preview.querySelector('.card-inner');
    if (card.classList.contains('clickable')) {
      previewInner.classList.add('preview-glow-green');
    } else if (card.classList.contains('can-block')) {
      previewInner.classList.add('preview-glow-blue');
    }
    positionPreview();
  });

  document.addEventListener('mouseout', e => {
    const card = e.target.closest('.hand-card');
    if (!card) return;
    // Only hide if we actually left the hand-card (not just moved to a child)
    if (!card.contains(e.relatedTarget)) {
      preview.style.display = 'none';
    }
  });
})();

// ---- BOOT ----
window.addEventListener('DOMContentLoaded', async () => {
  await loadCards();
  initGame();
  document.getElementById('restart-btn').onclick = () => {
    document.getElementById('game-over-overlay').style.display = 'none';
    initGame();
  };
  document.getElementById('new-game-btn').onclick = () => {
    document.getElementById('game-over-overlay').style.display = 'none';
    initGame();
  };
});