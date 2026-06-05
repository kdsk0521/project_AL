'use strict';

/**
 * trainingEngine.js — 조교 1회 행위 해결 → 쾌감/절정/글로벌5/침염/변용.
 * spec §4(조교 엔진) §5(변용), trait_balancing §3.6 수치(잠정).
 * 리졸버(traitResolver)를 통해 트레잇 effects를 적용.
 */
const R = require('../balance/traitResolver');

const GLOBALS = ['연모', '복종', '음란', '공포', '반감'];
const PARTS = ['입', '가슴', 'V', 'C', '애널', '피부'];

// 침염 종류 → 변용 루트
const ROUTE_OF = { 연모: '애착', 복종: '예속', 음란: '탐닉', 공포: '붕괴', 반감: '붕괴', 고통: '붕괴' };
const 침염임계 = [2, 5, 9, 14];           // 도 1~4 누적 침염
const 도구출력_기본 = 30;                  // 잠정
const 절정_지배보너스 = 15, 절정_보조보너스 = 5;

// 결 → 글로벌5 raw 상승 (잠정, 콘텐츠에서 조정 가능)
const GAINS_BY_KEY = {
  consensual: { 음란: 10, 복종: 5, 연모: 3 },
  affection:  { 연모: 10, 복종: 5 },
  forceful:   { 공포: 10, 반감: 8, 복종: 3 },
  pain:       { 공포: 8, 반감: 5, 고통: 10 },
};

// 호감도(0~100) → 단계 인덱스 (0경계 1인지 2친밀 3신뢰 4유대 5헌신)
function 호감단계(v) {
  if (v >= 90) return 5; if (v >= 75) return 4; if (v >= 55) return 3;
  if (v >= 35) return 2; if (v >= 15) return 1; return 0;
}
const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
const maxVal = obj => Math.max(0, ...Object.values(obj || {}));

// 조건 평가용 맥락
function buildCtx(unit) {
  return {
    hpPct: unit.hpPct != null ? unit.hpPct : 1,
    성향: unit.성향 || null,
    동석: unit.동석 || [],
    호감도단계: 호감단계(unit.호감도 || 0),
  };
}

// 변용 도 보조조건(coReq) 충족 여부 — 다음 도(targetDo)로 갈 수 있나
function coReqMet(unit, route, targetDo) {
  switch (route) {
    case '애착': return 호감단계(unit.호감도 || 0) >= [0, 0, 2, 3, 4][targetDo]; // 도2친밀/도3신뢰/도4유대
    case '예속': return maxVal(unit.역가.숙련) >= [0, 0, 2, 3, 4][targetDo];
    case '탐닉': return maxVal(unit.감도) >= [0, 0, 40, 60, 80][targetDo];
    case '붕괴': return true; // 보조 없음
    default: return true;
  }
}
function routeChimyeom(unit, route) {
  const c = unit.침염 || {};
  if (route === '붕괴') return (c.공포 || 0) + (c.반감 || 0) + (c.고통 || 0);
  const t = { 애착: '연모', 예속: '복종', 탐닉: '음란' }[route];
  return c[t] || 0;
}

// 침염 1개 찍힌 뒤 변용 도 진행 시도
function advanceVariation(unit, route) {
  unit.변용도 = unit.변용도 || {};
  if (unit.변용잠금 && unit.변용잠금 !== route) return null; // 수렴 잠금
  let 도 = unit.변용도[route] || 0;
  if (도 >= 4) return null;
  const total = routeChimyeom(unit, route);
  const next = 도 + 1;
  if (total >= 침염임계[next - 1] && coReqMet(unit, route, next)) {
    unit.변용도[route] = next;
    if (next >= 2 && !unit.변용잠금) unit.변용잠금 = route; // 도2 수렴 잠금
    return { route, 도: next, 종착: next === 4 };
  }
  return null;
}

// ── 조교 1회 행위 ───────────────────────────────────────────────
// action: { 부위, 결('consensual'|'affection'|'forceful'|'pain'), 도구출력?, gains? }
function performAction(unit, action) {
  unit.session = unit.session || { pleasure: 0, gain: {} };
  unit.침염 = unit.침염 || {};
  const ctx = buildCtx(unit);
  const eff = R.resolveEffects(unit.traits, ctx);
  const P = action.부위;

  // 쾌감 = 도구출력 × (감도/100) × (1+숙련×0.1)  [감도엔 effect gainRate 반영]
  const 감도 = clamp(0, 100, R.applyValue(unit.감도[P] || 0, eff, '감도.' + P));
  const 숙련 = (unit.역가.숙련[P] || 0);
  const 쾌감 = (action.도구출력 || 도구출력_기본) * (감도 / 100) * (1 + 숙련 * 0.1);
  unit.session.pleasure += 쾌감;

  // 글로벌5 변동 (raw × gainRate, 0~100 clamp)
  const gains = action.gains || GAINS_BY_KEY[action.결] || {};
  for (const g of Object.keys(gains)) {
    const rate = R.gainRate(eff, 'global.' + g);
    const delta = gains[g] * rate;
    if (g === '고통') { unit.고통 = (unit.고통 || 0) + delta; }
    else unit.글로벌[g] = clamp(0, 100, (unit.글로벌[g] || 0) + delta);
    unit.session.gain[g] = (unit.session.gain[g] || 0) + delta;
  }

  const out = { 쾌감, 절정: false, 침염: null, 변용: null };

  // 절정: 누적 ≥ 임계(100 + 내성×20)
  const 내성 = (unit.역가.내성[P] || 0);
  const 절정임계 = (100 + 내성 * 20) * R.gainRate(eff, '절정임계'); // thresholdMult 여지
  if (unit.session.pleasure >= 절정임계) {
    out.절정 = true;
    unit.session.pleasure = 0;
    // 침염: 이번 세션 가장 강하게 오른 글로벌(또는 고통) 종류 +1
    const sg = unit.session.gain;
    const type = Object.keys(sg).sort((a, b) => sg[b] - sg[a])[0];
    if (type) {
      unit.침염[type] = (unit.침염[type] || 0) + 1;
      out.침염 = type;
      out.변용 = advanceVariation(unit, ROUTE_OF[type] || '붕괴');
    }
    unit.session.gain = {};
    // 역가 성장(받는 부위 숙련/내성 +경험) — 레벨업 곡선은 별도, 여기선 경험 누적 훅만
    unit._역가경험 = unit._역가경험 || {};
    unit._역가경험[P] = (unit._역가경험[P] || 0) + 1;
  }
  return out;
}

module.exports = {
  GLOBALS, PARTS, ROUTE_OF, 침염임계, GAINS_BY_KEY,
  호감단계, coReqMet, routeChimyeom, advanceVariation, performAction, buildCtx,
};
