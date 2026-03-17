'use strict';

// Economy System - Soul power, city facilities, maintenance
class EconomySystem {
  constructor(engine) {
    this.engine = engine;
  }

  // Build or upgrade a facility
  buildFacility(facilityKey) {
    const state = this.engine.state;
    const facility = state.facilities[facilityKey];
    if (!facility) return { success: false, reason: '시설을 찾을 수 없습니다.' };

    const cost = this.getFacilityCost(facilityKey, facility.level + 1);

    if (state.soulPower < cost.soulPower) {
      return { success: false, reason: `영혼력이 부족합니다. (필요: ${cost.soulPower})` };
    }

    // Check material requirements
    for (const [matId, qty] of Object.entries(cost.materials || {})) {
      if (!this.engine.hasMaterial(matId, qty)) {
        return { success: false, reason: `${this.engine.getMaterialName(matId)}이(가) 부족합니다. (필요: ${qty})` };
      }
    }

    // Consume resources
    state.soulPower -= cost.soulPower;
    for (const [matId, qty] of Object.entries(cost.materials || {})) {
      this.engine.removeMaterial(matId, qty);
    }

    facility.level++;

    return {
      success: true,
      facilityKey,
      newLevel: facility.level,
      message: `${this.getFacilityName(facilityKey)} 레벨 ${facility.level}로 확장 완료!`
    };
  }

  getFacilityCost(facilityKey, targetLevel) {
    const baseCosts = {
      well: { soulPower: 50, materials: { 'MAT_IRON_ORE': 3, 'MAT_WATER': 5 } },
      slimeFarm: { soulPower: 80, materials: { 'MAT_SLIME_CORE': 5 } },
      fishery: { soulPower: 60, materials: { 'MAT_WATER': 5, 'MAT_IRON_ORE': 2 } },
      greenhouse: { soulPower: 70, materials: { 'MAT_HERB': 5, 'MAT_CATALYST_HERB': 3 } },
      expeditionHQ: { soulPower: 100, materials: { 'MAT_IRON_ORE': 5, 'MAT_SLIME_CORE': 3 } },
      workshop: { soulPower: 60, materials: { 'MAT_IRON_ORE': 3 } }
    };

    const base = baseCosts[facilityKey] || { soulPower: 100, materials: {} };
    const multiplier = targetLevel;

    return {
      soulPower: base.soulPower * multiplier,
      materials: Object.fromEntries(
        Object.entries(base.materials).map(([k, v]) => [k, v * multiplier])
      )
    };
  }

  getFacilityName(key) {
    const names = {
      well: '우물',
      slimeFarm: '슬라임 농장',
      fishery: '낚시터',
      greenhouse: '온실',
      expeditionHQ: '탐사 경비 시설',
      workshop: '가공소'
    };
    return names[key] || key;
  }

  getFacilityDescription(key, level) {
    if (level === 0) {
      const descs = {
        well: '물을 자동으로 수급할 수 있다.',
        slimeFarm: '슬라임핵을 자동으로 수급할 수 있다.',
        fishery: '독물고기를 자동으로 수급할 수 있다.',
        greenhouse: '촉매초를 자동으로 수급할 수 있다.',
        expeditionHQ: '전멸 시 유실물 회수 + 탐사 보급.',
        workshop: '가공 작업을 위임할 수 있다.'
      };
      return descs[key] || '';
    }
    const production = this.getProductionPerMonth(key, level);
    return `Lv.${level} — 월 생산: ${production}`;
  }

  getProductionPerMonth(key, level) {
    const prod = {
      well: `물 ×${3 * level}`,
      slimeFarm: `슬라임핵 ×${2 * level}`,
      fishery: `독물고기 ×${2 * level}`,
      greenhouse: `촉매초 ×${2 * level}`,
      expeditionHQ: `회수율 ${25 * level}%`,
      workshop: `자동가공 ${level}회/월`
    };
    return prod[key] || '—';
  }

  // Assign unit to facility
  assignUnit(instanceId, facilityKey) {
    const unit = this.engine.getUnitInstance(instanceId);
    if (!unit) return { success: false, reason: '유닛을 찾을 수 없습니다.' };

    const facility = this.engine.state.facilities[facilityKey];
    if (!facility) return { success: false, reason: '시설을 찾을 수 없습니다.' };
    if (facility.level === 0) return { success: false, reason: '시설이 건설되지 않았습니다.' };

    // Remove from party if in party
    this.engine.state.party = this.engine.state.party.filter(id => id !== instanceId);

    // Unassign from current facility
    if (unit.assignedFacility) {
      const oldFac = this.engine.state.facilities[unit.assignedFacility];
      if (oldFac) oldFac.unitId = null;
    }

    // Assign
    facility.unitId = instanceId;
    unit.assignedFacility = facilityKey;

    return {
      success: true,
      message: `${unit.name}을(를) ${this.getFacilityName(facilityKey)}에 배치했다.`
    };
  }

  // Remove unit from facility
  unassignUnit(facilityKey) {
    const facility = this.engine.state.facilities[facilityKey];
    if (!facility || !facility.unitId) return { success: false, reason: '배치된 유닛이 없습니다.' };

    const unit = this.engine.getUnitInstance(facility.unitId);
    if (unit) {
      unit.assignedFacility = null;
    }
    facility.unitId = null;

    return {
      success: true,
      message: `${this.getFacilityName(facilityKey)}에서 유닛을 해제했다.`
    };
  }

  // Get monthly report
  getMonthlyReport() {
    const state = this.engine.state;
    const report = {
      income: 0,
      expenses: 0,
      facilityProduction: [],
      balance: state.soulPower
    };

    // Expenses
    if (state.milestones.compressorBuilt) {
      report.expenses = this.engine.calcMaintenanceCost();
    }

    // Facility production summary
    for (const [key, fac] of Object.entries(state.facilities)) {
      if (fac.level > 0) {
        report.facilityProduction.push({
          name: this.getFacilityName(key),
          level: fac.level,
          production: this.getProductionPerMonth(key, fac.level),
          unitAssigned: fac.unitId ? this.engine.getUnitInstance(fac.unitId)?.name : '없음'
        });
      }
    }

    return report;
  }

  // Get all facilities info for display
  getAllFacilities() {
    const result = [];
    for (const [key, fac] of Object.entries(this.engine.state.facilities)) {
      const assignedUnit = fac.unitId ? this.engine.getUnitInstance(fac.unitId) : null;
      result.push({
        key,
        name: this.getFacilityName(key),
        level: fac.level,
        description: this.getFacilityDescription(key, fac.level),
        assignedUnit: assignedUnit ? assignedUnit.name : null,
        upgradeCost: fac.level < 3 ? this.getFacilityCost(key, fac.level + 1) : null
      });
    }
    return result;
  }

  // Build compressor (special milestone)
  buildCompressor() {
    const state = this.engine.state;

    if (state.equipment.compressor) {
      return { success: false, reason: '이미 압축기가 있습니다.' };
    }

    // Requires: 스프링 ×1 + 마법강철 ×1
    if (!this.engine.hasMaterial('MAT_SPRING', 1)) {
      return { success: false, reason: '스프링이 부족합니다.' };
    }

    // Check for 마법강철 (crafted material)
    const magicSteel = Object.keys(state.inventory).find(id => {
      const mat = this.engine.data.materials.find(m => m.id === id);
      return mat && mat.name === '마법강철';
    });

    if (!magicSteel || !this.engine.hasMaterial(magicSteel, 1)) {
      return { success: false, reason: '마법강철이 부족합니다.' };
    }

    this.engine.removeMaterial('MAT_SPRING', 1);
    this.engine.removeMaterial(magicSteel, 1);

    state.equipment.compressor = true;
    state.milestones.compressorBuilt = true;

    return {
      success: true,
      message: '압축기를 제작했다! 새로운 가공 경로가 개방되었다. (주의: 이제부터 월간 유지비가 발생합니다)'
    };
  }

  // Check bankruptcy
  checkBankruptcy() {
    if (this.engine.state.soulPower < 0) {
      return {
        bankrupt: true,
        message: '영혼력이 바닥났다... 공방을 유지할 수 없다.'
      };
    }
    return { bankrupt: false };
  }
}

module.exports = EconomySystem;
