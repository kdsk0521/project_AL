'use strict';

/**
 * traitResolver.js — 파싱된 트레잇 effects/bridges를 유닛 상태·맥락에 적용.
 *
 * 설계: op/bridge 핸들러 = 디스패치 테이블(확장 = 핸들러 한 줄 추가).
 *   - resolveEffects(traits, ctx) → { target: {gainMult, add, mult, set, cap, immune, unlock, gate} }
 *   - resolveBridges(traits, ctx) → { overrides, weights, stats, targets, specials }
 *   시스템(조교/전투)은 이 집계 결과를 질의해서 쓴다.
 */

// ── condition 평가 (ctx = 유닛 상태/맥락 맵) ──────────────────────
function evalCondition(cond, ctx) {
  if (!cond || cond === 'always') return true;
  ctx = ctx || {};
  const lhs = ctx[cond.stat];
  switch (cond.cmp) {
    case '<':  return lhs <  cond.value;
    case '<=': return lhs <= cond.value;
    case '>':  return lhs >  cond.value;
    case '>=': return lhs >= cond.value;
    case '=':  return lhs == cond.value;
    case 'is': return lhs === cond.value;
    case 'has': return Array.isArray(lhs) ? lhs.includes(cond.value) : !!lhs;
    default:   return !!lhs;
  }
}

// ── effect op 핸들러 (확장 지점) ─────────────────────────────────
const OP_HANDLERS = {
  gainMult:      (m, v) => { m.gainMult = (m.gainMult == null ? 1 : m.gainMult) * v; },
  mult:          (m, v) => { m.mult = (m.mult == null ? 1 : m.mult) * v; },
  add:           (m, v) => { m.add = (m.add == null ? 0 : m.add) + (v || 0); },
  cap:           (m, v) => { m.cap = (m.cap == null ? 0 : m.cap) + (v || 0); },
  thresholdMult: (m, v) => { m.thresholdMult = (m.thresholdMult == null ? 1 : m.thresholdMult) * v; },
  set:           (m, v) => { m.set = v; },
  immune:        (m)    => { m.immune = true; },
  unlock:        (m)    => { m.unlock = true; },
  gate:          (m, v) => { m.gate = v; },
};

function resolveEffects(traits, ctx) {
  const mods = {};
  for (const t of traits || []) {
    for (const e of t.effects || []) {
      if (e.when && !evalCondition(e.when, ctx)) continue;
      const m = mods[e.target] || (mods[e.target] = {});
      const h = OP_HANDLERS[e.op];
      if (h) h(m, e.value); else m._unknown = e.op;
    }
  }
  return mods;
}

// ── 값 계산 헬퍼 ────────────────────────────────────────────────
function gainRate(mods, target) {      // 상승량 배율 (없으면 1)
  const m = mods[target];
  return m && m.gainMult != null ? m.gainMult : 1;
}
function applyValue(base, mods, target) { // base에 set/add/mult 적용
  const m = mods[target];
  if (!m) return base;
  let x = base;
  if (m.set != null) x = m.set;
  if (m.add) x += m.add;
  if (m.mult != null) x *= m.mult;
  return x;
}
function capDelta(mods, target) { return (mods[target] && mods[target].cap) || 0; }
function isImmune(mods, target) { return !!(mods[target] && mods[target].immune); }

// ── 전투 bridges 집계 ───────────────────────────────────────────
function resolveBridges(traits, ctx) {
  const out = { overrides: [], weights: {}, stats: {}, targets: [], specials: [] };
  for (const t of traits || []) {
    for (const b of t.bridges || []) {
      switch (b.type) {
        case 'override':
          out.overrides.push(b); break;
        case 'weight':
          out.weights[b.action] = (out.weights[b.action] || 0) + (b.delta || 0); break;
        case 'stat': {
          if (b.when && !evalCondition(b.when, ctx)) break;
          const s = out.stats[b.stat] || (out.stats[b.stat] = {});
          const h = OP_HANDLERS[b.op];
          if (h) h(s, b.value); else s._unknown = b.op;
          if (b.scaleBy) s.scaleBy = b.scaleBy;
          break;
        }
        case 'target':  out.targets.push(b.rule); break;
        case 'special': out.specials.push({ effect: b.effect, value: b.value }); break;
      }
    }
  }
  return out;
}

module.exports = {
  evalCondition, OP_HANDLERS,
  resolveEffects, resolveBridges,
  gainRate, applyValue, capDelta, isImmune,
};
