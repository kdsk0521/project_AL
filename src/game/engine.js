'use strict';

// Game Engine - Central state manager
class GameEngine {
  constructor() {
    this.state = null;
    // Load and normalize data from JSON files
    const rawUnits = require('./data/units.json');
    const rawDungeon = require('./data/dungeonMap.json');
    const rawRecipes = require('./data/recipes.json');
    const rawTraits = require('./data/traits.json');
    const rawProcessing = require('./data/processing.json');
    const rawSynthesis = require('./data/traitSynthesis.json');

    // Flatten nested structures so all systems get plain arrays
    this.data = {
      materials: require('./data/materials.json'),   // already flat array
      units: rawUnits.units || rawUnits,             // unwrap {units:[...]}
      dungeonMap: this._flattenDungeon(rawDungeon),  // flatten {floors:{...}}
      recipes: [                                     // merge basic + hidden
        ...(rawRecipes.basic || []),
        ...(rawRecipes.hidden || [])
      ],
      processing: this._flattenProcessing(rawProcessing),
      traits: [                                      // merge combat + personality
        ...(rawTraits.combat || []),
        ...(rawTraits.personality || [])
      ],
      traitSynthesis: this._flattenSynthesis(rawSynthesis)
    };

    // Fusion table: 7x7 alpha (sigil A + sigil B -> result sigil)
    // Rule: (A + B) mod 7, if 0 then 7, if result == A or B then +1
    this.fusionTable = this.buildFusionTable();
  }

  newGame() {
    this.state = {
      // Time
      month: 1,
      day: 1,
      year: 1,

      // Resources
      stamina: 30,
      maxStamina: 30,
      soulPower: 500, // starting amount

      // Player
      player: {
        name: '\uC5F0\uAE08\uC220\uC0AC',
        level: 1,
        hp: 100,
        maxHp: 100,
        atk: 12,
        def: 10,
        spd: 10,
        traits: [],
        equipment: { weapon: null, armor: null, accessory: null },
        recoveryDays: 0  // 0 = 탐사 가능, >0 = 부상으로 탐사 불가
      },

      // Units owned by player
      ownedUnits: [],

      // Party (player + up to 3 units)
      party: [], // array of unit instance IDs
      maxPartySize: 2, // starts at 2 (player + 1), expands to 4

      // Inventory
      inventory: {}, // {materialId: quantity}
      craftedItems: [], // array of crafted item objects

      // City facilities
      facilities: {
        well: { level: 0, unitId: null },      // \uC6B0\uBB3C
        slimeFarm: { level: 0, unitId: null },  // \uC2AC\uB77C\uC784 \uB18D\uC7A5
        fishery: { level: 0, unitId: null },    // \uB0DA\uC2DC\uD130
        greenhouse: { level: 0, unitId: null }, // \uC628\uC2E4
        expeditionHQ: { level: 0, unitId: null }, // \uD0D0\uC0AC \uACBD\uBE44
        workshop: { level: 1, unitId: null }    // \uAC00\uACF5\uC18C (starts at 1)
      },

      // Workshop equipment
      equipment: {
        furnace: true,   // \uAC00\uB9C8 - available from start
        crusher: true,   // \uBD84\uC1C4\uAE30 - available from start
        compressor: false // \uC555\uCD95\uAE30 - needs to be crafted
      },

      // Dungeon progress
      dungeon: {
        maxFloorReached: 0,
        currentFloor: null,
        currentNode: null,
        inDungeon: false,
        collectedThisRun: [], // materials collected
        bossesDefeated: [],   // boss IDs defeated
        visitedChests: []     // one-time chest IDs
      },

      // Compendium
      compendium: {
        registered: [], // unit IDs that have been registered
        basicPool: [    // available from start (기초풀 units)
          'UNIT_THORN_IMP', 'UNIT_SALT_SLIME', 'UNIT_MUD_DOLL',
          'UNIT_CRYSTAL_SPIDER', 'UNIT_BUBBLE_SLIME', 'UNIT_YARD_SPIDER',
          'UNIT_HERB_FAIRY', 'UNIT_DISTILLER_DOLL', 'UNIT_SCORPION_GIRL',
          'UNIT_EROSION_SPIDER', 'UNIT_MIST_JELLYFISH', 'UNIT_SYMBIOTE_GIRL',
          'UNIT_SLAG_GOLEM', 'UNIT_STONE_MAIDEN'
        ]
      },

      // Calendar events
      activeSignals: [1, 5], // month 1: active sigils

      // Maintenance cost tracking
      maintenanceCost: 0, // 0 until compressor built

      // Milestone flags
      milestones: {
        firstBossDefeated: false,  // 5층 보스 → 파티 +1 (3인)
        compressorBuilt: false,
        floor10Cleared: false,     // 10층 보스 → 파티 +1 (4인)
        floor15Cleared: false      // 15층 보스 → 파티 +1 (5인)
      },

      // Unit instance counter
      nextUnitInstanceId: 1
    };

    // Give starter unit
    this.giveStarterUnit();

    // Give starting materials
    this.addMaterial('MAT_HERB', 5);
    this.addMaterial('MAT_WATER', 5);
    this.addMaterial('MAT_SLIME_CORE', 3);
    this.addMaterial('MAT_IRON_ORE', 2);
    this.addMaterial('MAT_CATALYST_HERB', 2);
  }

  giveStarterUnit() {
    // Give UNIT_FOAM_SLIME (Lv.3)
    const unitDef = this.data.units.find(u => u.id === 'UNIT_BUBBLE_SLIME');
    if (unitDef) {
      const instance = this.createUnitInstance(unitDef);
      instance.affection = 15; // starts at recognition level
      this.state.ownedUnits.push(instance);
      this.state.party.push(instance.instanceId);
    }
  }

  createUnitInstance(unitDef) {
    const instanceId = this.state.nextUnitInstanceId++;
    return {
      instanceId,
      unitId: unitDef.id,
      name: unitDef.name,
      level: unitDef.level,
      sigil: unitDef.sigil,
      sigilName: unitDef.sigilName,
      category: unitDef.category,
      primaryElement: unitDef.primaryElement,
      secondaryElement: unitDef.secondaryElement,

      // Combat stats (base from category + level scaling)
      hp: unitDef.baseStats.hp,
      maxHp: unitDef.baseStats.hp,
      atk: unitDef.baseStats.atk,
      def: unitDef.baseStats.def,
      spd: unitDef.baseStats.spd,

      // Defense profile (6 slots)
      defenseProfile: this.calcDefenseProfile(unitDef),

      // Traits - normalize to ID strings
      traits: [
        ...(unitDef.combatTraits || []).map(t => typeof t === 'object' ? t.id : t),
        ...(unitDef.personalityTraits || []).map(t => typeof t === 'object' ? t.id : t)
      ].filter(Boolean),
      // Keep original trait objects for display purposes
      traitDetails: [...(unitDef.combatTraits || []), ...(unitDef.personalityTraits || [])],

      // Relationship
      affection: this.getBaseAffection(unitDef.category),
      love: 0,

      // Experience pools
      exp: { combat: 0, body: 0, personality: 0, adult: 0 },

      // Adult stats (sensitivity 6 parts + 5 global)
      sensitivity: { mouth: 0, chest: 0, v: 0, c: 0, anal: 0, skin: 0 },
      globalState: { love: 0, submission: 0, lewdness: 0, fear: 0, resentment: 0 },

      // Potential (from fusion inheritance)
      potential: {},

      // 세분화 경험치 (ERA식)
      detailedExp: {
        kiss: 0,         // 키스경험 (입 행위)
        caress: 0,       // 애무경험 (애무/간지럼 행위)
        stimulate: 0,    // 자극경험 (자극/압박 행위)
        lick: 0,         // 핥기경험
        insert: 0,       // 삽입경험 (V/A 삽입)
        toy: 0,          // 도구경험
        orgasm: 0,       // 절정횟수
        service: 0,      // 봉사경험 (복종 높을 때 조교)
        discipline: 0,   // 조련경험
        exposure: 0,     // 노출경험 (음란 높을 때)
        totalSessions: 0 // 총 조교 횟수
      },

      // Equipment
      equipment: { weapon: null, armor: null, accessory: null },

      // Status
      isKnockedOut: false,
      recoveryDays: 0,
      assignedFacility: null
    };
  }

  calcDefenseProfile(unitDef) {
    // Primary element: high resist, secondary: medium, rest: low
    const elements = ['\uC5F4', '\uC704', '\uB3D9', '\uAD11', '\uC2DD'];
    const profile = { physical: 5, '\uC5F4': 5, '\uC704': 5, '\uB3D9': 5, '\uAD11': 5, '\uC2DD': 5 };
    const base = unitDef.level;

    profile.physical = base + 3;
    for (const el of elements) {
      if (el === unitDef.primaryElement) {
        profile[el] = base + 15;
      } else if (el === unitDef.secondaryElement) {
        profile[el] = base + 8;
      } else {
        profile[el] = base + 3;
      }
    }
    return profile;
  }

  getBaseAffection(category) {
    const base = { '\uC694\uAD34': 10, '\uC815\uB839': 20, '\uC778\uC870': 25, '\uC57C\uC218': 5, '\uD658\uC0C1': 0 };
    return base[category] || 10;
  }

  // Material management
  addMaterial(matId, qty) {
    if (!this.state.inventory[matId]) this.state.inventory[matId] = 0;
    this.state.inventory[matId] += qty;
  }

  removeMaterial(matId, qty) {
    if (!this.state.inventory[matId] || this.state.inventory[matId] < qty) return false;
    this.state.inventory[matId] -= qty;
    if (this.state.inventory[matId] <= 0) delete this.state.inventory[matId];
    return true;
  }

  hasMaterial(matId, qty = 1) {
    return (this.state.inventory[matId] || 0) >= qty;
  }

  // Heal player with item or amount
  healPlayer(amount) {
    const p = this.state.player;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    return { healed: p.hp - before, hp: p.hp, maxHp: p.maxHp };
  }

  // Check if player can explore
  canExplore() {
    if (this.state.player.hp <= 0) return { ok: false, reason: '체력이 없어 탐사할 수 없습니다.' };
    if (this.state.player.recoveryDays > 0) return { ok: false, reason: `부상 회복 중입니다. (${this.state.player.recoveryDays}일 남음)` };
    return { ok: true };
  }

  getMaterialName(matId) {
    const mat = this.data.materials.find(m => m.id === matId);
    return mat ? mat.name : matId;
  }

  // Time management
  advanceDay() {
    this.state.day++;
    this.state.stamina = this.state.maxStamina; // reset stamina

    // Player natural HP recovery (30% per day)
    const player = this.state.player;
    if (player.hp < player.maxHp) {
      const heal = Math.floor(player.maxHp * 0.3);
      player.hp = Math.min(player.maxHp, player.hp + heal);
    }
    // Player injury recovery
    if (player.recoveryDays > 0) {
      player.recoveryDays--;
    }

    // Recover knocked out units
    for (const unit of this.state.ownedUnits) {
      if (unit.recoveryDays > 0) {
        unit.recoveryDays--;
        if (unit.recoveryDays <= 0) {
          unit.isKnockedOut = false;
        }
      }
    }

    // Check month end
    if (this.state.day > 30) {
      this.advanceMonth();
    }

    return this.getDayReport();
  }

  advanceMonth() {
    this.state.day = 1;
    this.state.month++;

    if (this.state.month > 12) {
      this.state.month = 1;
      this.state.year++;
    }

    // Monthly maintenance cost
    if (this.state.milestones.compressorBuilt) {
      this.state.maintenanceCost = this.calcMaintenanceCost();
      this.state.soulPower -= this.state.maintenanceCost;
    }

    // Facility production
    this.processFacilityProduction();

    // Update active sigils for the month
    this.updateActiveSignals();

    return this.getMonthReport();
  }

  calcMaintenanceCost() {
    let cost = 20; // base
    if (this.state.equipment.compressor) cost += 15;
    // Add facility costs
    for (const [key, fac] of Object.entries(this.state.facilities)) {
      cost += fac.level * 5;
    }
    return cost;
  }

  processFacilityProduction() {
    const fac = this.state.facilities;
    if (fac.well.level > 0) this.addMaterial('MAT_WATER', 3 * fac.well.level);
    if (fac.slimeFarm.level > 0) this.addMaterial('MAT_SLIME_CORE', 2 * fac.slimeFarm.level);
    if (fac.fishery.level > 0) this.addMaterial('MAT_POISON_FISH', 2 * fac.fishery.level);
    if (fac.greenhouse.level > 0) this.addMaterial('MAT_CATALYST_HERB', 2 * fac.greenhouse.level);

    // 가공소: 자동 가공 (레벨 × 횟수만큼 인벤토리 재료를 가공)
    if (fac.workshop.level > 0 && fac.workshop.unitId) {
      this.state._workshopResults = this.processWorkshopAuto(fac.workshop.level);
    }
  }

  // 가공소 자동 가공: 인벤토리에서 원재료를 가마로 가공
  processWorkshopAuto(level) {
    const results = [];
    const maxProcesses = level * 2; // Lv1=2회, Lv2=4회, Lv3=6회
    const processable = ['MAT_HERB', 'MAT_CATALYST_HERB', 'MAT_IRON_ORE', 'MAT_MAGIC_STONE', 'MAT_POISON_FISH', 'MAT_SLIME_CORE'];

    // Lv1: 가마만, Lv2: 가마+분쇄, Lv3: 가마+분쇄+압축
    const availEquip = ['furnace'];
    if (level >= 2) availEquip.push('crusher');
    if (level >= 3 && this.state.equipment.compressor) availEquip.push('compressor');

    let processed = 0;
    for (const matId of processable) {
      if (processed >= maxProcesses) break;
      const qty = this.state.inventory[matId] || 0;
      if (qty <= 1) continue; // 최소 1개는 남김

      // 가공할 장비 선택 (순서대로)
      const equipId = availEquip[processed % availEquip.length];
      const suffixMap = { furnace: '_FIRED', crusher: '_CRUSHED', compressor: '_COMPRESSED' };
      const resultId = `${matId}${suffixMap[equipId]}`;
      const resultMat = this.data.materials.find(m => m.id === resultId);

      if (resultMat) {
        this.removeMaterial(matId, 1);
        this.addMaterial(resultId, 1);
        results.push({ from: this.getMaterialName(matId), to: resultMat.name, equipment: equipId });
        processed++;
      }
    }
    return results;
  }

  updateActiveSignals() {
    // Rotate active sigils (2-3 per month)
    const sigils = [1, 2, 3, 4, 5, 6, 7];
    const monthIndex = (this.state.month - 1) % 7;
    this.state.activeSignals = [
      sigils[monthIndex],
      sigils[(monthIndex + 3) % 7]
    ];
  }

  getDayReport() {
    return { day: this.state.day, month: this.state.month };
  }

  getMonthReport() {
    return {
      month: this.state.month,
      year: this.state.year,
      maintenanceCost: this.state.maintenanceCost,
      facilityProduction: true,
      activeSignals: this.state.activeSignals
    };
  }

  // Stamina
  useStamina(amount) {
    if (this.state.stamina < amount) return false;
    this.state.stamina -= amount;
    return true;
  }

  // Fusion table builder
  buildFusionTable() {
    const table = {};
    for (let a = 1; a <= 7; a++) {
      for (let b = a; b <= 7; b++) {
        let result = (a + b) % 7;
        if (result === 0) result = 7;
        // If result equals either input, shift +1
        while (result === a || result === b) {
          result = (result % 7) + 1;
        }
        table[`${a}_${b}`] = result;
        table[`${b}_${a}`] = result;
      }
    }
    return table;
  }

  getFusionResult(sigilA, sigilB) {
    return this.fusionTable[`${sigilA}_${sigilB}`];
  }

  // Unit lookup helpers
  getUnitInstance(instanceId) {
    return this.state.ownedUnits.find(u => u.instanceId === instanceId);
  }

  getUnitDef(unitId) {
    return this.data.units.find(u => u.id === unitId);
  }

  getPartyUnits() {
    return this.state.party.map(id => this.getUnitInstance(id)).filter(Boolean);
  }

  // Check and apply milestone rewards (call after boss defeat, crafting, etc.)
  checkMilestones() {
    const s = this.state;
    const rewards = [];

    if (s.milestones.firstBossDefeated && s.maxPartySize < 3) {
      s.maxPartySize = 3;
      rewards.push('파티 슬롯 확장! (최대 3인)');
    }
    if (s.milestones.floor10Cleared && s.maxPartySize < 4) {
      s.maxPartySize = 4;
      rewards.push('파티 슬롯 확장! (최대 4인)');
    }
    if (s.milestones.floor15Cleared && s.maxPartySize < 5) {
      s.maxPartySize = 5;
      rewards.push('파티 슬롯 확장! (최대 5인)');
    }
    return rewards;
  }

  // Soul power
  calcSoulPowerValue(unitInstance) {
    let value = unitInstance.level * 10; // base
    value += (unitInstance.traits.length || 0) * 5; // trait bonus

    // Sigil bonus (special sigils)
    if (unitInstance.sigil === 7) value = Math.floor(value * 1.15);

    // Active sigil bonus
    if (this.state.activeSignals.includes(unitInstance.sigil)) {
      value = Math.floor(value * 1.2);
    }

    return value;
  }

  // Save / Load — 3 slots + auto save
  saveGame(slot = 0) {
    try {
      const saveData = JSON.stringify(this.state);
      const meta = {
        slot,
        date: `${this.state.year}년 ${this.state.month}월 ${this.state.day}일`,
        soulPower: this.state.soulPower,
        units: this.state.ownedUnits.length,
        floor: this.state.dungeon.maxFloorReached,
        realTime: new Date().toLocaleString('ko-KR'),
        playerHp: `${this.state.player.hp}/${this.state.player.maxHp}`
      };
      localStorage.setItem(`project_al_save_${slot}`, saveData);
      localStorage.setItem(`project_al_meta_${slot}`, JSON.stringify(meta));
      return true;
    } catch(e) {
      return false;
    }
  }

  loadGame(slot = 0) {
    try {
      const saveData = localStorage.getItem(`project_al_save_${slot}`);
      if (saveData) {
        this.state = JSON.parse(saveData);
        return true;
      }
      return false;
    } catch(e) {
      return false;
    }
  }

  // Auto save (slot 0)
  autoSave() {
    return this.saveGame(0);
  }

  // Get save slot info for display
  getSaveSlots() {
    const slots = [];
    for (let i = 0; i <= 2; i++) {
      try {
        const meta = localStorage.getItem(`project_al_meta_${i}`);
        if (meta) {
          slots.push({ slot: i, ...JSON.parse(meta) });
        } else {
          slots.push({ slot: i, empty: true });
        }
      } catch(e) {
        slots.push({ slot: i, empty: true });
      }
    }
    return slots;
  }

  deleteSave(slot) {
    localStorage.removeItem(`project_al_save_${slot}`);
    localStorage.removeItem(`project_al_meta_${slot}`);
  }

  // ===== Data normalization helpers =====

  _flattenDungeon(raw) {
    // Convert {floors: {"1": {nodes:[...]}, ...}} to flat node array
    if (Array.isArray(raw)) return raw;
    const nodes = [];
    const floors = raw.floors || raw;
    for (const [floorKey, floorData] of Object.entries(floors)) {
      const floorNodes = floorData.nodes || floorData;
      if (Array.isArray(floorNodes)) {
        for (const node of floorNodes) {
          nodes.push(node);
        }
      }
    }
    return nodes;
  }

  _flattenProcessing(raw) {
    // Convert processing data to flat lookup: { "MAT_ID_equipmentId": result }
    if (!raw) return {};
    const flat = {};

    // Map equipment IDs to our internal names
    const equipIdMap = { 'EQUIP_KILN': 'furnace', 'EQUIP_CRUSHER': 'crusher', 'EQUIP_COMPRESSOR': 'compressor' };

    // Handle rules array: [{materialId, equipment, resultId, ...}]
    if (Array.isArray(raw.rules)) {
      for (const rule of raw.rules) {
        const equipKey = equipIdMap[rule.equipment] || rule.equipment;
        const matId = rule.materialId;
        if (matId && equipKey) {
          flat[`${matId}_${equipKey}`] = {
            resultId: rule.resultId,
            resultName: rule.resultName,
            resultTags: rule.resultTags || {},
            description: rule.description || ''
          };
        }
      }
    }
    return flat;
  }

  _flattenSynthesis(raw) {
    // Convert categorized synthesis to flat array
    if (Array.isArray(raw)) return raw;
    const flat = [];
    for (const [category, recipes] of Object.entries(raw)) {
      if (Array.isArray(recipes)) {
        flat.push(...recipes);
      }
    }
    return flat;
  }
}

module.exports = GameEngine;
