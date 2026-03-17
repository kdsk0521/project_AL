'use strict';

// Combat System - Auto-battle with AP, simultaneous resolution
class CombatSystem {
  constructor(engine) {
    this.engine = engine;
    this.battleState = null;
  }

  // Initialize a battle
  startBattle(playerParty, enemies) {
    this.battleState = {
      round: 0,
      allies: playerParty.map(u => this.toBattleUnit(u, true)),
      enemies: enemies.map(u => this.toBattleUnit(u, false)),
      log: [],
      finished: false,
      result: null // 'win', 'lose', 'flee'
    };
    this.battleState.log.push({ type: 'start', text: '전투 시작!' });
    return this.battleState;
  }

  toBattleUnit(unit, isAlly) {
    const apFromSpeed = Math.min(4, Math.max(2, Math.floor(unit.spd / 8) + 2));
    return {
      instanceId: unit.instanceId || unit.unitId,
      name: unit.name,
      isAlly,
      hp: unit.hp || unit.maxHp,
      maxHp: unit.maxHp || unit.hp,
      atk: unit.atk,
      def: unit.def,
      spd: unit.spd,
      ap: apFromSpeed,
      maxAp: apFromSpeed,
      // Normalize traits to string names for AI matching
      traits: (unit.traits || []).map(t => typeof t === 'object' ? (t.id || t.name) : t),
      personalityTraits: (unit.personalityTraits || []).map(t => typeof t === 'object' ? (t.name || t.id) : t),
      element: unit.primaryElement || null,
      defenseProfile: unit.defenseProfile || { physical: 10, 열: 10, 위: 10, 동: 10, 광: 10, 식: 10 },
      isKO: false,
      buffs: [],
      category: unit.category || '요괴'
    };
  }

  // Run one round of combat (simultaneous resolution)
  executeRound() {
    if (this.battleState.finished) return this.battleState;

    this.battleState.round++;
    const round = this.battleState.round;
    const log = [];

    log.push({ type: 'round', text: `──── 라운드 ${round} ────` });

    // Reset AP for this round
    for (const u of [...this.battleState.allies, ...this.battleState.enemies]) {
      if (!u.isKO) u.ap = u.maxAp;
    }

    // Collect all actions (simultaneous)
    const allyActions = this.resolveTeamActions(this.battleState.allies, this.battleState.enemies);
    const enemyActions = this.resolveTeamActions(this.battleState.enemies, this.battleState.allies);

    // Apply all damage simultaneously
    const allActions = [...allyActions, ...enemyActions];
    for (const action of allActions) {
      log.push(action.logEntry);
    }

    // Apply damage
    for (const action of allActions) {
      if (action.target && action.damage > 0) {
        action.target.hp = Math.max(0, action.target.hp - action.damage);
        if (action.target.hp <= 0) {
          action.target.isKO = true;
          log.push({ type: 'ko', text: `${action.target.name}이(가) 쓰러졌다!` });
        }
      }
    }

    // Boss gimmick: 변이 슬라임 splits at 50% HP
    for (const enemy of this.battleState.enemies) {
      if (!enemy.isKO && enemy.canSplit && !enemy._hasSplit && enemy.hp <= enemy.maxHp * 0.5) {
        enemy._hasSplit = true;
        const mini = {
          ...enemy,
          name: '소형 슬라임',
          hp: Math.floor(enemy.maxHp * 0.25),
          maxHp: Math.floor(enemy.maxHp * 0.25),
          atk: Math.floor(enemy.atk * 0.6),
          def: Math.floor(enemy.def * 0.5),
          canSplit: false, isBoss: false, isKO: false, _hasSplit: false
        };
        this.battleState.enemies.push({ ...mini, name: '소형 슬라임 A' });
        this.battleState.enemies.push({ ...mini, name: '소형 슬라임 B' });
        log.push({ type: 'skill', text: `${enemy.name}이(가) 분열했다! 소형 슬라임 2체 출현!` });
      }
    }

    // Boss gimmick: 폭주 슬라임 element shift each round
    for (const enemy of this.battleState.enemies) {
      if (!enemy.isKO && enemy.elementShift) {
        const elements = ['열', '위', '동', '광', '식'];
        const newEl = elements[round % elements.length];
        enemy.defenseProfile[newEl] = (enemy.defenseProfile[newEl] || 25) + 10;
        log.push({ type: 'system', text: `${enemy.name}의 내성이 변화했다! (${newEl} 내성 상승)` });
      }
    }

    // Summary
    const allyDmg = allActions.filter(a => a.actor && a.actor.isAlly).reduce((s, a) => s + (a.damage || 0), 0);
    const enemyDmg = allActions.filter(a => a.actor && !a.actor.isAlly).reduce((s, a) => s + (a.damage || 0), 0);
    log.push({ type: 'summary', text: `아군 총 데미지: ${allyDmg} | 적 총 데미지: ${enemyDmg}` });

    // Check battle end
    const alliesAlive = this.battleState.allies.filter(u => !u.isKO);
    const enemiesAlive = this.battleState.enemies.filter(u => !u.isKO);

    if (enemiesAlive.length === 0) {
      this.battleState.finished = true;
      this.battleState.result = 'win';
      log.push({ type: 'result', text: '전투 승리!' });
    } else if (alliesAlive.length === 0) {
      this.battleState.finished = true;
      this.battleState.result = 'lose';
      log.push({ type: 'result', text: '전멸...' });
    }

    this.battleState.log.push(...log);
    return { round, log, finished: this.battleState.finished, result: this.battleState.result };
  }

  resolveTeamActions(team, opponents) {
    const actions = [];
    const aliveOpponents = opponents.filter(u => !u.isKO);
    if (aliveOpponents.length === 0) return actions;

    for (const unit of team) {
      if (unit.isKO) continue;
      let ap = unit.ap;

      while (ap > 0) {
        const action = this.chooseAction(unit, aliveOpponents, ap);
        if (!action || action.apCost > ap) break;
        ap -= action.apCost;
        actions.push(action);
      }
    }
    return actions;
  }

  chooseAction(unit, opponents, remainingAp) {
    // AI: personality-based action selection
    const personality = this.getPersonalityWeights(unit);
    const roll = Math.random() * 100;

    let actionType;
    if (roll < personality.attack) {
      actionType = 'attack';
    } else if (roll < personality.attack + personality.defend) {
      actionType = 'defend';
    } else {
      actionType = 'skill';
    }

    // Check conditional override (e.g., 심약 + HP < 30% → defend)
    if (unit.hp < unit.maxHp * 0.3 && unit.personalityTraits && unit.personalityTraits.includes('소심')) {
      if (Math.random() < 0.9) actionType = 'defend';
    }

    // Find a skill trait to use
    const skillTrait = this.findUsableSkill(unit, remainingAp);

    if (actionType === 'attack' || actionType === 'skill') {
      const target = opponents[Math.floor(Math.random() * opponents.length)];
      if (!target || target.isKO) return null;

      if (skillTrait && actionType === 'skill') {
        return this.executeSkill(unit, target, skillTrait);
      } else {
        return this.executeBasicAttack(unit, target);
      }
    } else if (actionType === 'defend') {
      return {
        actor: unit,
        target: null,
        damage: 0,
        apCost: 1,
        logEntry: { type: 'action', text: `${unit.name}이(가) 방어 자세를 취했다.` }
      };
    }

    return this.executeBasicAttack(unit, opponents[0]);
  }

  getPersonalityWeights(unit) {
    // Default weights
    let attack = 50, defend = 30, skill = 20;

    const traits = unit.personalityTraits || [];
    if (traits.includes('호전적') || traits.includes('겁없음') || traits.includes('공격적')) {
      attack = 80; defend = 10; skill = 10;
    } else if (traits.includes('소심') || traits.includes('경계심')) {
      attack = 20; defend = 60; skill = 20;
    } else if (traits.includes('냉정') || traits.includes('분석적')) {
      attack = 40; defend = 20; skill = 40;
    } else if (traits.includes('호기심') || traits.includes('변덕')) {
      attack = 30 + Math.random() * 40; defend = 15; skill = 55 - attack;
    } else if (traits.includes('순종적') || traits.includes('온순')) {
      attack = 40; defend = 40; skill = 20;
    }

    return { attack, defend, skill };
  }

  findUsableSkill(unit, remainingAp) {
    const traitData = this.engine.data.traits;
    if (!traitData) return null;

    for (const traitId of (unit.traits || [])) {
      const trait = traitData.find(t => t.id === traitId && t.category === '전투');
      if (trait && trait.apCost <= remainingAp) {
        return trait;
      }
    }
    return null;
  }

  executeBasicAttack(attacker, target) {
    const damage = this.calcDamage(attacker.atk, target.defenseProfile.physical, 1.0);
    return {
      actor: attacker,
      target,
      damage,
      apCost: 1,
      logEntry: {
        type: 'action',
        text: `${attacker.name}의 공격 → ${target.name}에게 ${damage} 데미지`
      }
    };
  }

  executeSkill(attacker, target, skill) {
    const element = skill.element || null;
    let defValue = target.defenseProfile.physical;
    if (element && target.defenseProfile[element] !== undefined) {
      defValue = target.defenseProfile[element];
    }

    const atkValue = element ? skill.power || attacker.atk : attacker.atk;
    const damage = this.calcDamage(atkValue, defValue, skill.multiplier || 1.2);

    return {
      actor: attacker,
      target,
      damage,
      apCost: skill.apCost || 2,
      logEntry: {
        type: 'skill',
        text: `${attacker.name}의 「${skill.name}」 → ${target.name}에게 ${damage} ${element ? `(${element})` : ''} 데미지`
      }
    };
  }

  // Damage formula: ATK × (ATK / (ATK + DEF)) × skillMultiplier
  calcDamage(atk, def, multiplier) {
    if (atk + def === 0) return 0;
    const rawDamage = atk * (atk / (atk + def)) * multiplier;
    // Add ±10% variance
    const variance = 0.9 + Math.random() * 0.2;
    return Math.max(1, Math.floor(rawDamage * variance));
  }

  // Apply battle results back to game state
  applyBattleResults() {
    if (!this.battleState) return null;

    const results = {
      won: this.battleState.result === 'win',
      drops: [],
      expGained: 0
    };

    if (results.won) {
      // Calculate drops
      for (const enemy of this.battleState.enemies) {
        const drops = this.generateDrops(enemy);
        results.drops.push(...drops);
      }

      // Add drops to inventory
      for (const drop of results.drops) {
        this.engine.addMaterial(drop.id, drop.qty);
      }

      // Calculate exp
      results.expGained = this.battleState.enemies.reduce((sum, e) => sum + (e.maxHp / 5), 0);

      // Apply exp to party
      for (const ally of this.battleState.allies) {
        if (!ally.isKO && ally.isAlly) {
          const unit = this.engine.getUnitInstance(ally.instanceId);
          if (unit) {
            unit.exp.combat += Math.floor(results.expGained);
            unit.exp.body += Math.floor(results.expGained * 0.3);
          }
        }
      }
    }

    // Apply HP changes and KO status back to unit instances
    for (const ally of this.battleState.allies) {
      const unit = this.engine.getUnitInstance(ally.instanceId);
      if (unit) {
        unit.hp = Math.max(0, ally.hp);
        if (ally.isKO) {
          unit.isKnockedOut = true;
          unit.recoveryDays = 3;
          unit.hp = 0;
        }
      }
    }

    // Player HP
    const playerBattle = this.battleState.allies[0];
    if (playerBattle) {
      this.engine.state.player.hp = Math.max(0, playerBattle.hp);
    }

    return results;
  }

  generateDrops(enemy) {
    const drops = [];

    // Boss drops: slime core (bulk) + spring
    if (enemy.isBoss) {
      drops.push({ id: 'MAT_SLIME_CORE', qty: 5 + Math.floor(Math.random() * 4), name: '슬라임핵' });
      drops.push({ id: 'MAT_SPRING', qty: 1, name: '스프링' });
      return drops;
    }

    // Slime enemies always drop slime core (confirmed + quantity bonus)
    if (enemy.isSlime || enemy.name.includes('슬라임')) {
      drops.push({ id: 'MAT_SLIME_CORE', qty: 1 + Math.floor(Math.random() * 2), name: '슬라임핵' });
      return drops;
    }

    // Unit drops — based on element affinity (구역별 드랍 테이블)
    // Primary element determines main drop, secondary gives chance for bonus
    const elementDrops = {
      '열': ['MAT_MAGIC_STONE', 'MAT_IRON_ORE'],       // 석굴/기관부 계열
      '위': ['MAT_IRON_ORE', 'MAT_MAGIC_STONE'],       // 석굴/결빙 계열
      '동': ['MAT_SLIME_CORE', 'MAT_WATER'],            // 수계/기관부 계열
      '광': ['MAT_POISON_FISH', 'MAT_WATER'],            // 수계 계열
      '식': ['MAT_HERB', 'MAT_CATALYST_HERB']            // 독림 계열
    };

    // Main drop (60% chance) — based on primary element
    const mainPool = elementDrops[enemy.primaryElement] || ['MAT_SLIME_CORE'];
    if (Math.random() < 0.6) {
      const pick = mainPool[Math.floor(Math.random() * mainPool.length)];
      drops.push({ id: pick, qty: 1, name: this.engine.getMaterialName(pick) });
    }

    // Bonus drop (25% chance) — random from all Tier 1
    if (Math.random() < 0.25) {
      const allT1 = ['MAT_HERB', 'MAT_CATALYST_HERB', 'MAT_IRON_ORE', 'MAT_MAGIC_STONE', 'MAT_POISON_FISH', 'MAT_WATER', 'MAT_SLIME_CORE'];
      const pick = allT1[Math.floor(Math.random() * allT1.length)];
      drops.push({ id: pick, qty: 1, name: this.engine.getMaterialName(pick) });
    }

    // Slime core always has a small chance (15%) from any unit combat
    if (Math.random() < 0.15) {
      drops.push({ id: 'MAT_SLIME_CORE', qty: 1, name: '슬라임핵' });
    }

    return drops;
  }

  // Flee attempt
  attemptFlee(partySpeed) {
    const enemySpeed = this.battleState.enemies.reduce((s, e) => s + e.spd, 0) / this.battleState.enemies.length;
    const successRate = 0.4 + (partySpeed - enemySpeed) * 0.02;
    const success = Math.random() < Math.max(0.2, Math.min(0.9, successRate));

    if (success) {
      this.battleState.finished = true;
      this.battleState.result = 'flee';
    }
    return success;
  }

  // Create enemy unit for dungeon encounter
  createEnemyFromDef(unitDef, levelScale = 0) {
    const level = unitDef.level + levelScale;
    const catStats = {
      '요괴': { hp: 100, atk: 18, def: 12, spd: 12 },
      '정령': { hp: 100, atk: 14, def: 14, spd: 14 },
      '인조': { hp: 120, atk: 14, def: 18, spd: 8 },
      '야수': { hp: 80, atk: 14, def: 8, spd: 18 },
      '환상': { hp: 70, atk: 10, def: 10, spd: 10 }
    };
    const base = catStats[unitDef.category] || catStats['요괴'];

    return {
      unitId: unitDef.id,
      name: unitDef.name,
      level,
      hp: base.hp + level * 4,
      maxHp: base.hp + level * 4,
      atk: base.atk + level * 2,
      def: base.def + level * 2,
      spd: base.spd + level * 2,
      traits: unitDef.combatTraits || [],
      personalityTraits: unitDef.personalityTraits || [],
      primaryElement: unitDef.primaryElement,
      category: unitDef.category,
      defenseProfile: this.engine.calcDefenseProfile(unitDef),
      sigil: unitDef.sigil,
      acquisition: unitDef.acquisition
    };
  }

  // Create slime enemy (non-negotiable)
  createSlime(floor) {
    const level = 2 + floor;
    return {
      unitId: 'ENEMY_SLIME',
      name: '슬라임',
      level,
      hp: 30 + floor * 8,
      maxHp: 30 + floor * 8,
      atk: 5 + floor * 2,
      def: 3 + floor,
      spd: 4 + floor,
      traits: [],
      personalityTraits: [],
      primaryElement: null,
      category: '요괴',
      defenseProfile: { physical: 3 + floor, 열: 3, 위: 3, 동: 3, 광: 3, 식: 3 },
      isSlime: true
    };
  }

  // Create boss enemy
  createBoss(floor) {
    if (floor === 5) {
      return {
        unitId: 'BOSS_GIANT_SLIME',
        name: '거대 슬라임',
        level: 8,
        hp: 200,
        maxHp: 200,
        atk: 22,
        def: 15,
        spd: 6,
        traits: [],
        personalityTraits: [],
        primaryElement: null,
        category: '요괴',
        defenseProfile: { physical: 20, 열: 8, 위: 8, 동: 8, 광: 8, 식: 8 },
        isBoss: true,
        isSlime: true
      };
    } else if (floor === 10) {
      return {
        unitId: 'BOSS_MUTANT_SLIME',
        name: '변이 슬라임',
        level: 16,
        hp: 400,
        maxHp: 400,
        atk: 35,
        def: 25,
        spd: 10,
        traits: [],
        personalityTraits: [],
        primaryElement: '식',
        category: '요괴',
        defenseProfile: { physical: 30, 열: 15, 위: 15, 동: 15, 광: 15, 식: 20 },
        isBoss: true,
        isSlime: true,
        canSplit: true // Gimmick: splits at 50% HP
      };
    } else if (floor === 15) {
      return {
        unitId: 'BOSS_BERSERK_SLIME',
        name: '폭주 슬라임',
        level: 24,
        hp: 700,
        maxHp: 700,
        atk: 50,
        def: 35,
        spd: 14,
        traits: [],
        personalityTraits: [],
        primaryElement: '동',
        category: '요괴',
        defenseProfile: { physical: 40, 열: 25, 위: 25, 동: 30, 광: 25, 식: 25 },
        isBoss: true,
        isSlime: true,
        canSplit: true,
        elementShift: true // Gimmick: changes resistance each round
      };
    }
    return this.createSlime(floor);
  }
}

module.exports = CombatSystem;
