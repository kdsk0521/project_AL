'use strict';

// Economy System - Soul power, city facilities, maintenance
class EconomySystem {
  constructor(engine) {
    this.engine = engine;
  }

  // Build or upgrade a facility (max level 3)
  buildFacility(facilityKey) {
    const MAX_FACILITY_LEVEL = 5; // v1.2: 1=건설 + 2~5=흑백황적 강화
    const state = this.engine.state;
    const facility = state.facilities[facilityKey];
    if (!facility) return { success: false, reason: '시설을 찾을 수 없습니다.' };
    if (facility.level >= MAX_FACILITY_LEVEL) return { success: false, reason: `이미 최대 레벨(${MAX_FACILITY_LEVEL})입니다.` };

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

    // v4.8: 강화 게이트 — 색 일치 엘릭서 1개 (밀도 = 효과량 계수로 기록)
    let elixirUse = null;
    if (cost.elixir) {
      elixirUse = this._findOwnedElixir(cost.elixir.color);
      if (!elixirUse) {
        return { success: false, reason: `${cost.elixir.color}화 엘릭서가 필요합니다.` };
      }
    }

    // Consume resources
    state.soulPower -= cost.soulPower;
    for (const [matId, qty] of Object.entries(cost.materials || {})) {
      this.engine.removeMaterial(matId, qty);
    }
    if (elixirUse) {
      this.engine.removeMaterial(elixirUse.id, 1);
      facility.enhDensity = facility.enhDensity || {};
      facility.enhDensity[facility.level + 1] = elixirUse.density || 1;
    }

    facility.level++;

    return {
      success: true,
      facilityKey,
      newLevel: facility.level,
      message: `${this.getFacilityName(facilityKey)} 레벨 ${facility.level}로 확장 완료!`
    };
  }

  // 보유 인벤토리에서 색 일치 엘릭서 탐색 — 밀도 높은 것 우선 (잠정. 선택 UI는 화면 패스)
  _findOwnedElixir(color) {
    const inv = this.engine.state.inventory || {};
    let best = null;
    for (const matId of Object.keys(inv)) {
      if (inv[matId] <= 0) continue;
      const m = this.engine.data.materials.find(x => x.id === matId);
      if (m && m.elixir && m.color === color) {
        if (!best || (m.density || 1) > (best.density || 1)) best = m;
      }
    }
    return best;
  }

  // 강화 밀도 → 효과량 계수 (수치 잠정 — balance/economy.csv [elixir_constants].densityEffBonus)
  getFacilityEfficiency(facilityKey) {
    const f = this.engine.state.facilities[facilityKey];
    if (!f || !f.enhDensity) return 1;
    const ds = Object.values(f.enhDensity);
    if (!ds.length) return 1;
    let c = 0.25;
    try {
      const kv = this.engine.balance.getKV('economy.csv', 'elixir_constants');
      if (kv && kv.densityEffBonus != null) c = Number(kv.densityEffBonus);
    } catch (e) { /* fallback */ }
    const avg = ds.reduce((sum, v) => sum + v, 0) / ds.length;
    return 1 + c * Math.max(0, avg - 1);
  }

  getFacilityCost(facilityKey, targetLevel) {
    // economy_soul_curve v1.1 건설비 (16종 중 엔진 구현 6종)
    const baseCosts = {
      well: { soulPower: 400, materials: { 'MAT_IRON_ORE': 3, 'MAT_WATER': 5 } },
      workshop: { soulPower: 600, materials: { 'MAT_IRON_ORE': 3 } },
      expeditionHQ: { soulPower: 1800, materials: { 'MAT_IRON_ORE': 5, 'MAT_SLIME_CORE': 3 } },
      greenhouse: { soulPower: 2000, materials: { 'MAT_HERB': 5, 'MAT_CATALYST_HERB': 3 } },
      fishery: { soulPower: 2200, materials: { 'MAT_WATER': 5, 'MAT_IRON_ORE': 2 } },
      slimeFarm: { soulPower: 2400, materials: { 'MAT_SLIME_CORE': 5 } },
      // v1.2 확장 10종 (재료 요구는 추후)
      kitchen: { soulPower: 1000, materials: {} },
      storage: { soulPower: 1200, materials: {} },
      compendiumOffice: { soulPower: 1500, materials: {} },
      trainingGround: { soulPower: 2600, materials: {} },
      dormitory: { soulPower: 1500, materials: {} }, // 해금=호감도 자동(소)만 — 본체는 강화(관계 이벤트)
      plaza: { soulPower: 3000, materials: {} },
      trainingWorkshop: { soulPower: 2000, materials: {} }, // 해금=자성환+기초 도구 — 본체는 강화(직설 용품·최대 보너스)
      butterflyFarm: { soulPower: 5000, materials: {} },
      observatory: { soulPower: 2000, materials: {} }, // 해금=안내판(달력·인 표시)이라 저렴 — 본체는 강화(K·L)
      laboratory: { soulPower: 8000, materials: {} }
    };

    const base = baseCosts[facilityKey] || { soulPower: 1000, materials: {} };
    // Lv1 = 건설(전액) / Lv2~5 = 흑백황적 강화 — 영혼력 시공비 = 강화 기준액 × 색%(5/10/15/25)
    // 강화 기준액 = 기본은 건설비. 해금 무게 ≠ 기능 무게인 시설만 오버라이드 (v1.4)
    const ENH_BASE_OVERRIDE = {
      observatory: 8000, // 해금=달력·안내뿐이지만 강화 = 인 보너스·K 매개·L 매개(각성) = 엔드게임 본체
      dormitory: 4500,   // 강화 = 관계 이벤트 풀·연모 심화 = 본체
      trainingWorkshop: 5000 // 강화 = 직설 용품·상위 조교 아이템·최대 보너스 = 본체
    };
    // v4.8: 강화 주 게이트 = 엘릭서 색 (Lv2~5 = 흑백황적 1개) + 영혼력 시공비 병행 (soul_curve 보강 확정)
    const ENH_PCT = { 2: 0.05, 3: 0.10, 4: 0.15, 5: 0.25 };
    const ELIXIR_COLOR = { 2: '흑', 3: '백', 4: '황', 5: '적' };
    const enhBase = ENH_BASE_OVERRIDE[facilityKey] || base.soulPower;
    const sp = targetLevel <= 1 ? base.soulPower : Math.floor(enhBase * (ENH_PCT[Math.min(5, targetLevel)] || 0.25));
    const matMult = targetLevel <= 1 ? 1 : 0; // 강화 재료 요구 = 엘릭서로 대체 (v4.8)

    return {
      soulPower: sp,
      elixir: targetLevel >= 2 ? { color: ELIXIR_COLOR[Math.min(5, targetLevel)], count: 1 } : null,
      materials: Object.fromEntries(
        Object.entries(base.materials).map(([k, v]) => [k, v * matMult]).filter(([, v]) => v > 0)
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
      workshop: '가공소',
      kitchen: '주방',
      storage: '식량 저장고',
      compendiumOffice: '전서 관리소',
      trainingGround: '훈련장',
      dormitory: '유닛 거처',
      plaza: '광장',
      trainingWorkshop: '조교 공방',
      butterflyFarm: '수정나비 양식장',
      observatory: '관측소',
      laboratory: '연구소'
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
        workshop: '유닛 배치 시 월말 자동 가공. 레벨↑ = 가공 횟수↑ + 장비 범위↑'
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
      workshop: `자동가공 ${level * 2}회/월 (Lv1:가마 | Lv2:+분쇄 | Lv3:+압축)`
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
