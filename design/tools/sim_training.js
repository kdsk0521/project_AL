'use strict';
// 조교 페이스 시뮬 — 실엔진 몬테카를로 (밸런싱 패스 2026-08-07)
// 앵커 대조: A1 절정 ~4행위 / A2 변용 도 2/5/9/14 / A5 글로벌 포화 ~7절정
const path = require('path');
const G = (p) => require(path.join(__dirname, '..', '..', 'src', 'game', p));
const Engine = G('engine.js');
const TrainingSystem = G('systems/training.js');

const N = 100, MAX_ACTS = 300;
const e = new Engine(); e.newGame();
const ts = new TrainingSystem(e);

// 정책: 사용 가능한 행위 중 로테이션 (반복 페널티 회피 — 플레이어 행동 모사)
function pickAction(unit, style) {
  const avail = ts.getAvailableActions(unit).filter(a => !a.locked && !a.requiresTool);
  if (!avail.length) return null;
  const sorted = avail.sort((a, b) => (b.intensity || 0) - (a.intensity || 0));
  let pool;
  if (style === 'dominant') pool = avail.filter(a => [25, 26, 28, 29].includes(a.id)); // 전용 행위 집중 (예속 노림)
  else if (style === 'mixed') pool = [...avail.filter(a => [25, 26].includes(a.id)), ...sorted.filter(a => a.id <= 24).slice(0, 1)]; // 구속+고강도 일반 혼합 (누출 검증)
  else pool = style === 'gentle' ? sorted.slice(-6) : sorted.filter(a => a.id <= 24).slice(0, 3);
  if (!pool.length) pool = style === 'dominant' ? sorted.slice(-3) : sorted.slice(0, 3); // 예속 노림은 저강도 워밍업
  unit._simIdx = ((unit._simIdx || 0) + 1) % pool.length;
  return pool[unit._simIdx].id;
}

function run(style, affection) {
  const out = { firstClimax: null, climaxActs: [], 도달: {}, 글로벌포화절정: null, 역가5행위: null, route: null, v1절정: 0 };
  const unit = e.createUnitInstance(e.data.units[0]);
  if (String(style).endsWith('_n')) { unit.unitId = '_neutral'; style = style.slice(0, -2); } // 중립 검체(종 특성 차단)
  unit.affection = affection;
  let climaxes = 0;
  for (let act = 1; act <= MAX_ACTS; act++) {
    const aid = pickAction(unit, style);
    if (aid == null) break;
    const before = unit.detailedExp ? unit.detailedExp.orgasm : 0;
    ts.execute(unit, aid);
    if (unit.detailedExp && unit.detailedExp.orgasm > before) out.v1절정++;
    const c = unit._lastChimyeom;
    if (c && c.절정) {
      climaxes++;
      out.climaxActs.push(act);
      if (!out.firstClimax) out.firstClimax = act;
      if (c.변용 && !out.도달[c.변용.도]) { out.도달[c.변용.도] = { act, climaxes }; out.route = c.변용.route; }
    }
    const gs = unit.globalState || {};
    if (out.글로벌포화절정 == null && Math.max(gs.lewdness||0, gs.love||0, gs.submission||0) >= 90) out.글로벌포화절정 = climaxes;
    const sk = unit.역가 && unit.역가.숙련 ? Math.max(0, ...Object.values(unit.역가.숙련)) : 0;
    if (out.역가5행위 == null && sk >= 5) out.역가5행위 = act;
  }
  out.총절정 = climaxes;
  out.잠금 = unit.변용잠금 || null;
  out.최종숙련 = unit.역가 && unit.역가.숙련 ? Math.max(0, ...Object.values(unit.역가.숙련)) : 0;
  out.최종내성 = unit.역가 && unit.역가.내성 ? Math.max(0, ...Object.values(unit.역가.내성)) : 0;
  return out;
}

function pct(arr, p) { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
function stat(name, arr) {
  const v = arr.filter(x => x != null);
  if (!v.length) return `${name}: 미도달`;
  return `${name}: 중앙 ${pct(v,0.5)} (p10 ${pct(v,0.1)} / p90 ${pct(v,0.9)}, 도달 ${v.length}/${arr.length})`;
}

e.state.inventory['ITEM_RESTRAINT'] = 1; e.state.inventory['ITEM_WHIP'] = 1; // 전용 아이템 지급 (예속 시나리오)
for (const [style, aff] of [['dominant_n', 30], ['dominant_n', 50], ['dominant_n', 60], ['dominant_n', 70], ['dominant_n', 90], ['mixed_n', 30], ['active', 90], ['gentle', 90], ['active', 30], ['gentle', 30], ['gentle', 10]]) {
  const runs = []; for (let i = 0; i < N; i++) runs.push(run(style, aff));
  console.log(`\n═══ 정책=${style} 호감도=${aff} (N=${N}, 최대 ${MAX_ACTS}행위) ═══`);
  console.log(stat('첫 절정(행위)', runs.map(r => r.firstClimax)));
  // 절정 간격: 전반(1~5번째) vs 후반(내성 오른 뒤)
  const early = [], late = [];
  for (const r of runs) for (let i = 1; i < r.climaxActs.length; i++) {
    (i <= 5 ? early : late).push(r.climaxActs[i] - r.climaxActs[i-1]);
  }
  if (early.length) console.log(stat('절정 간격·전반(행위)', early));
  if (late.length) console.log(stat('절정 간격·후반(행위)', late));
  for (const 도 of [1, 2, 3, 4]) console.log(stat(`변용 도${도} 도달(행위)`, runs.map(r => r.도달[도] && r.도달[도].act)));
  console.log(stat('글로벌 90+ 도달(절정 수)', runs.map(r => r.글로벌포화절정)));
  console.log(stat('역가 숙련 Lv5(행위)', runs.map(r => r.역가5행위)));
  console.log(stat('300행위 총절정', runs.map(r => r.총절정)));
  console.log(stat('최종 내성Lv', runs.map(r => r.최종내성)));
  const lockDist = {};
  for (const r of runs) lockDist[r.잠금 || '없음'] = (lockDist[r.잠금 || '없음'] || 0) + 1;
  console.log('v1 표층절정 평균:', (runs.reduce((a, r) => a + r.v1절정, 0) / N).toFixed(1),
    '/ 잠금 루트 분포:', JSON.stringify(lockDist));
}
