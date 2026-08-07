'use strict';
/**
 * yeokga.js — 역가(力價) 레벨업 공용 모듈 (2026-08-07 통합 밸런싱 패스)
 * 사다리: 레벨 n→n+1 비용 = COSTS[n] 포인트 (0~5, 에라토호 지수비용 ×2.5 완화 — 앵커 A4)
 * 저장: unit.역가 = { <group>:{<key>:Lv}, _pts:{ "<group>.<key>": 누적포인트 } }
 * 그룹: 숙련/내성(부위6, 조교) · 공격숙련/방어숙련(속성7, 전투) · 지식(분야, 미배선)
 * 소비처 호환: 레벨은 기존 맵 그대로 숫자 — trainingEngine(내성), combatEngine(공격숙련 평균) 무수정.
 */
const COSTS = [3, 10, 25, 60, 150];
const MAX_LV = 5;

function ensure(unit) {
  if (!unit.역가) unit.역가 = {};
  if (!unit.역가._pts) unit.역가._pts = {};
  return unit.역가;
}

/** 포인트 획득 → 임계 도달 시 레벨업. mult=적성 가속(지식층 +20% 등). 레벨업 시 {group,key,level} 반환. */
function gain(unit, group, key, pts = 1, mult = 1) {
  const yk = ensure(unit);
  if (!yk[group]) yk[group] = {};
  const lv = yk[group][key] || 0;
  if (lv >= MAX_LV) return null;
  const pk = group + '.' + key;
  yk._pts[pk] = (yk._pts[pk] || 0) + pts * mult;
  if (yk._pts[pk] >= COSTS[lv]) {
    yk._pts[pk] -= COSTS[lv];
    yk[group][key] = lv + 1;
    return { group, key, level: lv + 1 };
  }
  return null;
}

module.exports = { COSTS, MAX_LV, gain, ensure };
