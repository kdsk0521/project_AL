'use strict';

/**
 * synthesisEngine.js — 트레잇 합성 + 모순쌍 발동 (spec §7).
 *   합성: 보유 트레잇 조합이 레시피 requiredTraits ⊆ 보유 → 결과 트레잇.
 *   모순쌍: 대립 두 극 공존(AT/PT/BT) → 통합형/분열형 합성.
 */

// 합성 레시피 로드 (data/traitSynthesis.json: {section:[{requiredTraits,resultTrait,...}]})
function loadSynthesisRecipes(synthJson) {
  const list = [];
  for (const sec of Object.keys(synthJson || {})) {
    for (const r of synthJson[sec]) {
      if (r && Array.isArray(r.requiredTraits)) list.push(r);
    }
  }
  return list;
}

// 모순쌍 로드 (balance/contradictionPairs.csv rows: {category,poleA,poleB,통합형,분열형})
function loadContradictions(rows) {
  return (rows || []).filter(r => r && r.poleA && r.poleB).map(r => ({
    category: r.category, poleA: r.poleA, poleB: r.poleB,
    integrate: r['통합형'], split: r['분열형'],
  }));
}

// 보유 트레잇(id 집합) → 발동 가능한 합성 결과
function checkSynthesis(ownedIds, recipes) {
  const owned = new Set(ownedIds);
  const out = [];
  for (const r of recipes) {
    if (r.requiredTraits.every(id => owned.has(id)) && !owned.has(r.resultTrait || r.id)) {
      out.push(r);
    }
  }
  return out;
}

// 보유 트레잇(이름 집합) → 공존하는 모순쌍 (통합/분열 후보)
function checkContradictions(ownedNames, pairs) {
  const owned = new Set(ownedNames);
  const out = [];
  for (const p of pairs) {
    if (owned.has(p.poleA) && owned.has(p.poleB)) {
      out.push({ pair: [p.poleA, p.poleB], category: p.category, integrate: p.integrate, split: p.split });
    }
  }
  return out;
}

module.exports = {
  loadSynthesisRecipes, loadContradictions, checkSynthesis, checkContradictions,
};
