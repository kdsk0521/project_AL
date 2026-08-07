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

// 모순쌍 로드 v2 (CSV 값 = 트레잇 id, 이름은 레지스트리에서 복원 — 이름 매칭 오발동 차단)
function loadContradictions(rows, registry) {
  const reg = registry || [];
  const nameOf = (id) => { const t = reg.find(x => x.id === id); return t ? t.name : id; };
  return (rows || []).filter(r => r && r.poleA && r.poleB).map(r => ({
    category: r.category,
    poleAId: r.poleA, poleBId: r.poleB,
    poleA: nameOf(r.poleA), poleB: nameOf(r.poleB),
    integrateId: (r['통합형'] && r['통합형'] !== '-') ? r['통합형'] : null,
    splitId: r['분열형'],
    integrate: (r['통합형'] && r['통합형'] !== '-') ? nameOf(r['통합형']) : '-',
    split: nameOf(r['분열형']),
    splitWhen: r.splitWhen || null,
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

// 보유 트레잇(id 집합) → 공존하는 모순쌍 (통합/분열 후보). pair 필드 = 표시용 이름
function checkContradictions(ownedIds, pairs) {
  const owned = new Set(ownedIds);
  const out = [];
  for (const p of pairs) {
    if (owned.has(p.poleAId) && owned.has(p.poleBId)) {
      out.push({
        pair: [p.poleA, p.poleB], pairIds: [p.poleAId, p.poleBId], category: p.category,
        integrate: p.integrate, integrateId: p.integrateId,
        split: p.split, splitId: p.splitId, splitWhen: p.splitWhen || null,
      });
    }
  }
  return out;
}

// ── 모순쌍 발동 규칙 v1 (2026-07-17, 수치 잠정 — 정본 trait_contradiction_pairs.md) ──
//   ① 통합형 '-' → 항상 분열  ② 수은 주입 → 통합 강제(삼원질 레버)
//   ③ splitWhen(쌍별) 또는 기본조건 [붕괴도>=1 or 침염부정(공포+반감)>=3] 참 → 분열  ④ 그 외 → 통합
function _parseCond(str) {
  const f = String(str).split(':');
  const v = isNaN(f[2]) ? f[2] : Number(f[2]);
  return { stat: f[0], cmp: f[1], value: v };
}
function _evalCond(c, ctx) {
  const lhs = ctx[c.stat];
  switch (c.cmp) {
    case '<': return lhs < c.value; case '<=': return lhs <= c.value;
    case '>': return lhs > c.value; case '>=': return lhs >= c.value;
    case '=': return lhs == c.value; default: return false;
  }
}
function decideContradiction(contra, opts) {
  const { mercury, ctx } = opts || {};
  const c = ctx || {};
  const asSplit = { direction: 'split', resultId: contra.splitId, resultName: contra.split };
  const asInteg = { direction: 'integrate', resultId: contra.integrateId, resultName: contra.integrate };
  if (!contra.integrateId) return asSplit;
  if (mercury) return asInteg;
  const split = contra.splitWhen
    ? _evalCond(_parseCond(contra.splitWhen), c)
    : ((c.붕괴도 || 0) >= 1 || (c.침염부정 || 0) >= 3);
  return split ? asSplit : asInteg;
}

module.exports = {
  loadSynthesisRecipes, loadContradictions, checkSynthesis, checkContradictions, decideContradiction,
};
