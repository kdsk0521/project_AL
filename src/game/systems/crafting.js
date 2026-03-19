'use strict';

// Crafting System - Processing (tag transformation) + Combining (tag-based)
class CraftingSystem {
  constructor(engine) {
    this.engine = engine;

    // Contradiction pairs (12 pairs)
    this.contradictionPairs = [
      ['회복', '공격'], ['독성', '수호'], ['억제', '분산'],
      ['조련', '부여'], ['촉매', '마력촉매'],
      ['경도', '가공성'], ['전도', '보존'],
      ['열', '광'], ['위', '동'],
      ['기체', '결정'], ['액체', '분말'], ['식물', '광물']
    ];

    // Tag name mapping for auto-naming
    this.functionNames = {
      '회복': '회복', '독성': '맹독', '억제': '봉인', '분산': '확산',
      '공격': '파괴', '수호': '방호', '조련': '조련', '부여': '부여',
      '촉매': '변성', '마력촉매': '연성'
    };

    this.materialPropertyNames = {
      '경도': '견고한', '가공성': '용이한', '전도': '감응하는', '보존': '지속'
    };

    this.elementPrefixes = {
      '열': '열변의', '위': '압쇄의', '광': '광변의', '동': '진동의', '식': '기이한'
    };

    this.formSuffixes = {
      '액체': '수', '분말': '분', '광물': '석', '유기': '체',
      '기체': '기', '결정': '정', '식물': '초'
    };
  }

  // ===== PROCESSING (가공) =====

  // Get available processing options for a material
  getProcessingOptions(matId) {
    const mat = this.engine.data.materials.find(m => m.id === matId);
    if (!mat) return [];

    const options = [];
    const equip = this.engine.state.equipment;

    // 가마 (furnace) - 열 주입 + 광 해방
    if (equip.furnace) {
      if (mat.tags.form !== '기체' || mat.id === 'MAT_WATER') {
        // Water can be processed (becomes steam)
        options.push({ equipment: 'furnace', name: '가마 (굽기)', id: 'furnace' });
      }
    }

    // 분쇄기 (crusher) - 위 해방 + 식 해방
    if (equip.crusher) {
      if (mat.tags.form !== '액체' && mat.tags.form !== '기체') {
        options.push({ equipment: 'crusher', name: '분쇄기 (부수기)', id: 'crusher' });
      }
    }

    // 압축기 (compressor) - 위 주입 + 동 해방
    if (equip.compressor) {
      options.push({ equipment: 'compressor', name: '압축기 (누르기)', id: 'compressor' });
    }

    return options;
  }

  // Process a material
  processMaterial(matId, equipmentId) {
    const mat = this.engine.data.materials.find(m => m.id === matId);
    if (!mat) return { success: false, reason: '재료를 찾을 수 없습니다.' };
    if (!this.engine.hasMaterial(matId)) return { success: false, reason: '재료가 부족합니다.' };

    // Stamina cost
    if (!this.engine.useStamina(1)) {
      return { success: false, reason: '스태미나가 부족합니다.' };
    }

    this.engine.removeMaterial(matId, 1);

    // Look up processing result from data
    const procData = this.engine.data.processing;
    const key = `${matId}_${equipmentId}`;
    const procResult = procData ? procData[key] : null;

    if (procResult) {
      // Add result to inventory
      this.engine.addMaterial(procResult.resultId, 1);
      return {
        success: true,
        input: mat.name,
        equipment: equipmentId,
        result: procResult
      };
    }

    // Fallback: generate result from rules
    const result = this.applyProcessingRules(mat, equipmentId);
    this.engine.addMaterial(result.id, 1);

    return {
      success: true,
      input: mat.name,
      equipment: equipmentId,
      result
    };
  }

  applyProcessingRules(mat, equipmentId) {
    // 태그를 배열로 정규화 (복수 태그 대응)
    const tags = mat.tags || {};
    let funcs = tags.functions || (tags.function ? (Array.isArray(tags.function) ? [...tags.function] : [tags.function]) : []);
    let elems = tags.elements || (tags.element ? (Array.isArray(tags.element) ? [...tags.element] : [tags.element]) : []);
    let forms = tags.forms || (tags.form ? (Array.isArray(tags.form) ? [...tags.form] : [tags.form]) : []);
    funcs = funcs.filter(Boolean);
    elems = elems.filter(Boolean);
    forms = forms.filter(Boolean);

    const furnaceMap = { '회복':'보존', '촉매':'억제', '경도':'공격', '독성':'가공성', '전도':'수호', '가공성':'가공성' };
    const compressMap = { '회복':'수호', '촉매':'부여', '독성':'조련', '전도':'보존', '가공성':'전도', '경도':'경도' };

    if (equipmentId === 'furnace') {
      // 가마: 열 주입 (기능 전부 변환) + 광 해방 (광 원소 전부 제거)
      funcs = funcs.map(f => furnaceMap[f] || f);
      forms = forms.map(f => f === '액체' ? '기체' : f);
      elems = elems.filter(e => e !== '광'); // 광 제거
    } else if (equipmentId === 'crusher') {
      // 분쇄기: 위 해방 (형태 전부 → 분말) + 식 해방 (식 원소 전부 제거)
      forms = forms.map(() => '분말');
      elems = elems.filter(e => e !== '식'); // 식 제거
    } else if (equipmentId === 'compressor') {
      // 압축기: 위 주입 (기능 전부 변환) + 동 해방 (동 원소 전부 제거)
      funcs = funcs.map(f => compressMap[f] || f);
      forms = forms.map(() => '결정');
      elems = elems.filter(e => e !== '동'); // 동 제거
    }

    // 중복 유지! 중복 = tier 결정의 핵심
    // (보존×2, 식×2, 식물×2 → tier 2)
    const resultTags = {
      function: funcs.length === 1 ? funcs[0] : funcs,
      element: elems.length === 0 ? null : (elems.length === 1 ? elems[0] : elems),
      form: forms.length === 1 ? forms[0] : forms,
      functions: funcs, elements: elems, forms: forms
    };

    // ID format
    const suffixMap = { furnace: '_FIRED', crusher: '_CRUSHED', compressor: '_COMPRESSED' };
    const resultId = `${mat.id}${suffixMap[equipmentId] || '_PROC'}`;
    const resultName = this.generateName(resultTags);

    // Register as a material if not already exists
    // 가공 결과의 tier도 태그 밀도로 재계산
    const allProcTags = [...funcs, ...elems, ...forms].filter(Boolean);
    const procCounts = {};
    allProcTags.forEach(t => { procCounts[t] = (procCounts[t] || 0) + 1; });
    const procTotalTier = Object.values(procCounts).reduce((s, v) => s + v, 0);
    const procUnique = Object.keys(procCounts).length;
    const resultTier = procUnique > 0 ? Math.max(1, Math.floor(procTotalTier / procUnique)) : mat.tier;

    const existing = this.engine.data.materials.find(m => m.id === resultId);
    if (!existing) {
      this.engine.data.materials.push({
        id: resultId,
        name: resultName,
        tier: resultTier,
        tags: resultTags,
        source: `가공(${mat.name})`,
        lore: `${mat.name}을(를) 가공한 결과물.`
      });
    }

    return {
      id: resultId,
      name: resultName,
      tags: resultTags,
      tier: resultTier
    };
  }

  // ===== COMBINING (조합) =====

  // Combine two materials
  combine(matIdA, matIdB) {
    const matA = this.engine.data.materials.find(m => m.id === matIdA);
    const matB = this.engine.data.materials.find(m => m.id === matIdB);

    if (!matA || !matB) return { success: false, reason: '재료를 찾을 수 없습니다.' };
    if (!this.engine.hasMaterial(matIdA)) return { success: false, reason: `${matA.name}이(가) 부족합니다.` };
    if (!this.engine.hasMaterial(matIdB)) return { success: false, reason: `${matB.name}이(가) 부족합니다.` };

    if (!this.engine.useStamina(2)) {
      return { success: false, reason: '스태미나가 부족합니다.' };
    }

    // Consume materials
    this.engine.removeMaterial(matIdA, 1);
    this.engine.removeMaterial(matIdB, 1);

    // Step 1: Check special recipes
    const specialResult = this.checkSpecialRecipe(matIdA, matIdB);
    if (specialResult) {
      this.engine.addMaterial(specialResult.id, 1);
      return { success: true, result: specialResult, type: 'special' };
    }

    // Step 2: Tag-based combining
    const combinedTags = this.mergeTags(matA.tags, matB.tags);
    const contradictions = this.countContradictions(combinedTags);

    if (contradictions >= 5) {
      // Unknown result
      const unknownId = `UNK_${Date.now()}`;
      const unknownResult = {
        id: unknownId,
        name: '미지의 결과물',
        tier: Math.floor((matA.tier + matB.tier) / 2),
        tags: combinedTags,
        category: 'unknown',
        lore: '해석할 수 없는 무언가가 만들어졌다.'
      };
      this.engine.data.materials.push(unknownResult);
      this.engine.addMaterial(unknownId, 1);
      return { success: true, result: unknownResult, type: 'unknown', contradictions };
    }

    // Normal combination
    const result = this.createCombinedItem(matA, matB, combinedTags, contradictions);
    this.engine.addMaterial(result.id, 1);
    return { success: true, result, type: 'normal', contradictions };
  }

  checkSpecialRecipe(matIdA, matIdB) {
    const recipes = this.engine.data.recipes;
    if (!recipes) return null;

    for (const recipe of recipes) {
      const mats = recipe.materials || [];
      if (mats.length === 2) {
        if ((mats[0] === matIdA && mats[1] === matIdB) ||
            (mats[0] === matIdB && mats[1] === matIdA)) {
          // Check if already registered as material
          let existing = this.engine.data.materials.find(m => m.id === recipe.resultId);
          if (!existing) {
            existing = {
              id: recipe.resultId,
              name: recipe.name,
              tier: recipe.tier || 1,
              tags: recipe.resultTags || {},
              source: '특수 레시피',
              lore: recipe.lore || '',
              category: recipe.category,
              effect: recipe.effect
            };
            this.engine.data.materials.push(existing);
          }
          return existing;
        }
      }
    }
    return null;
  }

  mergeTags(tagsA, tagsB) {
    const merged = {};

    // 배열화 헬퍼: 값을 무조건 배열로
    const toArr = (v) => !v ? [] : (Array.isArray(v) ? [...v] : [v]);

    // 기능 태그: 중복 유지 (회복+회복 = 회복×2)
    {
      const a = [...toArr(tagsA.functions || tagsA.function)];
      const b = [...toArr(tagsB.functions || tagsB.function)];
      merged.functions = [...a, ...b].filter(Boolean);
      merged.function = merged.functions[0] || null;
    }
    // 원소 태그: 중복 유지
    {
      const a = [...toArr(tagsA.elements || tagsA.element)];
      const b = [...toArr(tagsB.elements || tagsB.element)];
      merged.elements = [...a, ...b].filter(Boolean);
      merged.element = merged.elements[0] || null;
    }
    // 형태 태그: 중복 유지
    {
      const a = [...toArr(tagsA.forms || tagsA.form)];
      const b = [...toArr(tagsB.forms || tagsB.form)];
      merged.forms = [...a, ...b].filter(Boolean);
      merged.form = merged.forms[0] || null;
    }

    return merged;
  }

  countContradictions(tags) {
    let count = 0;
    const allTags = [
      ...(tags.functions || []),
      ...(tags.elements || []),
      ...(tags.forms || [])
    ];

    for (const [a, b] of this.contradictionPairs) {
      if (allTags.includes(a) && allTags.includes(b)) {
        count++;
      }
    }
    return count;
  }

  createCombinedItem(matA, matB, combinedTags, contradictions) {
    const tier = this.calcTier(matA, matB, combinedTags);
    const name = this.generateName(combinedTags);
    const category = this.determineCategory(combinedTags);
    // Deterministic ID: same inputs always produce same ID (so items stack)
    const idA = matA.id < matB.id ? matA.id : matB.id;
    const idB = matA.id < matB.id ? matB.id : matA.id;
    const id = `CRAFT_${idA}_${idB}`;

    // If already exists in materials, reuse it
    const existingCraft = this.engine.data.materials.find(m => m.id === id);
    if (existingCraft) {
      return existingCraft;
    }

    const item = {
      id,
      name,
      tier: Math.min(tier, 4),
      tags: combinedTags,
      category,                                      // 레거시 호환
      usages: this.determineUsages(combinedTags),    // v4.2 용도축
      functions: this.determineFunctions(combinedTags), // v4.2 기능축
      source: `조합(${matA.name}+${matB.name})`,
      lore: this.generateLore(combinedTags),
      effect: this.generateEffect(combinedTags, tier)
    };

    this.engine.data.materials.push(item);
    return item;
  }

  countDuplicates(tagsA, tagsB) {
    let count = 0;
    for (const key of Object.keys(tagsA)) {
      if (tagsA[key] && tagsA[key] === tagsB[key]) count++;
    }
    return count;
  }

  // ═══ Tier 계산: 태그 중복 = 집중 = 고tier, 태그 분산 = 다양 = 저tier ═══
  calcTier(matA, matB, combinedTags) {
    // 모든 태그를 풀어서 중복 카운트
    const allTags = [];
    for (const mat of [matA, matB]) {
      const tags = mat.tags || {};
      const funcs = tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : []);
      const elems = tags.elements || (tags.element ? [tags.element] : []);
      const forms = tags.forms || (tags.form ? [tags.form] : []);
      allTags.push(...funcs.filter(Boolean), ...elems.filter(Boolean), ...forms.filter(Boolean));
    }

    if (allTags.length === 0) return 1;

    // 태그별 중복 횟수 = 해당 태그의 tier
    const counts = {};
    allTags.forEach(t => { counts[t] = (counts[t] || 0) + 1; });

    // 전체 tier 합 ÷ 고유 태그 수 (버림)
    const totalTier = Object.values(counts).reduce((s, v) => s + v, 0);
    const uniqueTags = Object.keys(counts).length;
    const result = Math.floor(totalTier / uniqueTags);

    return Math.max(1, Math.min(result, 5)); // 최소 1, 최대 5
  }

  // ═══ v4.2: 2축 카테고리 시스템 ═══

  // 용도축: 형태 태그에서 도출 (복수 가능)
  determineUsages(tags) {
    const form = tags.forms || (tags.form ? [tags.form] : []);
    const func = tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : []);
    const usages = [];

    // 장비 판정: 광물/유기 + 공격/수호/부여
    if (form.some(f => ['광물','유기','결정'].includes(f)) && func.some(f => ['공격','수호','부여'].includes(f))) {
      usages.push('equipment');
    }
    // 소비재 판정: 액체/분말/기체 or 회복/독성/억제/분산
    if (form.some(f => ['액체','분말','기체','식물'].includes(f)) || func.some(f => ['회복','독성','억제','분산'].includes(f))) {
      usages.push('consumable');
    }
    // 도구 판정: 조련 태그
    if (func.includes('조련')) {
      usages.push('tool');
    }
    // 소재 판정: 촉매/마력촉매 or 재료성질만
    if (func.some(f => ['촉매','마력촉매','경도','가공성','전도','보존'].includes(f))) {
      usages.push('material');
    }

    return usages.length > 0 ? [...new Set(usages)] : ['material'];
  }

  // 기능축: 기능 태그에서 도출 (복수 가능)
  determineFunctions(tags) {
    const func = tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : []);
    const functionMap = {
      '공격': 'attack', '수호': 'defense', '회복': 'heal', '독성': 'poison',
      '억제': 'debuff', '분산': 'aoe', '조련': 'training', '부여': 'enchant',
      '촉매': 'catalyst', '마력촉매': 'magic_catalyst'
    };
    const result = [];
    for (const f of func) {
      if (functionMap[f]) result.push(functionMap[f]);
    }
    return result.length > 0 ? [...new Set(result)] : ['material'];
  }

  // 레거시 호환: 단일 카테고리 문자열 반환
  determineCategory(tags) {
    const usages = this.determineUsages(tags);
    const functions = this.determineFunctions(tags);
    // 레거시 매핑
    if (usages.includes('equipment') && functions.includes('attack')) return 'equipment_weapon';
    if (usages.includes('equipment') && functions.includes('defense')) return 'equipment_armor';
    if (usages.includes('equipment') && functions.includes('enchant')) return 'equipment_accessory';
    if (usages.includes('tool') && functions.includes('training')) return 'tool_training';
    if (usages.includes('consumable') && functions.includes('heal')) {
      const func = tags.functions || (tags.function ? [tags.function] : []);
      if (func.includes('보존')) return 'consumable_food';
      return 'consumable_potion';
    }
    if (usages.includes('consumable') && functions.includes('poison')) return 'consumable_attack';
    if (usages.includes('consumable') && functions.includes('debuff')) return 'consumable_debuff';
    return 'material_refined';
  }

  // ═══ 이름 생성 (중복 수정) ═══

  generateName(tags) {
    const parts = [];

    // Element prefix (중복 제거)
    const elements = [...new Set(tags.elements || (tags.element ? [tags.element] : []))].filter(Boolean);
    for (const el of elements) {
      if (this.elementPrefixes[el]) parts.push(this.elementPrefixes[el]);
    }

    // Material property adjective (중복 제거)
    const funcs = [...new Set(tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : []))];
    const addedProps = new Set();
    for (const f of funcs) {
      if (this.materialPropertyNames[f] && !addedProps.has(this.materialPropertyNames[f])) {
        parts.push(this.materialPropertyNames[f]);
        addedProps.add(this.materialPropertyNames[f]);
      }
    }

    // Function keyword (첫 번째만)
    for (const f of funcs) {
      if (this.functionNames[f]) {
        parts.push(this.functionNames[f]);
        break;
      }
    }

    // Form suffix (첫 번째만)
    const forms = [...new Set(tags.forms || (tags.form ? [tags.form] : []))].filter(Boolean);
    const primaryForm = forms[0];
    if (primaryForm && this.formSuffixes[primaryForm]) {
      const lastPart = parts[parts.length - 1] || '';
      parts[parts.length - 1] = lastPart + this.formSuffixes[primaryForm];
    }

    return parts.join(' ') || '알 수 없는 물체';
  }

  generateLore(tags) {
    const elements = tags.elements || [];
    if (elements.includes('식')) return '기이한 마력이 깃든 물건이다.';
    if (elements.includes('열')) return '미약한 열기가 느껴진다.';
    if (elements.includes('동')) return '미세하게 진동하고 있다.';
    return '연금술로 만들어진 물건이다.';
  }

  // ═══ 효과 생성 (복수 기능 대응) ═══

  generateEffect(tags, tier) {
    const funcs = tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : []);
    const baseValue = 10 + tier * 8;
    const effects = [];

    // 각 기능 태그에서 효과 추출
    if (funcs.includes('회복')) effects.push({ type: 'heal', value: baseValue, desc: `HP ${baseValue} 회복` });
    if (funcs.includes('독성')) effects.push({ type: 'damage', value: baseValue, element: '식', desc: `${baseValue} 독 데미지` });
    if (funcs.includes('공격')) effects.push({ type: 'atkUp', value: Math.floor(baseValue * 0.5), desc: `공격 +${Math.floor(baseValue * 0.5)}` });
    if (funcs.includes('수호')) effects.push({ type: 'defUp', value: Math.floor(baseValue * 0.5), desc: `방어 +${Math.floor(baseValue * 0.5)}` });
    if (funcs.includes('부여')) effects.push({ type: 'buff', value: Math.floor(baseValue * 0.3), desc: `스탯 +${Math.floor(baseValue * 0.3)}` });
    if (funcs.includes('조련')) effects.push({ type: 'training', value: baseValue, desc: `조교 도구 (효율 ${baseValue})` });
    if (funcs.includes('억제')) effects.push({ type: 'debuff', value: baseValue, desc: `디버프 (${baseValue})` });

    if (effects.length === 0) return { type: 'material', value: 0, desc: '조합 재료' };
    if (effects.length === 1) return effects[0];

    // 복합 효과: 첫 번째를 주 효과로, 나머지를 desc에 병합
    const primary = effects[0];
    primary.desc = effects.map(e => e.desc).join(' + ');
    primary.subEffects = effects.slice(1);
    return primary;
  }

  // Get all craftable combinations for display
  getKnownRecipes() {
    return this.engine.data.recipes || [];
  }

  // Check if player has materials for a recipe
  canCraftRecipe(recipe) {
    for (const matId of recipe.materials) {
      if (!this.engine.hasMaterial(matId)) return false;
    }
    return true;
  }

  // Craft a specific recipe
  craftRecipe(recipeId) {
    const recipe = (this.engine.data.recipes || []).find(r => r.id === recipeId);
    if (!recipe) return { success: false, reason: '레시피를 찾을 수 없습니다.' };

    // Check materials
    for (const matId of recipe.materials) {
      if (!this.engine.hasMaterial(matId)) {
        return { success: false, reason: `${this.engine.getMaterialName(matId)}이(가) 부족합니다.` };
      }
    }

    if (!this.engine.useStamina(2)) {
      return { success: false, reason: '스태미나가 부족합니다.' };
    }

    // Consume materials
    for (const matId of recipe.materials) {
      this.engine.removeMaterial(matId, 1);
    }

    // Create result
    let result = this.engine.data.materials.find(m => m.id === recipe.resultId);
    if (!result) {
      result = {
        id: recipe.resultId,
        name: recipe.name,
        tier: recipe.tier || 1,
        tags: recipe.resultTags || {},
        category: recipe.category,
        effect: recipe.effect,
        lore: recipe.lore
      };
      this.engine.data.materials.push(result);
    }

    this.engine.addMaterial(recipe.resultId, 1);
    return { success: true, result };
  }
}

module.exports = CraftingSystem;
