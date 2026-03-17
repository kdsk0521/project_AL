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
    const tags = { ...mat.tags };
    let newFunction = tags.function;
    let newForm = tags.form;
    let newElement = tags.element;

    if (equipmentId === 'furnace') {
      // 가마: 열 주입 (기능 변환) + 광 해방 (원소 제거)
      const furnaceMap = {
        '회복': '보존', '촉매': '억제', '경도': '공격',
        '독성': '가공성', '전도': '수호', '가공성': '가공성'
      };
      if (furnaceMap[newFunction]) newFunction = furnaceMap[newFunction];
      if (tags.form === '액체') newForm = '기체';
      if (newElement === '광') newElement = null;
    } else if (equipmentId === 'crusher') {
      // 분쇄기: 위 해방 (형태→분말) + 식 해방 (원소 제거)
      newForm = '분말';
      if (newElement === '식') newElement = null;
    } else if (equipmentId === 'compressor') {
      // 압축기: 위 주입 (기능 변환) + 동 해방 (원소 제거)
      const compressMap = {
        '회복': '수호', '촉매': '부여', '독성': '조련',
        '전도': '보존', '가공성': '전도', '경도': '경도'
      };
      if (compressMap[newFunction]) newFunction = compressMap[newFunction];
      newForm = '결정';
      if (newElement === '동') newElement = null;
    }

    const resultId = `PROC_${mat.id}_${equipmentId}`;
    const resultName = this.generateName({ function: newFunction, element: newElement, form: newForm });

    // Register as a material if not already exists
    const existing = this.engine.data.materials.find(m => m.id === resultId);
    if (!existing) {
      this.engine.data.materials.push({
        id: resultId,
        name: resultName,
        tier: mat.tier,
        tags: { function: newFunction, element: newElement, form: newForm },
        source: `가공(${mat.name})`,
        lore: `${mat.name}을(를) 가공한 결과물.`
      });
    }

    return {
      id: resultId,
      name: resultName,
      tags: { function: newFunction, element: newElement, form: newForm },
      tier: mat.tier
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
    const allKeys = new Set([...Object.keys(tagsA), ...Object.keys(tagsB)]);

    for (const key of allKeys) {
      const valA = tagsA[key];
      const valB = tagsB[key];

      if (key === 'function') {
        // Collect all function tags
        merged.functions = [];
        if (valA) merged.functions.push(valA);
        if (valB && valB !== valA) merged.functions.push(valB);
        merged[key] = valA || valB;
      } else if (key === 'element') {
        merged.elements = [];
        if (valA) merged.elements.push(valA);
        if (valB && valB !== valA) merged.elements.push(valB);
        merged[key] = valA || valB;
      } else if (key === 'form') {
        merged.forms = [];
        if (valA) merged.forms.push(valA);
        if (valB && valB !== valA) merged.forms.push(valB);
        merged[key] = valA || valB;
      } else {
        merged[key] = valA || valB;
      }
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
    const tier = Math.floor((matA.tier + matB.tier) / 2) + (this.countDuplicates(matA.tags, matB.tags) > 0 ? 1 : 0);
    const name = this.generateName(combinedTags);
    const category = this.determineCategory(combinedTags);
    const id = `CRAFT_${matA.id}_${matB.id}_${Date.now()}`;

    const item = {
      id,
      name,
      tier: Math.min(tier, 4),
      tags: combinedTags,
      category,
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

  determineCategory(tags) {
    const func = tags.functions || [tags.function];
    const form = tags.forms || [tags.form];

    if (func.includes('회복') && (form.includes('액체') || form.includes('식물'))) return 'consumable_potion';
    if (func.includes('회복') && func.includes('보존')) return 'consumable_food';
    if (func.includes('독성') || func.includes('분산')) return 'consumable_attack';
    if (func.includes('공격') && (form.includes('광물') || form.includes('유기'))) return 'equipment_weapon';
    if (func.includes('수호') && form.includes('광물')) return 'equipment_armor';
    if (func.includes('부여')) return 'equipment_accessory';
    if (func.includes('조련')) return 'tool_training';
    if (func.includes('촉매') || func.includes('마력촉매')) return 'material_refined';
    if (func.includes('억제')) return 'consumable_debuff';
    return 'material_refined';
  }

  generateName(tags) {
    const parts = [];

    // Element prefix
    const elements = tags.elements || (tags.element ? [tags.element] : []);
    for (const el of elements) {
      if (el && this.elementPrefixes[el]) parts.push(this.elementPrefixes[el]);
    }

    // Material property adjective
    const funcs = tags.functions || [tags.function];
    for (const f of funcs) {
      if (this.materialPropertyNames[f]) parts.push(this.materialPropertyNames[f]);
    }

    // Function keyword
    for (const f of funcs) {
      if (this.functionNames[f]) {
        parts.push(this.functionNames[f]);
        break;
      }
    }

    // Form suffix
    const forms = tags.forms || [tags.form];
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

  generateEffect(tags, tier) {
    const funcs = tags.functions || [tags.function];
    const baseValue = 10 + tier * 8;

    if (funcs.includes('회복')) return { type: 'heal', value: baseValue, desc: `HP ${baseValue} 회복` };
    if (funcs.includes('독성')) return { type: 'damage', value: baseValue, element: '식', desc: `적에게 ${baseValue} 독 데미지` };
    if (funcs.includes('공격')) return { type: 'atkUp', value: Math.floor(baseValue * 0.5), desc: `물리공격 +${Math.floor(baseValue * 0.5)}` };
    if (funcs.includes('수호')) return { type: 'defUp', value: Math.floor(baseValue * 0.5), desc: `물리방어 +${Math.floor(baseValue * 0.5)}` };
    if (funcs.includes('부여')) return { type: 'buff', value: Math.floor(baseValue * 0.3), desc: `스탯 +${Math.floor(baseValue * 0.3)}` };
    if (funcs.includes('조련')) return { type: 'training', value: baseValue, desc: `육성 도구 (효율 ${baseValue})` };
    if (funcs.includes('억제')) return { type: 'debuff', value: baseValue, desc: `적 디버프 (${baseValue})` };
    return { type: 'material', value: 0, desc: '조합 재료' };
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
