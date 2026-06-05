'use strict';

/**
 * traitEffects.js — 트레잇 effects/bridges/condition DSL 파서 + 어휘
 *
 * 인코딩 규약 (design/traits_authoring_sample.csv, trait_data_spec.md):
 *   effects  : "domain|target|op|value[|when:cond]"   항목 구분 " ; "
 *   bridges  : "type|...args[|key:val]"               자동전투 훅
 *   condition: "stat:cmp:value"
 *
 * 설계 원칙: 파서는 "구조화"만 한다(해석은 리졸버). 어휘는 데이터로 분리 →
 *   새 op/target/bridge 종류 = 아래 상수 한 줄 추가로 확장. 콘텐츠는 CSV 행만 늘림.
 */

// ── 어휘 (확장 지점) ─────────────────────────────────────────────
const OPS = ['gainMult', 'add', 'mult', 'set', 'cap', 'thresholdMult', 'immune', 'unlock', 'gate'];
const DOMAINS = ['조교', '관계', '생활', '탐사'];
const BRIDGE_TYPES = ['override', 'stat', 'weight', 'target', 'special'];
const TARGET_RULES = ['lowHp', 'weakpoint', 'threat', 'random', 'protectMaster'];
const CMP_MAP = { lt: '<', lte: '<=', gt: '>', gte: '>=', eq: '=', has: 'has', is: 'is' };

// ── 유틸 ────────────────────────────────────────────────────────
function num(v) {
  if (v === undefined || v === null || v === '') return null;
  return isNaN(v) ? v : Number(v);
}
function splitItems(cell) {
  return String(cell || '').split(';').map(s => s.trim()).filter(Boolean);
}
function splitFields(item) {
  return String(item).split('|').map(s => s.trim());
}
// 후행 "key:val" 필드들을 객체로 (when:, scaleBy: 등). when 은 condition 파싱.
function parseModifiers(fields, target) {
  for (const f of fields) {
    const i = f.indexOf(':');
    if (i < 0) continue;
    const key = f.slice(0, i);
    const val = f.slice(i + 1);
    target[key] = (key === 'when') ? parseCondition(val) : num(val) ?? val;
  }
  return target;
}

// ── condition ───────────────────────────────────────────────────
function parseCondition(s) {
  if (!s) return null;
  const parts = String(s).split(':');
  const stat = parts[0];
  const cmp = CMP_MAP[parts[1]] || parts[1] || null;
  const value = num(parts.slice(2).join(':'));
  const cond = { stat };
  if (cmp) cond.cmp = cmp;
  if (value !== null) cond.value = value;
  return cond;
}

// ── effects ─────────────────────────────────────────────────────
function parseEffect(item) {
  const f = splitFields(item);
  const eff = { domain: f[0], target: f[1], op: f[2], value: num(f[3]) };
  parseModifiers(f.slice(4), eff); // when: 등
  if (!OPS.includes(eff.op)) eff._unknownOp = true;
  return eff;
}
function parseEffects(cell) {
  return splitItems(cell).map(parseEffect);
}

// ── bridges (자동전투 훅) ────────────────────────────────────────
function parseBridge(item) {
  const f = splitFields(item);
  const type = f[0];
  const b = { type };
  switch (type) {
    case 'stat':    // stat|<stat>|<op>|<value>[|when:..|scaleBy:..]
      b.stat = f[1]; b.op = f[2]; b.value = num(f[3]); parseModifiers(f.slice(4), b); break;
    case 'weight':  // weight|<action>|<delta>
      b.action = f[1]; b.delta = num(f[2]); break;
    case 'target':  // target|<rule>
      b.rule = f[1]; if (!TARGET_RULES.includes(b.rule)) b._unknownRule = true; break;
    case 'special': // special|<effect>|<value>
      b.effect = f[1]; b.value = num(f[2]); break;
    case 'override': { // override|<when|always>|<action:weight ...>
      const whenTok = f[1];
      b.when = (!whenTok || whenTok === 'always') ? 'always' : parseCondition(whenTok);
      b.force = {};
      for (const tok of f.slice(2)) {
        const i = tok.indexOf(':');
        if (i > 0) b.force[tok.slice(0, i)] = num(tok.slice(i + 1));
        else if (tok.startsWith('immune')) { b.immune = b.immune || []; } // "immune:공포" 형태도 허용
      }
      break;
    }
    default:
      b._unknownType = true;
  }
  return b;
}
function parseBridges(cell) {
  return splitItems(cell).map(parseBridge);
}

// ── 트레잇 행(객체) 정규화: effects/bridges 문자열 → 구조 ──────────
function normalizeTrait(row) {
  const t = Object.assign({}, row);
  t.effects = parseEffects(row.effects);
  t.bridges = parseBridges(row.bridges);
  if (row.contraPair) t.contraPair = row.contraPair;
  return t;
}

module.exports = {
  OPS, DOMAINS, BRIDGE_TYPES, TARGET_RULES, CMP_MAP,
  parseCondition, parseEffect, parseEffects,
  parseBridge, parseBridges, normalizeTrait,
};
