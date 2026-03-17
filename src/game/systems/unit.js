'use strict';

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

  // Execute fusion
  executeFusion(instanceIdA, instanceIdB) {
    const unitA = this.engine.getUnitInstance(instanceIdA);
    const unitB = this.engine.getUnitInstance(instanceIdB);
    if (!unitA || !unitB) return { success: false, reason: '유닛을 찾을 수 없습니다.' };

    // Cannot fuse units in party or assigned to facilities
    if (unitA.assignedFacility || unitB.assignedFacility) {
      return { success: false, reason: '배치 중인 유닛은 합체할 수 없습니다.' };
    }

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
    const inheritedTraits = this.performTraitInheritance(unitA, unitB, resultInstance, actualDef);
    resultInstance.traits = inheritedTraits.final;
    resultInstance.potential = inheritedTraits.potential;

    // Special sigil effects
    if (unitA.sigil === 7 || unitB.sigil === 7) {
      // 염(Salt): +1 direct inheritance slot (handled in inheritance)
    }

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
      inheritedTraits
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

  // Trait inheritance: 3 routes
  performTraitInheritance(unitA, unitB, resultInstance, resultDef) {
    const allTraitsA = [...(unitA.traits || [])];
    const allTraitsB = [...(unitB.traits || [])];
    const allTraits = [...allTraitsA, ...allTraitsB];

    // Route 1: Synthesis (highest priority)
    const synthesized = this.checkTraitSynthesis(allTraitsA, allTraitsB);
    const usedInSynthesis = new Set();
    const synthResults = [];

    for (const synth of synthesized) {
      synthResults.push(synth.result);
      for (const req of synth.consumed) {
        usedInSynthesis.add(req);
      }
    }

    // Route 2: Direct inheritance (remaining slots)
    const remaining = allTraits.filter(t => !usedInSynthesis.has(t));
    let directSlots = 3; // base direct inheritance slots

    // 염(Salt) bonus: +1 slot
    if (unitA.sigil === 7 || unitB.sigil === 7) {
      directSlots += 1;
    }

    // Select by growth (we don't have growth data, so random selection)
    const directInherited = remaining.slice(0, directSlots);

    // Route 3: Potential (everything else)
    const potentialTraits = remaining.slice(directSlots);
    const potential = {};
    for (const traitId of potentialTraits) {
      // Reduce threshold for this trait by 20%
      potential[traitId] = 0.8;
    }

    // 유황(Sulfur) bonus: potential reduction doubled
    if (unitA.sigil === 7 || unitB.sigil === 7) {
      // Actually sulfur is not in alpha, but we check anyway
    }

    // Merge all traits, normalize to IDs
    const defTraits = (resultDef.combatTraits || []).map(t => typeof t === 'object' ? t.id : t).filter(Boolean);
    const final = [...synthResults, ...directInherited, ...defTraits];
    // Remove duplicates
    const uniqueFinal = [...new Set(final)];

    return {
      synthesized: synthResults,
      direct: directInherited,
      potentialTraits,
      potential,
      final: uniqueFinal
    };
  }

  checkTraitSynthesis(traitsA, traitsB) {
    const synthRecipes = this.engine.data.traitSynthesis;
    if (!synthRecipes || !Array.isArray(synthRecipes)) return [];

    const allTraits = new Set([...traitsA, ...traitsB]);
    const results = [];

    for (const recipe of synthRecipes) {
      const required = recipe.requiredTraits || [];
      if (required.every(t => allTraits.has(t))) {
        results.push({
          result: recipe.id || recipe.resultTrait,
          name: recipe.name,
          consumed: required
        });
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

    // Combat exp gain (primary)
    const sigilMultiplier = this.getSigilExpMultiplier(unit.sigil, 'combat');
    const expGain = Math.floor(20 * sigilMultiplier);
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

    // Check trait unlock
    const unlocked = this.checkTraitUnlock(unit, 'personality');

    return {
      success: true,
      expGain,
      affGain,
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
  checkTraitUnlock(unit, pool) {
    const threshold = 50; // base threshold
    const exp = unit.exp[pool] || 0;

    if (exp < threshold) return null;

    // Probability increases with excess exp
    const excess = exp - threshold;
    const chance = Math.min(0.5, 0.1 + excess * 0.005);

    if (Math.random() > chance) return null;

    // Get candidate traits for this pool
    const candidates = this.getTraitCandidates(pool, unit);
    if (candidates.length === 0) return null;

    const picked = candidates[Math.floor(Math.random() * candidates.length)];

    // Add trait if not already owned
    if (!unit.traits.includes(picked.id)) {
      unit.traits.push(picked.id);
      return { traitId: picked.id, traitName: picked.name, pool };
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

    const price = unitDef.level * 15;
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
