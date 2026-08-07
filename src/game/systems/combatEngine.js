'use strict';

/**
 * combatEngine.js — 자동전투 AI 결정 (spec §6).
 *   ① 조건부 오버라이드 → ② 행동 유형 가중 추첨(성격+다리) → ③ AP 스킬(역가 우선) → ④ 타겟 가중 추첨(敵対心×성격보정).
 *   수치 보정 = 장비 base + 역가(+5%/Lv) + bridge stat.
 */
const R = require('../balance/traitResolver');

const ACTIONS = ['공격', '방어', '회피', '스킬'];
const BASE_WEIGHTS = { 공격: 0.4, 방어: 0.2, 회피: 0.2, 스킬: 0.2 };
const OVERRIDE_PRIORITY = { 변용종착: 3, 합성성격: 2, 성격: 1 }; // 높을수록 우선

// 가중 추첨
function weightedPick(weights, rng) {
  const keys = Object.keys(weights).filter(k => weights[k] > 0);
  const sum = keys.reduce((a, k) => a + weights[k], 0);
  if (sum <= 0) return keys[0] || null;
  let r = (rng || Math.random)() * sum;
  for (const k of keys) { r -= weights[k]; if (r <= 0) return k; }
  return keys[keys.length - 1];
}
function weightedIndex(arr, rng) {
  const sum = arr.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  let r = (rng || Math.random)() * sum;
  for (let i = 0; i < arr.length; i++) { r -= arr[i]; if (r <= 0) return i; }
  return arr.length - 1;
}

// 유효 스탯: 장비 base + 역가 보정 + bridge stat
function effectiveStats(unit, ctx, bridges) {
  const eq = unit.장비 || {};
  const s = {
    ATK: eq.ATK || 10, DEF: eq.DEF || 10, 속도: eq.속도 || 10,
    회피: 0, 敵対心: unit.敵対心base || 1,
  };
  // 역가 공격/방어 숙련 평균 → +5%/Lv (간이; 실제론 행동 속성별)
  const atkLv = avg(unit.역가 && unit.역가.공격숙련);
  s.ATK *= (1 + atkLv * 0.05);
  // bridge stat 적용
  for (const stat in bridges.stats) {
    const mod = bridges.stats[stat];
    let base = s[stat] != null ? s[stat] : 0;
    // 베이스 불가침(2026-07-17): ATK/DEF/속도/HP는 배율 보정만 — scaleBy도 분수 배율로
    if (mod.scaleBy === 'missingHpPct') base *= (1 + (mod.add || mod.value || 0) * (1 - (unit.hpPct != null ? unit.hpPct : 1)));
    else if (mod.op === 'mult') base *= (mod.value != null ? mod.value : 1);
    else base += (mod.value || mod.add || 0); // add=분수 풀 전용(회피·敵対心 등)
    s[stat] = base;
  }
  return s;
}
function avg(o) { if (!o) return 0; const v = Object.values(o); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }

// 행동 유형 결정
function chooseActionType(unit, ctx, rng) {
  const bridges = R.resolveBridges(unit.traits, ctx);
  // ① 오버라이드 (우선순위 최고 하나)
  const active = bridges.overrides.filter(o => R.evalCondition(o.when, ctx) && o.force);
  if (active.length) {
    active.sort((a, b) => (OVERRIDE_PRIORITY[b.priority] || 1) - (OVERRIDE_PRIORITY[a.priority] || 1));
    return { type: weightedPick(active[0].force, rng), forced: true, bridges };
  }
  // ② 가중 추첨 (base + 성격 다리)
  const w = Object.assign({}, BASE_WEIGHTS);
  for (const a in bridges.weights) w[a] = (w[a] || 0) + bridges.weights[a];
  for (const k in w) if (w[k] < 0) w[k] = 0;
  return { type: weightedPick(w, rng), forced: false, bridges };
}

// 타겟 결정: 피격가중 = 敵対心 × 성격보정
function targetRuleMult(rule, enemy, enemies) {
  switch (rule) {
    case 'lowHp':        return (enemy.hpPct != null && enemy.hpPct < 0.4) ? 2 : 1;
    case 'weakpoint':    return enemy.hasWeak ? 1.5 : 1;
    case 'threat':       return enemy.threat ? 1 + 0.5 * enemy.threat : 1;
    case 'protectMaster':return enemy.targetingAlly ? 2 : 1;
    default: return 1;
  }
}
function chooseTarget(actorBridges, enemies, rng) {
  const rules = actorBridges.targets || [];
  const weights = enemies.map(e => {
    let w = (e.敵対心 != null ? e.敵対心 : 1);
    for (const rule of rules) w *= targetRuleMult(rule, e, enemies);
    return w;
  });
  return weightedIndex(weights, rng);
}

// 비율식 데미지
function damage(atk, def, mult) {
  return atk * (atk / (atk + def)) * (mult || 1);
}

module.exports = {
  ACTIONS, BASE_WEIGHTS, weightedPick, weightedIndex,
  effectiveStats, chooseActionType, chooseTarget, targetRuleMult, damage,
};
