'use strict';
// 전투 페이스 시뮬 — 층별 승률 곡선 (밸런싱 패스 2026-08-07)
// 파티 3 vs 층 조우(실제 dungeonMap encounter), 레벨 편차 -4/-2/0/+2
const path = require('path');
const G = (p) => require(path.join(__dirname, '..', '..', 'src', 'game', p));
const Engine = G('engine.js');
const CombatSystem = G('systems/combat.js');
const dmap = require(path.join(__dirname, '..', '..', 'src', 'game', 'data', 'dungeonMap.json'));

const e = new Engine(); e.newGame();
const cs = new CombatSystem(e);
const N = process.env.SIM_N ? +process.env.SIM_N : 150;

// 층별 조우 유닛 id 수집
function floorEncounters(f) {
  const fl = dmap.floors.find(x => x.floor === f);
  if (!fl) return [];
  const ids = new Set();
  for (const n of fl.nodes || []) for (const id of n.encounter || []) ids.add(id);
  return [...ids];
}

// 아군: 저레벨 종 3을 목표 레벨까지 성장(실제 성장 규칙 checkUnitLevelUp)
function makeAlly(defIdx, targetLv) {
  const def = e.data.units[defIdx];
  const u = e.createUnitInstance(def);
  while (u.level < targetLv) {
    u.exp.combat = u.level * 100; // 임계 충족
    if (!cs.checkUnitLevelUp(u)) break;
  }
  if (process.env.NOTRAIT) { u.traits = []; u.personalityTraits = []; } // 트레잇 기여 분리 측정용
  const g = process.env.GEAR ? +process.env.GEAR : 1; // 장비/준비 보정 (base=장비 원칙 모사)
  u.atk = Math.floor(u.atk * g); u.def = Math.floor(u.def * g); u.maxHp = Math.floor(u.maxHp * g); u.spd = Math.floor(u.spd * g);
  u.hp = u.maxHp;
  return u;
}

function applyBuild(allies) { // 빌드 트레잇 검증: 1번=탱커(수호+위압), 2번=리젠
  if (!process.env.BUILD) return;
  allies[0].traits = [...(allies[0].traits || []), 'CT_GUARDIAN', 'CT_INTIMIDATION'];
  const rg = e.data.traits.find(t => t.bridges && t.bridges.some(b => b.effect === 'regen'));
  if (rg) allies[1].traits = [...(allies[1].traits || []), rg.id];
}

const CS = G('systems/combatSpecials.js');
// 연금술사 도구 프록시 (특수계 개입 — PTOOL=acc|regen|guard|all)
const PLAYER_TOOLS = {
  acc:   { accUp: 0.05 },        // 조준 촉매 — 파티 명중 +5%
  regen: { regen: 0.08 },        // 강장 향로 — 파티 리젠 8%/라운드
  guard: { debuffResist: 0.5 },  // 수호 부적 — 디버프 저항 50%
};
function applyPlayerTools(cs) {
  const sel = process.env.PTOOL;
  if (!sel) return;
  const keys = sel === 'all' ? Object.keys(PLAYER_TOOLS) : [sel];
  for (const a of cs.battleState.allies) {
    a._spCache = CS.collect(cs._unitBridges(a));
    for (const k of keys) for (const eff in PLAYER_TOOLS[k]) {
      a._spCache[eff] = (a._spCache[eff] || 0) + PLAYER_TOOLS[k][eff];
    }
  }
}

function battle(allies, enemies) {
  // 인스턴스 등록(종전 반영 경로) 후 전투
  cs.startBattle(allies, enemies);
  applyPlayerTools(cs);
  let rounds = 0;
  while (!cs.battleState.finished && rounds < 30) { cs.executeRound(); rounds++; }
  const ko = cs.battleState.allies.filter(a => a.isKO).length;
  return { win: cs.battleState.result === 'win', rounds, ko, timeout: rounds >= 30 && !cs.battleState.finished };
}

console.log('층 | 조우(수) | 파티Lv | 승률 | 라운드중앙 | KO평균 | 타임아웃');
for (const f of (process.env.FLOORS ? process.env.FLOORS.split(",").map(Number) : [1, 3, 5, 8, 10, 12, 15])) {
  const encIds = floorEncounters(f);
  if (!encIds.length) { console.log(`${f} | (조우 없음)`); continue; }
  const defs = encIds.map(id => e.getUnitDef(id)).filter(Boolean);
  const enemyLv = Math.round(defs.reduce((a, d) => a + d.level, 0) / defs.length);
  for (const dlt of [-4, -2, 0, 2]) {
    const targetLv = Math.max(1, enemyLv + dlt);
    let wins = 0, roundsArr = [], koSum = 0, to = 0;
    for (let i = 0; i < N; i++) {
      const allies = [0, 7, 1].map(ix => makeAlly(ix % e.data.units.length, targetLv));
      const eDefs = []; for (let k = 0; k < (process.env.ENEMY_N ? +process.env.ENEMY_N : 2); k++) eDefs.push(defs[(i + k) % defs.length]);
      const enemies = eDefs.map(d => cs.createEnemyFromDef(d));
      applyBuild(allies);
      const r = battle(allies, enemies);
      if (r.win) wins++;
      roundsArr.push(r.rounds); koSum += r.ko; if (r.timeout) to++;
    }
    roundsArr.sort((a, b) => a - b);
    console.log(`${f} | ${encIds.length}종 적Lv${enemyLv} | ${targetLv} (${dlt >= 0 ? '+' + dlt : dlt}) | ${(wins / N * 100).toFixed(0)}% | ${roundsArr[Math.floor(N / 2)]} | ${(koSum / N).toFixed(1)} | ${to}`);
  }
}
