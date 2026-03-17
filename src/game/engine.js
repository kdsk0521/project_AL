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
        equipment: { weapon: null, armor: null, accessory: null }
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
        firstBossDefeated: false,
        compressorBuilt: false,
        floor10Cleared: false,
        floor15Cleared: false
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

  getMaterialName(matId) {
    const mat = this.data.materials.find(m => m.id === matId);
    return mat ? mat.name : matId;
  }

  // Time management
  advanceDay() {
    this.state.day++;
    this.state.stamina = this.state.maxStamina; // reset stamina

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

  // Save / Load stubs
  saveGame() {
    try {
      const saveData = JSON.stringify(this.state);
      localStorage.setItem('project_al_save', saveData);
      return true;
    } catch(e) {
      return false;
    }
  }

  loadGame() {
    try {
      const saveData = localStorage.getItem('project_al_save');
      if (saveData) {
        this.state = JSON.parse(saveData);
        return true;
      }
      return false;
    } catch(e) {
      return false;
    }
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
