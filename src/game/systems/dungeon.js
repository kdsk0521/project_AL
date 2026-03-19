'use strict';

// Dungeon Exploration System - Node-based traversal
class DungeonSystem {
  constructor(engine) {
    this.engine = engine;
    this.combat = null; // set by app
  }

  // Enter dungeon
  enterDungeon(targetFloor = 1) {
    const state = this.engine.state;
    const staminaCost = 2 + Math.floor(targetFloor / 3);

    if (!this.engine.useStamina(staminaCost)) {
      return { success: false, reason: '스태미나가 부족합니다.' };
    }

    state.dungeon.inDungeon = true;
    state.dungeon.currentFloor = targetFloor;
    state.dungeon.collectedThisRun = [];

    // Find entrance node for this floor
    const floorNodes = this.getFloorNodes(targetFloor);
    const entrance = floorNodes.find(n => n.type === 'entrance');

    if (!entrance) {
      return { success: false, reason: `${targetFloor}층 데이터를 찾을 수 없습니다.` };
    }

    state.dungeon.currentNode = entrance.id;

    return {
      success: true,
      floor: targetFloor,
      node: entrance,
      staminaCost,
      message: `미궁 ${targetFloor}층에 진입했다.`
    };
  }

  // Get all nodes for a floor
  getFloorNodes(floor) {
    return this.engine.data.dungeonMap.filter(n => n.floor === floor);
  }

  // Get current node
  getCurrentNode() {
    return this.engine.data.dungeonMap.find(n => n.id === this.engine.state.dungeon.currentNode);
  }

  // Get connected nodes from current position
  getConnectedNodes() {
    const current = this.getCurrentNode();
    if (!current) return [];
    return current.connections.map(id =>
      this.engine.data.dungeonMap.find(n => n.id === id)
    ).filter(Boolean);
  }

  // Move to a connected node
  moveToNode(targetNodeId) {
    const current = this.getCurrentNode();
    if (!current) return { success: false, reason: '현재 위치를 찾을 수 없습니다.' };

    if (!current.connections.includes(targetNodeId)) {
      return { success: false, reason: '이동할 수 없는 노드입니다.' };
    }

    // Extra stamina for KO'd units (1 stamina per 2 KO units, minimum 1 if any KO)
    const koUnits = this.engine.getPartyUnits().filter(u => u.isKnockedOut).length;
    if (koUnits > 0) {
      const koCost = Math.max(1, Math.floor(koUnits / 2));
      if (!this.engine.useStamina(koCost)) {
        return { success: false, reason: `기절 유닛 때문에 추가 스태미나가 필요합니다. (필요: ${koCost})` };
      }
    }

    this.engine.state.dungeon.currentNode = targetNodeId;
    const node = this.getCurrentNode();

    const result = {
      success: true,
      node,
      floor: node.floor,
      zone: node.zone
    };

    // Process node type
    switch (node.type) {
      case 'combat':
        result.encounter = this.generateEncounter(node);
        break;
      case 'collect':
        result.collectibles = this.getCollectibles(node);
        break;
      case 'rest':
        result.isRest = true;
        break;
      case 'chest':
        result.chest = this.openChest(node);
        break;
      case 'event':
        result.event = this.triggerEvent(node);
        break;
      case 'boss':
        result.encounter = this.generateBossEncounter(node);
        result.isBoss = true;
        break;
      case 'exit':
        result.isExit = true;
        break;
    }

    return result;
  }

  // Generate encounter for combat node
  generateEncounter(node) {
    const floor = node.floor;
    const encounterList = node.encounter || [];

    // 20% chance of slime encounter
    if (Math.random() < 0.2) {
      return {
        type: 'slime',
        enemies: [this.combat.createSlime(floor)],
        canNegotiate: false
      };
    }

    // Pick random encounter from node's encounter list
    if (encounterList.length === 0) {
      return {
        type: 'slime',
        enemies: [this.combat.createSlime(floor)],
        canNegotiate: false
      };
    }

    const pick = encounterList[Math.floor(Math.random() * encounterList.length)];
    const unitDef = this.engine.getUnitDef(pick);

    if (!unitDef) {
      return {
        type: 'slime',
        enemies: [this.combat.createSlime(floor)],
        canNegotiate: false
      };
    }

    const enemy = this.combat.createEnemyFromDef(unitDef);

    return {
      type: 'unit',
      unitDef,
      enemies: [enemy],
      canNegotiate: true
    };
  }

  // Generate boss encounter
  generateBossEncounter(node) {
    const boss = this.combat.createBoss(node.floor);
    return {
      type: 'boss',
      enemies: [boss],
      canNegotiate: false,
      isBoss: true
    };
  }

  // Get collectible materials for a collect node (도구 보정 적용)
  getCollectibles(node) {
    const materials = node.collect || [];
    const results = [];
    const gatherBonus = this.engine.getGatherBonus(node.zone);

    for (const matId of materials) {
      if (Math.random() < 0.7) {
        const baseQty = 1 + Math.floor(Math.random() * 2);
        const qty = Math.max(1, Math.floor(baseQty * gatherBonus));
        results.push({ id: matId, qty, name: this.engine.getMaterialName(matId) });
      }
    }

    // Always get at least 1 item
    if (results.length === 0 && materials.length > 0) {
      const qty = Math.max(1, Math.floor(1 * gatherBonus));
      results.push({
        id: materials[0],
        qty,
        name: this.engine.getMaterialName(materials[0])
      });
    }

    return results;
  }

  // Collect materials at current node (costs 1 stamina)
  collectMaterials(collectibles) {
    if (!this.engine.useStamina(1)) {
      return { success: false, reason: '스태미나가 부족하여 채집할 수 없다.' };
    }
    for (const item of collectibles) {
      this.engine.addMaterial(item.id, item.qty);
      this.engine.state.dungeon.collectedThisRun.push(item);
    }
    return { success: true, items: collectibles };
  }

  // Open chest (repeatable — bonus loot based on floor)
  openChest(node) {
    const loot = [];
    const floor = node.floor;

    // Node has predefined collect data → use it
    if (node.collect && node.collect.length > 0) {
      for (const matId of node.collect) {
        const qty = 1 + Math.floor(Math.random() * 2);
        loot.push({ id: matId, qty, name: this.engine.getMaterialName(matId) });
      }
    } else {
      // Fallback: floor-based random loot
      const pool = ['MAT_HERB', 'MAT_IRON_ORE', 'MAT_MAGIC_STONE', 'MAT_WATER', 'MAT_CATALYST_HERB', 'MAT_SLIME_CORE', 'MAT_POISON_FISH'];
      const count = 2 + Math.floor(floor / 5);
      for (let i = 0; i < count; i++) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const qty = 1 + Math.floor(Math.random() * (1 + Math.floor(floor / 3)));
        loot.push({ id: pick, qty, name: this.engine.getMaterialName(pick) });
      }
    }

    // Bonus: deeper floors give more
    if (floor >= 10 && Math.random() < 0.3) {
      loot.push({ id: 'MAT_MAGIC_STONE', qty: 2, name: '마력석' });
    }

    for (const item of loot) {
      this.engine.addMaterial(item.id, item.qty);
      this.engine.state.dungeon.collectedThisRun.push(item);
    }

    return { empty: false, loot, message: '상자를 열었다!' };
  }

  // Rest at rest node (heal party)
  restAtNode() {
    const party = this.engine.getPartyUnits();
    const healed = [];

    for (const unit of party) {
      if (!unit.isKnockedOut && unit.hp < unit.maxHp) {
        const healAmt = Math.floor(unit.maxHp * 0.3);
        unit.hp = Math.min(unit.maxHp, unit.hp + healAmt);
        healed.push({ name: unit.name, healed: healAmt });
      }
    }

    // Heal player too
    const player = this.engine.state.player;
    if (player.hp < player.maxHp) {
      const healAmt = Math.floor(player.maxHp * 0.3);
      player.hp = Math.min(player.maxHp, player.hp + healAmt);
      healed.push({ name: player.name, healed: healAmt });
    }

    return healed;
  }

  // Event node
  triggerEvent(node) {
    // Event text based on floor/node
    if (node.id === 'F9-D') {
      return {
        text: '기관부의 벽에 고대 문자가 빼곡히 새겨져 있다.',
        lore: '(알파 버전 — 로어 이벤트 내용 준비 중)'
      };
    }
    if (node.id === 'F14-C') {
      return {
        text: '깊은 곳에서 거대한 진동이 느껴진다. 무언가... 기다리고 있다.',
        lore: '(알파 버전 — 보스 예고 이벤트 준비 중)'
      };
    }

    const events = [
      '벽면에 오래된 문양이 새겨져 있다. 전임자의 것인지도 모른다.',
      '어디선가 기계 소리가 들려온다. 대연성기의 잔향일까.',
      '바닥에 오래된 메모 조각이 떨어져 있다.',
      '공기가 묘하게 달콤하다. 마력의 농도가 짙어진 것일까.',
      '먼 곳에서 무언가 울리는 소리가 들린다.'
    ];

    return {
      text: events[Math.floor(Math.random() * events.length)],
      lore: node.floor >= 9 ? '기관부 깊숙한 곳에서 빛이 새어나온다...' : null
    };
  }

  // Retreat from dungeon
  retreat() {
    const state = this.engine.state;

    // Update max floor reached
    if (state.dungeon.currentFloor > state.dungeon.maxFloorReached) {
      state.dungeon.maxFloorReached = state.dungeon.currentFloor;
    }

    const collected = [...state.dungeon.collectedThisRun];

    state.dungeon.inDungeon = false;
    state.dungeon.currentFloor = null;
    state.dungeon.currentNode = null;
    state.dungeon.collectedThisRun = [];

    return {
      success: true,
      collected,
      message: '무사히 귀환했다.'
    };
  }

  // Total wipe - lose some materials
  handleWipe() {
    const state = this.engine.state;
    const expeditionLevel = state.facilities.expeditionHQ.level;

    // Recovery rate based on expedition facility level
    const recoveryRate = expeditionLevel * 0.25; // 0%, 25%, 50%, 75%
    const collected = state.dungeon.collectedThisRun;
    const recovered = [];
    const lost = [];

    for (const item of collected) {
      if (Math.random() < recoveryRate) {
        recovered.push(item);
      } else {
        // Remove from inventory
        this.engine.removeMaterial(item.id, item.qty);
        lost.push(item);
      }
    }

    // Player recovery time
    this.engine.state.player.hp = 1;

    state.dungeon.inDungeon = false;
    state.dungeon.currentFloor = null;
    state.dungeon.currentNode = null;
    state.dungeon.collectedThisRun = [];

    return {
      recovered,
      lost,
      recoveryRate,
      message: expeditionLevel > 0
        ? `탐사 경비대가 유실물 일부를 회수했다. (회수율: ${Math.floor(recoveryRate * 100)}%)`
        : '유실물을 전부 잃었다.'
    };
  }

  // Negotiate with unit (attempt recruitment)
  attemptNegotiation(unitDef, offerItemId) {
    let baseChance = 0.3;

    // Bonus for offering preferred items
    if (offerItemId) {
      baseChance += 0.2;
      this.engine.removeMaterial(offerItemId, 1);
    }

    // Active sigil bonus
    if (this.engine.state.activeSignals.includes(unitDef.sigil)) {
      baseChance += 0.1;
    }

    const success = Math.random() < baseChance;

    return {
      success,
      chance: Math.floor(baseChance * 100)
    };
  }

  // Recruit a unit after successful negotiation
  recruitUnit(unitDef) {
    const instance = this.engine.createUnitInstance(unitDef);
    this.engine.state.ownedUnits.push(instance);

    // Register in compendium
    if (!this.engine.state.compendium.registered.includes(unitDef.id)) {
      this.engine.state.compendium.registered.push(unitDef.id);
    }

    return instance;
  }

  // Handle negotiation failure
  handleNegotiationFailure(unitDef, attempt) {
    // First failure: player still has choices
    if (attempt === 1) {
      return { result: 'rejected', message: `${unitDef.name}이(가) 거절했다. 다시 시도할 수 있다.` };
    }

    // Second failure: personality-based reaction
    const personality = unitDef.personalityTraits || [];
    if (personality.includes('호전적') || personality.includes('공격적')) {
      return { result: 'fight', message: `${unitDef.name}이(가) 화를 내며 공격해온다!` };
    } else if (personality.includes('소심') || personality.includes('야성')) {
      return { result: 'flee', message: `${unitDef.name}이(가) 달아났다.` };
    } else {
      return { result: 'ignore', message: `${unitDef.name}이(가) 더 이상 대화할 의사가 없다.` };
    }
  }

  // Move to next floor
  moveToNextFloor() {
    const currentFloor = this.engine.state.dungeon.currentFloor;
    const nextFloor = currentFloor + 1;

    if (nextFloor > 15) {
      return { success: false, reason: '알파 버전의 최대 층수(15층)에 도달했습니다.' };
    }

    // Extra stamina cost per KO unit
    const koCount = this.engine.getPartyUnits().filter(u => u.isKnockedOut).length;
    const extraCost = koCount; // 1 stamina per KO unit per floor transition

    this.engine.state.dungeon.currentFloor = nextFloor;

    // Find entrance of next floor
    const nextEntrance = this.engine.data.dungeonMap.find(
      n => n.floor === nextFloor && n.type === 'entrance'
    );

    if (nextEntrance) {
      this.engine.state.dungeon.currentNode = nextEntrance.id;
    }

    // Update max floor
    if (nextFloor > this.engine.state.dungeon.maxFloorReached) {
      this.engine.state.dungeon.maxFloorReached = nextFloor;
    }

    return {
      success: true,
      floor: nextFloor,
      node: nextEntrance,
      extraCost,
      message: `${nextFloor}층으로 내려간다...`
    };
  }

  // Get floor description
  getFloorDescription(floor) {
    const zones = {
      '석굴': '붉은 빛이 바위 틈에서 새어나온다. 소성의 열기가 잔존한다.',
      '수계': '발밑에 물이 찰랑거린다. 용해의 기운이 물을 따라 흐른다.',
      '독림': '공기가 달콤하면서도 위험하다. 발효의 기운이 식물에 깃들어 있다.',
      '기관부': '고대 기계의 잔해가 벽에 박혀 있다. 대연성기의 핵심부.',
      '결빙': '한기가 뼈를 파고든다. 응고의 힘이 모든 것을 얼리려 한다.',
      '석굴 심부': '석굴이 더 깊어졌다. 결정이 벽면에서 자라나고 있다.',
      '수계 심부': '물이 깊어지고 빛이 줄어든다. 심연의 기운이 느껴진다.',
      '독림 심부': '독기가 짙어졌다. 숨쉬기가 힘들다.',
      '위험 구역': '대연성기의 폭주 에너지가 집중된 위험 지대.',
      '화산-수계 경계': '열과 물이 부딪히는 경계 지대. 증기가 자욱하다.',
      '석굴~기관부 경계': '석굴과 기관부가 만나는 지점. 자연과 기계가 뒤섞여 있다.'
    };

    const floorNodes = this.getFloorNodes(floor);
    const zone = floorNodes.find(n => n.zone)?.zone || '알 수 없는 구역';

    return zones[zone] || `미궁 ${floor}층. 미지의 영역.`;
  }
}

module.exports = DungeonSystem;
