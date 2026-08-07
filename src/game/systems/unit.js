'use strict';

const SE = require('./synthesisEngine'); // v2 모순쌍

// Unit System - Fusion, trait inheritance, experience, training
class UnitSystem {
  constructor(engine) {
    this.engine = engine;
  }

  // ===== FUSION (합체) =====

  // Preview fusion result
  previewFusion(instanceIdA, instanceIdB) {
    const unitA = this.engine.getUnitInstance(instanceIdA);
    const unitB = this.engine.getUnitInstance(instanceIdB);
    if (!unitA || !unitB) return null;

    const resultSigil = this.engine.getFusionResult(unitA.sigil, unitB.sigil);
    const resultLevel = Math.floor((unitA.level + unitB.level) / 2);

    // Find unit definition closest to result level with matching sigil
    const candidates = this.engine.data.units.filter(u => u.sigil === resultSigil);
    const resultDef = this.findClosestByLevel(candidates, resultLevel);

    return {
      unitA: { name: unitA.name, sigil: unitA.sigilName, level: unitA.level },
      unitB: { name: unitB.name, sigil: unitB.sigilName, level: unitB.level },
      resultSigil,
      resultSigilName: resultDef ? resultDef.sigilName : `인(${resultSigil})`,
      resultUnit: resultDef ? resultDef.name : '???',
      resultLevel
    };
  }

  // 합체 영혼력 비용 (잠정 — 통합 밸런싱 패스에서 조정)
  fusionCost(unitA, unitB) {
    // economy_soul_curve v1.2: 바닥 연동 = 0.4 × (바닥A + 바닥B) — 전 구간 "약 1개월치 순현금" 균질
    const f = l => this.engine.priceFloor(l || 1);
    return Math.floor(0.4 * (f(unitA.level) + f(unitB.level)));
  }

  // Execute fusion
  // opts.prima: '염'|'수은'|'유황' — 비축 삼원질 주입 (state.prima에서 소비)
  executeFusion(instanceIdA, instanceIdB, opts = {}) {
    const unitA = this.engine.getUnitInstance(instanceIdA);
    const unitB = this.engine.getUnitInstance(instanceIdB);
    if (!unitA || !unitB) return { success: false, reason: '유닛을 찾을 수 없습니다.' };

    // Cannot fuse units in party or assigned to facilities
    if (unitA.assignedFacility || unitB.assignedFacility) {
      return { success: false, reason: '배치 중인 유닛은 합체할 수 없습니다.' };
    }

    // v2: 비용/주입 검증
    this.engine.ensureV2State();
    const cost = this.fusionCost(unitA, unitB);
    if (this.engine.state.soulPower < cost) {
      return { success: false, reason: '영혼력이 부족합니다. (필요 ' + cost + ')' };
    }
    if (opts.prima && !(this.engine.state.prima[opts.prima] > 0)) {
      return { success: false, reason: '비축한 ' + opts.prima + '이(가) 없습니다.' };
    }

    // v2: 삼원질 효과 수집 — 소재 印(7=염) + 비축 주입
    const primas = [];
    if (unitA.sigil === 7) primas.push('염');
    if (unitB.sigil === 7) primas.push('염');
    if (opts.prima) primas.push(opts.prima);

    const resultSigil = this.engine.getFusionResult(unitA.sigil, unitB.sigil);
    const resultLevel = Math.floor((unitA.level + unitB.level) / 2);

    // Find result unit definition
    const candidates = this.engine.data.units.filter(u => u.sigil === resultSigil);
    const resultDef = this.findClosestByLevel(candidates, resultLevel);

    if (!resultDef) {
      return { success: false, reason: '합체 결과를 찾을 수 없습니다.' };
    }

    // Fusion accident check (5% chance)
    let actualDef = resultDef;
    let isAccident = false;
    if (Math.random() < 0.05) {
      // Pick random unit from all alpha units
      const allUnits = this.engine.data.units;
      actualDef = allUnits[Math.floor(Math.random() * allUnits.length)];
      isAccident = true;
    }

    // Create result instance
    const resultInstance = this.engine.createUnitInstance(actualDef);

    // Trait inheritance (3 routes)
    const inheritedTraits = this.performTraitInheritance(unitA, unitB, resultInstance, actualDef, primas);
    resultInstance.traits = inheritedTraits.final;
    resultInstance.potential = inheritedTraits.potential;
    // v2: 모순쌍 공존 검출 (합체 결과 트레잇에 대립쌍이 함께 있으면)
    resultInstance.contradictions = this._checkContradictions(resultInstance.traits);
    // v2: 모순쌍 발동 규칙 v1 (trait_contradiction_pairs.md) — 방향 판정 + 결과 트레잇 적용
    if (resultInstance.contradictions && resultInstance.contradictions.length) {
      const hasMercury = primas.includes('수은');
      const _reg = (this.engine.data && this.engine.data.traits) || [];
      const _ctx = {
        붕괴도: (resultInstance.변용도 && resultInstance.변용도['붕괴']) || 0,
        침염부정: ((resultInstance.침염 || {})['공포'] || 0) + ((resultInstance.침염 || {})['반감'] || 0),
      };
      resultInstance.contradictions = resultInstance.contradictions.map(c => {
        const d = SE.decideContradiction(c, { mercury: hasMercury, ctx: _ctx });
        const row = d.resultId ? _reg.find(t => t.id === d.resultId) : null;
        if (row) {
          if (d.direction === 'integrate') {
            // 통합 = 두 극 소거 + 통합 트레잇
            resultInstance.traits = resultInstance.traits.filter(id => {
              const t = _reg.find(x => x.id === id);
              return !t || (t.name !== c.pair[0] && t.name !== c.pair[1]);
            });
          } else {
            // 분열 = 두 극 유지 + 분열 트레잇 + 공포 침염 1 (붕괴 feeder)
            resultInstance.침염 = resultInstance.침염 || {};
            resultInstance.침염['공포'] = (resultInstance.침염['공포'] || 0) + 1;
          }
          if (!resultInstance.traits.includes(row.id)) resultInstance.traits.push(row.id);
        }
        return { ...c, resolution: d.direction, resultTrait: row ? row.id : null };
      });
    }

    // v2: 비용 지불 + 주입 삼원질 소비
    this.engine.state.soulPower -= cost;
    if (opts.prima) this.engine.state.prima[opts.prima]--;

    // Remove source units
    this.engine.state.ownedUnits = this.engine.state.ownedUnits.filter(
      u => u.instanceId !== instanceIdA && u.instanceId !== instanceIdB
    );

    // Remove from party
    this.engine.state.party = this.engine.state.party.filter(
      id => id !== instanceIdA && id !== instanceIdB
    );

    // Add result
    this.engine.state.ownedUnits.push(resultInstance);

    // Register in compendium
    if (!this.engine.state.compendium.registered.includes(actualDef.id)) {
      this.engine.state.compendium.registered.push(actualDef.id);
    }

    return {
      success: true,
      result: resultInstance,
      isAccident,
      consumed: [unitA.name, unitB.name],
      inheritedTraits,
      primas,
      cost
    };
  }

  findClosestByLevel(candidates, targetLevel) {
    if (candidates.length === 0) return null;

    return candidates.reduce((closest, current) => {
      if (!closest) return current;
      return Math.abs(current.level - targetLevel) < Math.abs(closest.level - targetLevel)
        ? current : closest;
    }, null);
  }

  // Trait inheritance: 3 routes (합성 발동 → 직접 계승 → 잠재력 계승)
  // v2: 모순쌍 공존 검출 — 트레잇 id 목록 → 이름 매핑 → contradictionPairs 대조
  _checkContradictions(traitIds) {
    if (!this._contraPairs) {
      const rows = (this.engine.balance && this.engine.balance.getRows)
        ? this.engine.balance.getRows('contradictionPairs.csv', '_default') : [];
      const reg = (this.engine.data && this.engine.data.traits) || [];
      this._contraPairs = SE.loadContradictions(rows, reg);
    }
    // v2: id 직접 매칭 (이름 매핑 제거 — 이름 중복 오발동 차단)
    return SE.checkContradictions(traitIds || [], this._contraPairs);
  }

  performTraitInheritance(unitA, unitB, resultInstance, resultDef, primas = []) {
    const allTraitsA = [...(unitA.traits || [])];
    const allTraitsB = [...(unitB.traits || [])];

    // ═══ Route 1: 합성 발동 (최우선) ═══
    // 소재 A+B의 트레잇이 합성 조건을 충족하면 합성 트레잇 생성
    const synthesized = this.checkTraitSynthesis(allTraitsA, allTraitsB);
    const usedInSynthesis = new Set();
    const synthResults = [];

    for (const synth of synthesized) {
      synthResults.push(synth.result);
      for (const req of synth.consumed) {
        usedInSynthesis.add(req);
      }
    }

    // ═══ Route 2: 직접 계승 (남은 슬롯, 성장도 높은 순) ═══
    const allTraits = [...allTraitsA, ...allTraitsB];
    const remaining = [...new Set(allTraits.filter(t => !usedInSynthesis.has(t)))];

    // 성장도 기반 정렬: exp가 높은 트레잇이 먼저
    // 전투 트레잇 → 전투 exp, 성격 트레잇 → 성격 exp로 가중
    const getTraitGrowth = (traitId, unit) => {
      const traitDef = this.engine.data.traits.find(t => t.id === traitId);
      if (!traitDef) return 0;
      if (traitDef.category === '전투') return unit.exp.combat || 0;
      if (traitDef.category === '성격') return unit.exp.personality || 0;
      if (traitDef.category === '성인') return unit.exp.adult || 0;
      if (traitDef.category === '신체') return unit.exp.body || 0;
      return (unit.exp.adult || 0) + (unit.exp.body || 0);
    };

    // 각 트레잇에 소재 유닛의 성장도를 매핑
    const traitGrowths = remaining.map(tid => {
      const growthA = allTraitsA.includes(tid) ? getTraitGrowth(tid, unitA) : 0;
      const growthB = allTraitsB.includes(tid) ? getTraitGrowth(tid, unitB) : 0;
      return { id: tid, growth: Math.max(growthA, growthB) };
    });

    // 성장도 높은 순 정렬
    traitGrowths.sort((a, b) => b.growth - a.growth);

    let directSlots = 3;
    // 염(鹽): 직접 계승 슬롯 +1 (소재 印 + 주입 통합)
    if (primas.includes('염')) directSlots += 1;

    const directInherited = traitGrowths.slice(0, directSlots).map(t => t.id);

    // ═══ Route 3: 잠재력 계승 (나머지 → 임계점 인하) ═══
    const potentialTraits = traitGrowths.slice(directSlots);
    const potential = {};
    for (const t of potentialTraits) {
      // 성장도에 비례하여 임계점 인하 (기본 20%, 성장도 높으면 최대 50%)
      let reduction = Math.min(0.5, 0.2 + (t.growth / 500) * 0.3);
      // 유황(硫): 잠재력 인하량 2배 (상한 90%)
      if (primas.includes('유황')) reduction = Math.min(0.9, reduction * 2);
      potential[t.id] = 1 - reduction; // 임계점 감소 배율
    }

    // ═══ 경험치 인자 계승 ═══
    // 소재의 미해금 경험치가 결과물의 풀 임계점을 낮춤
    const expInheritance = {};
    const pools = ['combat', 'body', 'personality', 'adult'];
    for (const pool of pools) {
      const expA = unitA.exp[pool] || 0;
      const expB = unitB.exp[pool] || 0;
      const totalExp = expA + expB;
      if (totalExp > 0) {
        // 소재 경험치의 30%를 결과물에 인자로 전달
        expInheritance[pool] = Math.floor(totalExp * 0.3);
      }
    }

    // 결과 유닛에 잠재력/인자 적용
    resultInstance.potential = potential;
    resultInstance.expInheritance = expInheritance;

    // 인자 경험치를 초기 경험치로 부여 (빠르게 트레잇 해금 가능)
    for (const [pool, exp] of Object.entries(expInheritance)) {
      resultInstance.exp[pool] = (resultInstance.exp[pool] || 0) + exp;
    }

    // 최종 트레잇: 합성 + 직접 계승 + 결과 유닛 기본 트레잇
    const defTraits = (resultDef.combatTraits || []).map(t => typeof t === 'object' ? t.id : t).filter(Boolean);
    const final = [...new Set([...synthResults, ...directInherited, ...defTraits])];

    return {
      synthesized: synthResults,
      direct: directInherited,
      potentialTraits: potentialTraits.map(t => t.id),
      potential,
      expInheritance,
      final
    };
  }

  checkTraitSynthesis(traitsA, traitsB) {
    const synthRecipes = this.engine.data.traitSynthesis;
    if (!synthRecipes || !Array.isArray(synthRecipes)) return [];

    // 합체 시: 서로 다른 유닛의 트레잇끼리 합성 가능
    const setA = new Set(traitsA);
    const setB = new Set(traitsB);
    const allTraits = new Set([...traitsA, ...traitsB]);
    const results = [];
    const usedTraits = new Set();

    for (const recipe of synthRecipes) {
      const required = recipe.requiredTraits || [];
      if (required.length === 0) continue;

      // 모든 필요 트레잇이 합산 풀에 있는지
      if (required.every(t => allTraits.has(t) && !usedTraits.has(t))) {
        // 최소 하나는 크로스 (A에서 하나, B에서 하나) → 합체의 의미
        const fromA = required.filter(t => setA.has(t));
        const fromB = required.filter(t => setB.has(t));
        const isCross = fromA.length > 0 && fromB.length > 0;
        // 같은 유닛에서 모든 조건 충족도 허용 (단일 육성에서도 발동)

        const resultTraitId = recipe.resultTrait || recipe.id;
        results.push({
          result: resultTraitId,
          name: recipe.name,
          consumed: required,
          isCross
        });
        // 사용된 트레잇 마킹
        for (const t of required) usedTraits.add(t);
      }
    }

    return results;
  }

  // ===== EXPERIENCE & TRAINING =====

  // Train a unit (전투 훈련)
  trainUnit(instanceId) {
    const unit = this.engine.getUnitInstance(instanceId);
    if (!unit) return { success: false, reason: '유닛을 찾을 수 없습니다.' };
    if (unit.isKnockedOut) return { success: false, reason: '기절 상태의 유닛은 훈련할 수 없습니다.' };
    if (!this.engine.useStamina(2)) return { success: false, reason: '스태미나가 부족합니다.' };

    // Combat exp gain (primary) — 도구 효율 적용
    const sigilMultiplier = this.getSigilExpMultiplier(unit.sigil, 'combat');
    const toolBonus = this.engine.getTrainingBonus('combat');
    const expGain = Math.floor(20 * sigilMultiplier * toolBonus);
    unit.exp.combat += expGain;

    // Body exp gain (secondary, smaller)
    unit.exp.body += Math.floor(5 * this.getSigilExpMultiplier(unit.sigil, 'body'));

    // Affection change
    unit.affection += 1;

    // Check trait unlock
    const unlocked = this.checkTraitUnlock(unit, 'combat');

    // Level up check
    const leveled = this.checkLevelUp(unit);

    return {
      success: true,
      expGain,
      unlocked,
      leveled,
      message: `${unit.name}을(를) 훈련시켰다. (전투 경험치 +${expGain})`
    };
  }

  // Socialize with unit (교류)
  socialize(instanceId) {
    const unit = this.engine.getUnitInstance(instanceId);
    if (!unit) return { success: false, reason: '유닛을 찾을 수 없습니다.' };
    if (!this.engine.useStamina(1)) return { success: false, reason: '스태미나가 부족합니다.' };

    // Personality exp gain (primary)
    const expGain = Math.floor(15 * this.getSigilExpMultiplier(unit.sigil, 'personality'));
    unit.exp.personality += expGain;

    // Affection increase
    const affGain = 2 + Math.floor(Math.random() * 3);
    unit.affection = Math.min(100, unit.affection + affGain);

    // Check trait unlock + level up
    const unlocked = this.checkTraitUnlock(unit, 'personality');
    const leveled = this.checkLevelUp(unit);

    return {
      success: true,
      expGain,
      affGain,
      leveled,
      unlocked,
      message: `${unit.name}과(와) 교류했다. (호감도 +${affGain})`
    };
  }

  // Train adult traits (조교)
  trainAdult(instanceId, toolId) {
    const unit = this.engine.getUnitInstance(instanceId);
    if (!unit) return { success: false, reason: '유닛을 찾을 수 없습니다.' };
    if (!this.engine.useStamina(3)) return { success: false, reason: '스태미나가 부족합니다.' };

    // Adult exp gain (primary)
    const expGain = Math.floor(20 * this.getSigilExpMultiplier(unit.sigil, 'adult'));
    unit.exp.adult += expGain;

    // Personality exp (secondary)
    unit.exp.personality += Math.floor(5 * this.getSigilExpMultiplier(unit.sigil, 'personality'));

    // Tool bonus (if provided)
    if (toolId && this.engine.hasMaterial(toolId)) {
      // Consume tool durability or count
    }

    // Sensitivity changes based on unit's adult trait
    const senResult = this.processSensitivityChange(unit);

    // Global state changes
    const stateResult = this.processGlobalStateChange(unit);

    // Affection change (can decrease if resentment is high)
    if (unit.globalState.resentment > 50) {
      unit.affection = Math.max(0, unit.affection - 1);
    }

    const unlocked = this.checkTraitUnlock(unit, 'adult');

    return {
      success: true,
      expGain,
      senResult,
      stateResult,
      unlocked,
      message: `${unit.name}을(를) 조교했다.`
    };
  }

  processSensitivityChange(unit) {
    const changes = {};
    const parts = ['mouth', 'chest', 'v', 'c', 'anal', 'skin'];
    const partNames = { mouth: '입', chest: '가슴', v: 'V', c: 'C', anal: '애널', skin: '피부' };

    // Random part gets sensitivity increase
    const targetPart = parts[Math.floor(Math.random() * parts.length)];
    const gain = 1 + Math.floor(Math.random() * 3);

    unit.sensitivity[targetPart] = (unit.sensitivity[targetPart] || 0) + gain;
    changes[targetPart] = gain;

    return { changes, partNames };
  }

  processGlobalStateChange(unit) {
    const changes = {};

    // Base changes per training session
    const submissionGain = 1 + Math.floor(Math.random() * 2);
    const lewdnessGain = 1 + Math.floor(Math.random() * 2);

    unit.globalState.submission += submissionGain;
    unit.globalState.lewdness += lewdnessGain;
    changes.submission = submissionGain;
    changes.lewdness = lewdnessGain;

    // Fear/resentment based on personality
    if (unit.affection < 30) {
      const fearGain = Math.floor(Math.random() * 2);
      unit.globalState.fear += fearGain;
      changes.fear = fearGain;
    }

    return changes;
  }

  // Sigil experience multipliers
  getSigilExpMultiplier(sigil, pool) {
    const multipliers = {
      1: { combat: 1.3, body: 1.1, personality: 0.8, adult: 0.8 },   // 백양
      2: { combat: 1.0, body: 1.2, personality: 0.9, adult: 0.9 },   // 금우
      3: { combat: 0.7, body: 0.9, personality: 1.2, adult: 1.3 },   // 거해
      4: { combat: 1.1, body: 1.0, personality: 1.0, adult: 1.0 },   // 처녀
      5: { combat: 1.5, body: 0.7, personality: 0.7, adult: 0.7 },   // 천갈
      6: { combat: 0.8, body: 0.8, personality: 1.1, adult: 1.2 },   // 쌍어
      7: { combat: 0.9, body: 0.9, personality: 0.9, adult: 0.9 }    // 염
    };
    return (multipliers[sigil] && multipliers[sigil][pool]) || 1.0;
  }

  // Check if a trait unlocks from experience
  // 잠재력 계승이 있으면 임계점이 낮아짐
  checkTraitUnlock(unit, pool) {
    let threshold = 50; // base threshold
    const exp = unit.exp[pool] || 0;

    if (exp < threshold) return null;

    // Probability increases with excess exp
    const excess = exp - threshold;
    let chance = Math.min(0.5, 0.1 + excess * 0.005);

    // Get candidate traits for this pool
    const candidates = this.getTraitCandidates(pool, unit);
    if (candidates.length === 0) return null;

    // 잠재력 보정: 합체로 받은 잠재력이 있으면 특정 트레잇의 확률 상승
    const potential = unit.potential || {};
    const boostedCandidates = candidates.map(c => {
      let weight = 1;
      if (potential[c.id]) {
        weight = 1 + (1 - potential[c.id]) * 3; // 잠재력 0.5 → weight 2.5
      }
      return { ...c, weight };
    });

    if (Math.random() > chance) return null;

    // 가중치 기반 랜덤 선택
    const totalWeight = boostedCandidates.reduce((s, c) => s + c.weight, 0);
    let roll = Math.random() * totalWeight;
    let picked = boostedCandidates[0];
    for (const c of boostedCandidates) {
      roll -= c.weight;
      if (roll <= 0) { picked = c; break; }
    }

    // Add trait if not already owned
    if (!unit.traits.includes(picked.id)) {
      unit.traits.push(picked.id);
      const fromPotential = potential[picked.id] ? ' (잠재력 발현!)' : '';
      return { traitId: picked.id, traitName: picked.name, pool, fromPotential };
    }

    return null;
  }

  getTraitCandidates(pool, unit) {
    const traits = this.engine.data.traits;
    if (!traits || !Array.isArray(traits)) return [];

    const poolCategory = {
      combat: '전투',
      body: '신체',
      personality: '성격',
      adult: '성인'
    };

    return traits.filter(t =>
      t.category === poolCategory[pool] &&
      !unit.traits.includes(t.id)
    );
  }

  // Level up check
  checkLevelUp(unit) {
    const totalExp = Object.values(unit.exp).reduce((s, v) => s + v, 0);
    const threshold = unit.level * 100;

    if (totalExp >= threshold) {
      unit.level++;

      // Stat scaling
      const catStats = {
        '요괴': { hp: 5, atk: 3, def: 2, spd: 2 },
        '정령': { hp: 5, atk: 2, def: 2, spd: 2 },
        '인조': { hp: 6, atk: 2, def: 3, spd: 1 },
        '야수': { hp: 4, atk: 2, def: 1, spd: 3 },
        '환상': { hp: 3, atk: 2, def: 2, spd: 2 }
      };
      const growth = catStats[unit.category] || catStats['정령'];
      unit.maxHp += growth.hp;
      unit.hp = unit.maxHp;
      unit.atk += growth.atk;
      unit.def += growth.def;
      unit.spd += growth.spd;

      return { leveled: true, newLevel: unit.level };
    }

    return null;
  }

  // Give item to unit (gift)
  giveItem(instanceId, itemId) {
    const unit = this.engine.getUnitInstance(instanceId);
    if (!unit) return { success: false, reason: '유닛을 찾을 수 없습니다.' };
    if (!this.engine.hasMaterial(itemId)) return { success: false, reason: '아이템이 없습니다.' };

    this.engine.removeMaterial(itemId, 1);

    const item = this.engine.data.materials.find(m => m.id === itemId);
    const itemName = item ? item.name : itemId;

    // Effect depends on item type
    let affGain = 3;
    let message = `${unit.name}에게 ${itemName}을(를) 주었다.`;

    if (item && item.category === 'consumable_food') {
      affGain = 5;
      message += ' 맛있게 먹었다.';
    }

    unit.affection = Math.min(100, unit.affection + affGain);

    return { success: true, affGain, message };
  }

  // Equip item to unit
  equipItem(instanceId, itemId, slot) {
    const unit = this.engine.getUnitInstance(instanceId);
    if (!unit) return { success: false, reason: '유닛을 찾을 수 없습니다.' };
    if (!this.engine.hasMaterial(itemId)) return { success: false, reason: '장비가 없습니다.' };

    const item = this.engine.data.materials.find(m => m.id === itemId);
    if (!item) return { success: false, reason: '아이템을 찾을 수 없습니다.' };

    // Unequip current
    if (unit.equipment[slot]) {
      this.engine.addMaterial(unit.equipment[slot], 1);
    }

    this.engine.removeMaterial(itemId, 1);
    unit.equipment[slot] = itemId;

    // Apply stat changes
    if (item.effect) {
      if (item.effect.type === 'atkUp') unit.atk += item.effect.value;
      if (item.effect.type === 'defUp') unit.def += item.effect.value;
    }

    return {
      success: true,
      message: `${unit.name}에게 ${item.name}을(를) 장착했다.`
    };
  }

  // Deliver unit to compendium (납품)
  deliverUnit(instanceId) {
    const unit = this.engine.getUnitInstance(instanceId);
    if (!unit) return { success: false, reason: '유닛을 찾을 수 없습니다.' };

    if (this.engine.state.party.includes(instanceId)) {
      return { success: false, reason: '파티에서 먼저 제외해주세요.' };
    }

    if (unit.assignedFacility) {
      return { success: false, reason: '배치 중인 유닛은 납품할 수 없습니다.' };
    }

    const soulPower = this.engine.calcSoulPowerValue(unit);

    // Register in compendium
    if (!this.engine.state.compendium.registered.includes(unit.unitId)) {
      this.engine.state.compendium.registered.push(unit.unitId);
    }

    // Remove unit
    this.engine.state.ownedUnits = this.engine.state.ownedUnits.filter(
      u => u.instanceId !== instanceId
    );

    // Add soul power
    this.engine.state.soulPower += soulPower;

    return {
      success: true,
      soulPower,
      unitName: unit.name,
      affection: unit.affection,
      message: `${unit.name}을(를) 전서에 납품했다. (영혼력 +${soulPower})`
    };
  }

  // Get affection stage name
  getAffectionStage(affection) {
    if (affection < 15) return { stage: 0, name: '경계' };
    if (affection < 35) return { stage: 1, name: '인지' };
    if (affection < 55) return { stage: 2, name: '친밀' };
    if (affection < 75) return { stage: 3, name: '신뢰' };
    if (affection < 90) return { stage: 4, name: '유대' };
    return { stage: 5, name: '헌신' };
  }

  // Buy unit from compendium
  buyFromCompendium(unitId) {
    const pool = [
      ...this.engine.state.compendium.basicPool,
      ...this.engine.state.compendium.registered
    ];

    if (!pool.includes(unitId)) {
      return { success: false, reason: '전서에 등록되지 않은 유닛입니다.' };
    }

    const unitDef = this.engine.getUnitDef(unitId);
    if (!unitDef) return { success: false, reason: '유닛 데이터를 찾을 수 없습니다.' };

    const price = this.engine.priceFloor(unitDef.level) * 5; // 전서 정가 = 바닥 ×5 (ERA 5:1, 레벨 고정)
    if (this.engine.state.soulPower < price) {
      return { success: false, reason: `영혼력이 부족합니다. (필요: ${price})` };
    }

    this.engine.state.soulPower -= price;
    const instance = this.engine.createUnitInstance(unitDef);
    this.engine.state.ownedUnits.push(instance);

    return {
      success: true,
      unit: instance,
      price,
      message: `${unitDef.name}을(를) 전서에서 소환했다. (영혼력 -${price})`
    };
  }
}

module.exports = UnitSystem;
