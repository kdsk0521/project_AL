'use strict';

// Game Engine - Central state manager
class GameEngine {
  constructor() {
    this.state = null;

    // Balance CSV loader
    const BalanceLoader = require('./balance/loader');
    this.balance = new BalanceLoader();

    // Color constants
    this.colors = require('./data/colors.json');

    // Load data — CSV (balance/) preferred, JSON (data/) as fallback
    const rawDungeon = require('./data/dungeonMap.json');
    const rawRecipes = require('./data/recipes.json');
    const rawProcessing = require('./data/processing.json');

    // Traits: load from CSV → fallback to JSON
    const traits = this._loadTraitsFromCSV() || this._loadTraitsFromJSON();

    // Units: load from CSV → fallback to JSON
    const units = this._loadUnitsFromCSV() || this._loadUnitsFromJSON();

    // Trait synthesis: load from CSV → fallback to JSON
    const traitSynthesis = this._loadSynthesisFromCSV() || this._loadSynthesisFromJSON();

    // Flatten nested structures so all systems get plain arrays
    this.data = {
      materials: require('./data/materials.json'),   // already flat array
      units,
      dungeonMap: this._flattenDungeon(rawDungeon),  // flatten {floors:{...}}
      recipes: [                                     // merge basic + hidden
        ...(rawRecipes.basic || []),
        ...(rawRecipes.hidden || [])
      ],
      processing: this._flattenProcessing(rawProcessing),
      traits,
      traitSynthesis
    };

    // Event queue
    const EventQueue = require('./systems/eventQueue');
    this.eventQueue = new EventQueue(this);

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
      soulPower: 50, // 극소량 시작 (alpha_progression: 납품 전까지 경제 압박 없음)

      // 하루 행동 루트 (프린세스메이커식)
      // null=미선택, 'dungeon'=탐사중, 'training'=조교/교류중
      dayAction: null,

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

      // 부품 제작 레시피 (도구키_슬롯인덱스 → [재료A, 재료B])
      partRecipes: {
        'pickaxe_0': ['MAT_IRON_ORE','MAT_IRON_ORE'],
        'pickaxe_1': ['MAT_CATALYST_HERB','MAT_WATER'],
        'pickaxe_2': ['MAT_SLIME_CORE','MAT_WATER'],
        'rod_0': ['MAT_IRON_ORE','MAT_SLIME_CORE'],
        'rod_1': ['MAT_CATALYST_HERB','MAT_CATALYST_HERB'],
        'rod_2': ['MAT_IRON_ORE','MAT_WATER'],
        'staff_0': ['MAT_HERB','MAT_MAGIC_STONE'],
        'staff_1': ['MAT_IRON_ORE','MAT_CATALYST_HERB'],
        'staff_2': ['MAT_MAGIC_STONE','MAT_SLIME_CORE'],
        'dummy_0': ['MAT_SLIME_CORE','MAT_IRON_ORE'],
        'dummy_1': ['MAT_SLIME_CORE','MAT_CATALYST_HERB'],
        'dummy_2': ['MAT_IRON_ORE','MAT_WATER'],
        'treadmill_0': ['MAT_CATALYST_HERB','MAT_CATALYST_HERB'],
        'treadmill_1': ['MAT_IRON_ORE','MAT_IRON_ORE'],
        'treadmill_2': ['MAT_SLIME_CORE','MAT_WATER'],
        'rotor_0': ['MAT_MAGIC_STONE','MAT_SLIME_CORE'],
        'rotor_1': ['MAT_SLIME_CORE','MAT_WATER'],
        'rotor_2': ['MAT_IRON_ORE','MAT_CATALYST_HERB'],
        'textbook_0': ['MAT_IRON_ORE','MAT_CATALYST_HERB'],
        'textbook_1': ['MAT_CATALYST_HERB','MAT_WATER'],
        'textbook_2': ['MAT_MAGIC_STONE','MAT_IRON_ORE'],
      },

      // Workshop equipment
      equipment: {
        furnace: true,
        crusher: true,
        compressor: false
      },

      // 도구 7종 + 부품 3슬롯 (system_tool_upgrade.md v0.1)
      tools: {
        // 채집 도구 (3종)
        pickaxe: {
          name: '곡괭이', type: 'gather', gatherZone: '광맥',
          parts: [
            { slot: '머리', tags: [], tier: 0 },
            { slot: '자루', tags: [], tier: 0 },
            { slot: '손잡이', tags: [], tier: 0 }
          ]
        },
        rod: {
          name: '낚시대', type: 'gather', gatherZone: '수계',
          parts: [
            { slot: '바늘', tags: [], tier: 0 },
            { slot: '줄', tags: [], tier: 0 },
            { slot: '막대', tags: [], tier: 0 }
          ]
        },
        staff: {
          name: '채집봉', type: 'gather', gatherZone: '수풀',
          parts: [
            { slot: '끝장식', tags: [], tier: 0 },
            { slot: '봉체', tags: [], tier: 0 },
            { slot: '보석', tags: [], tier: 0 }
          ]
        },
        // 육성 도구 (2종)
        dummy: {
          name: '타격 인형', type: 'training_combat',
          parts: [
            { slot: '팔', tags: [], tier: 0 },
            { slot: '몸통', tags: [], tier: 0 },
            { slot: '받침대', tags: [], tier: 0 }
          ]
        },
        treadmill: {
          name: '달리기 기구', type: 'training_body',
          parts: [
            { slot: '벨트', tags: [], tier: 0 },
            { slot: '프레임', tags: [], tier: 0 },
            { slot: '바퀴', tags: [], tier: 0 }
          ]
        },
        // 조교 도구 (2종)
        rotor: {
          name: '로터', type: 'training_adult',
          parts: [
            { slot: '모터', tags: [], tier: 0 },
            { slot: '표면', tags: [], tier: 0 },
            { slot: '손잡이', tags: [], tier: 0 }
          ]
        },
        textbook: {
          name: '교본', type: 'training_personality',
          parts: [
            { slot: '표지', tags: [], tier: 0 },
            { slot: '내지', tags: [], tier: 0 },
            { slot: '잠금장치', tags: [], tier: 0 }
          ]
        }
      },
      // 부품 인벤토리 (탈착한 부품 보관)
      partInventory: [],

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
        firstBossDefeated: false,
        compressorBuilt: false,
        floor10Cleared: false,
        floor15Cleared: false
      },

      // 튜토리얼 진행 플래그 (alpha_progression.md)
      tutorial: {
        firstExploration: false,   // 1단계: 첫 탐사 완료
        firstCrafting: false,      // 2단계: 첫 조합 완료
        firstRecruitment: false,   // 3단계: 첫 유닛 영입
        firstPlacement: false,     // 4단계: 첫 도시 배치
        firstBoss: false,          // 5단계: 첫 보스 격파
        firstDelivery: false,      // 납품 경험
        maintenanceWarned: false,  // 유지비 경고 표시됨
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

  // === 도구 시스템 헬퍼 ===

  // 도구의 게이팅 값 (전 부품 tier 합계 ÷ 3, 버림)
  getToolGating(toolKey) {
    const tool = this.state.tools[toolKey];
    if (!tool) return 0;
    const totalTier = tool.parts.reduce((sum, p) => sum + (p.tier || 0), 0);
    return Math.floor(totalTier / 3);
  }

  // 채집 보너스 (구역 → 해당 도구 게이팅 기반)
  getGatherBonus(zone) {
    const zoneToolMap = {
      '석굴': 'pickaxe', '석굴 심부': 'pickaxe', '결빙': 'pickaxe',
      '독림': 'staff', '독림 심부': 'staff',
      '수계': 'rod', '수계 심부': 'rod',
      '기관부': 'pickaxe', '위험 구역': 'pickaxe',
      '화산-수계 경계': 'rod', '석굴~기관부 경계': 'pickaxe'
    };
    const toolKey = zoneToolMap[zone];
    if (!toolKey) return 1.0;
    const gating = this.getToolGating(toolKey);
    return 1.0 + gating * 0.3; // gating 0=×1.0, 1=×1.3, 2=×1.6, 3=×1.9...
  }

  // 육성 도구 효율 (훈련 시 경험치 보정)
  getTrainingBonus(type) {
    // type: 'combat'→타격인형, 'body'→달리기기구, 'adult'→로터, 'personality'→교본
    const toolMap = { combat: 'dummy', body: 'treadmill', adult: 'rotor', personality: 'textbook' };
    const toolKey = toolMap[type];
    if (!toolKey) return 1.0;
    const gating = this.getToolGating(toolKey);
    return 1.0 + gating * 0.2; // gating 0=×1.0, 1=×1.2, 2=×1.4...
  }

  // 조교 도구 여부 (로터 or 교본의 게이팅 > 0)
  hasTrainingToolForType(type) {
    const toolMap = { adult: 'rotor', personality: 'textbook' };
    const toolKey = toolMap[type];
    if (!toolKey) return false;
    return this.getToolGating(toolKey) >= 0; // t0이라도 있으면 true
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
    this.state.dayAction = null; // 하루 행동 루트 리셋

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

  // ===== CSV loaders (balance/ directory) =====

  _loadTraitsFromCSV() {
    try {
      const rows = this.balance.load('traits.csv');
      const result = [];
      for (const section of ['combat', 'personality', 'adult', 'body']) {
        const sectionData = rows[section];
        if (!sectionData || !Array.isArray(sectionData)) continue;
        for (const row of sectionData) {
          if (row._headers || row._kv) continue;
          const trait = { id: row.id, name: row.name, category: row.category, tier: row.tier };
          if (row.apCost != null && row.apCost !== '') trait.apCost = row.apCost;
          if (row.damageMultiplier != null && row.damageMultiplier !== '') trait.damageMultiplier = row.damageMultiplier;
          if (row.element) trait.element = row.element;
          if (row.target) trait.target = row.target;
          if (row.effect) trait.effect = row.effect;
          if (row.description) trait.description = row.description;
          if (row.owner) trait.owner = row.owner;
          // Landscape tags (body category)
          if (row.ls_smell || row.ls_sound || row.ls_visual || row.ls_temperature || row.ls_texture) {
            trait.landscapeTags = {};
            if (row.ls_smell) trait.landscapeTags.smell = row.ls_smell;
            if (row.ls_sound) trait.landscapeTags.sound = row.ls_sound;
            if (row.ls_visual) trait.landscapeTags.visual = row.ls_visual;
            if (row.ls_temperature) trait.landscapeTags.temperature = row.ls_temperature;
            if (row.ls_texture) trait.landscapeTags.texture = row.ls_texture;
          }
          result.push(trait);
        }
      }
      return result.length > 0 ? result : null;
    } catch (e) {
      return null;
    }
  }

  _loadTraitsFromJSON() {
    const raw = require('./data/traits.json');
    return [
      ...(raw.combat || []),
      ...(raw.personality || []),
      ...(raw.adult || []),
      ...(raw.body || [])
    ];
  }

  _loadUnitsFromCSV() {
    try {
      const rows = this.balance.load('units.csv');
      const unitRows = rows.units;
      if (!unitRows || !Array.isArray(unitRows)) return null;
      const result = [];
      for (const row of unitRows) {
        if (row._headers || row._kv) continue;
        const unit = {
          id: row.id, name: row.name, level: row.level,
          sigil: row.sigil, sigilName: row.sigilName,
          category: row.category,
          primaryElement: row.primaryElement || null,
          secondaryElement: row.secondaryElement || null,
          acquisition: row.acquisition || null,
          baseStats: { hp: row.hp, atk: row.atk, def: row.def, spd: row.spd },
          combatTraits: (row.combatTraits || '').split(';').filter(Boolean).map(id => ({ id })),
          personalityTraits: (row.personalityTraits || '').split(';').filter(Boolean).map(id => ({ id })),
          adultTrait: row.adultTrait ? { id: row.adultTrait } : null,
          habitat: row.habitat || '',
          appearance: row.appearance || ''
        };
        result.push(unit);
      }
      return result.length > 0 ? result : null;
    } catch (e) {
      return null;
    }
  }

  _loadUnitsFromJSON() {
    const raw = require('./data/units.json');
    return raw.units || raw;
  }

  _loadSynthesisFromCSV() {
    try {
      const rows = this.balance.load('traitSynthesis.csv');
      const result = [];
      for (const [section, sectionData] of Object.entries(rows)) {
        if (!Array.isArray(sectionData)) continue;
        for (const row of sectionData) {
          if (row._headers || row._kv) continue;
          result.push({
            id: row.id, name: row.name,
            requiredTraits: (row.requiredTraits || '').split(';').filter(Boolean),
            resultTrait: row.resultTrait,
            resultCategory: row.resultCategory || null,
            tier: row.tier,
            effect: row.effect || '',
            description: row.description || ''
          });
        }
      }
      return result.length > 0 ? result : null;
    } catch (e) {
      return null;
    }
  }

  _loadSynthesisFromJSON() {
    const raw = require('./data/traitSynthesis.json');
    return this._flattenSynthesis(raw);
  }
}

module.exports = GameEngine;
