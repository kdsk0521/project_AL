'use strict';

/**
 * combatSpecials.js — 전투 special 어휘 공통 리졸버 (시스템 패스 2026-07-17)
 * 소비 어휘(구현): critUp accUp defPierce defShred dmgPerLewd firstStrike hitLowestSlot
 *   allInStrike exhaustNextRound stackDmg / enemySpdDown enemyAccDown enemyApDown enemyAtkDown
 *   stun dot독 dot열 / reflect counter regen physImmuneRound debuffResist randomResist
 *   ambushImmune fearResist / allyHeal selfHpCost pullTarget onHitSenGain onHitPleasure
 * 스텁(로그만·TODO): sealSkill areaGrow knockback dispel cleanse revealEnemy selfSpdUp
 *   selfDefDown extraHitOnFirst autoExtraAttack enemyAiDisrupt hitStaggerImmune 등 — hooks 대장 참조
 */

// specials 배열 → {effect: 합산값}
function collect(bridges) {
  const sp = {};
  for (const s of (bridges && bridges.specials) || []) {
    sp[s.effect] = (sp[s.effect] || 0) + (s.value == null ? 1 : s.value);
  }
  return sp;
}

function st(u) { return u._status || (u._status = { turns: {}, dots: [], defShred: 0, exhaustNext: false, physImmune: false, stackKey: null, stack: 0 }); }

// ── 공격 계산 보정 (데미지 산출 직전) ──
// returns { defValue, multBonus, critMult, missed }
function attackMods(attacker, target, sp, defValue, ctx) {
  const aSt = st(attacker), tSt = st(target);
  let mult = 1, crit = 1, missed = false;
  // 명중: 공격자에게 걸린 accDown 상태 vs accUp
  const accDown = (aSt.turns.accDown || 0) > 0 ? 0.2 : 0;
  const acc = 0.95 + (sp.accUp || 0) - accDown;
  if (Math.random() > acc) missed = true;
  // 치명
  if (Math.random() < (sp.critUp || 0)) crit = 1.5;
  // 방어 관통·최저 슬롯·셰레드
  if (sp.hitLowestSlot && target.defenseProfile) {
    defValue = Math.min(...Object.values(target.defenseProfile));
  }
  defValue = Math.max(0, defValue * (1 - (sp.defPierce || 0)) - (tSt.defShred || 0));
  // 선제(1라운드) 보정
  if (ctx.round === 1 && sp.firstStrike && !collect_has(target, 'ambushImmune')) mult *= 1 + sp.firstStrike;
  // 상대 음란 비례 (전투×조교)
  if (sp.dmgPerLewd && target.lewdness) mult *= 1 + sp.dmgPerLewd * Math.min(10, target.lewdness / 10);
  // 동일 스킬 반복 축적
  if (sp.stackDmg) {
    if (aSt.stackKey === ctx.skillId) aSt.stack = Math.min(5, aSt.stack + 1);
    else { aSt.stackKey = ctx.skillId; aSt.stack = 0; }
    mult *= 1 + sp.stackDmg * aSt.stack;
  }
  // 올인 일격 (회색 늑대): 남은 AP 전소비 → 배율, 다음 라운드 탈진
  if (sp.allInStrike && ctx.extraAp > 0) {
    mult *= 1 + 0.25 * ctx.extraAp;
  }
  if (sp.exhaustNextRound) aSt.exhaustNext = true;
  return { defValue, multBonus: mult, critMult: crit, missed };
}
function collect_has(unit, effect) {
  return !!(unit._spCache && unit._spCache[effect]);
}

// ── 명중 후 부여 (데미지 적용 시점) ──
function onHit(action, atkSp, defSp, log) {
  const target = action.target, actor = action.actor;
  const tSt = st(target), aSt = st(actor);
  const resist = Math.min(0.8, (defSp.debuffResist || 0) + (defSp.randomResist || 0) * 0.5);
  const roll = () => Math.random() >= resist;
  // 불괴: 물리 무효 1회성
  if (tSt.physImmune && !action.element) {
    action.damage = 0; tSt.physImmune = false;
    log.push({ type: 'special', text: `${target.name} — 불괴! 물리 피해 무효` });
  }
  // 디버프류 (스킬 사용자 specials)
  const D = [['enemySpdDown', 'spdDown'], ['enemyAccDown', 'accDown'], ['enemyAtkDown', 'atkDown']];
  for (const [k, key] of D) {
    if (atkSp[k] && roll()) { tSt.turns[key] = 2; }
  }
  if (atkSp.enemyApDown && roll()) tSt.turns.apDown = Math.max(tSt.turns.apDown || 0, 1);
  if (atkSp.stun && roll()) { tSt.turns.stun = 1; log.push({ type: 'special', text: `${target.name} — 행동 불능!` }); }
  if (atkSp['dot독'] && roll()) tSt.dots.push({ el: '식', pct: atkSp['dot독'], turns: 2 });
  if (atkSp['dot열'] && roll()) tSt.dots.push({ el: '열', pct: atkSp['dot열'], turns: 2 });
  if (atkSp.defShred) tSt.defShred = Math.min(20, (tSt.defShred || 0) + atkSp.defShred * 10);
  // 전투→조교 (감도 있는 대상만 — 포획·조우 결)
  if (atkSp.onHitSenGain && target.sensitivity) {
    const keys = Object.keys(target.sensitivity);
    if (keys.length) { const k = keys[Math.floor(Math.random() * keys.length)]; target.sensitivity[k] += atkSp.onHitSenGain; }
  }
  if (atkSp.onHitPleasure) target.lewdness = (target.lewdness || 0) + atkSp.onHitPleasure * 10;
  // 방어측: 반사·반격
  if (action.damage > 0) {
    if (defSp.reflect) {
      const back = Math.floor(action.damage * defSp.reflect);
      if (back > 0) { actor.hp = Math.max(0, actor.hp - back); log.push({ type: 'special', text: `${target.name}의 반사 → ${actor.name}에게 ${back}` }); }
    }
    if (defSp.counter && Math.random() < defSp.counter * 2) {
      const back = Math.floor((target.atk || 10) * 0.5);
      actor.hp = Math.max(0, actor.hp - back);
      log.push({ type: 'special', text: `${target.name}의 반격 → ${actor.name}에게 ${back}` });
    }
  }
}

// ── 라운드 시작 (AP 리셋 직후) ──
function roundStart(u, log) {
  const s = st(u);
  if (s.exhaustNext) { u.ap = 0; s.exhaustNext = false; log.push({ type: 'special', text: `${u.name} — 탈진! 이번 라운드 행동 불가` }); }
  if ((s.turns.stun || 0) > 0) { u.ap = 0; s.turns.stun--; log.push({ type: 'special', text: `${u.name} — 마비로 움직이지 못한다` }); }
  if ((s.turns.apDown || 0) > 0) { u.ap = Math.max(0, u.ap - 1); s.turns.apDown--; }
  if ((s.turns.atkDown || 0) > 0) u._atkDownActive = true; else u._atkDownActive = false;
}

// ── 라운드 종료 (도트·리젠·상태 감쇠·오라) ──
function roundEnd(entities, log) {
  for (const u of entities) {
    if (u.isKO) continue;
    const s = st(u);
    for (const d of s.dots) {
      const dmg = Math.max(1, Math.floor((u.maxHp || 50) * d.pct * 0.3));
      u.hp = Math.max(0, u.hp - dmg);
      log.push({ type: 'special', text: `${u.name} — ${d.el} 지속 피해 ${dmg}` });
      d.turns--;
    }
    s.dots = s.dots.filter(d => d.turns > 0);
    if (u.hp <= 0 && !u.isKO) { u.isKO = true; log.push({ type: 'ko', text: `${u.name}이(가) 쓰러졌다!` }); }
    const sp = u._spCache || {};
    if (sp.regen && u.hp > 0) {
      const heal = Math.floor((u.maxHp || 50) * sp.regen * 0.3);
      u.hp = Math.min(u.maxHp, u.hp + heal);
    }
    for (const k of Object.keys(s.turns)) if (k !== 'stun' && s.turns[k] > 0) s.turns[k]--;
  }
  // 아군 오라: allyHeal (펠리컨 결 — 최저 HP 아군 회복, selfHpCost 지불)
  for (const u of entities) {
    if (u.isKO) continue;
    const sp = u._spCache || {};
    if (sp.allyHeal) {
      const allies = entities.filter(x => !x.isKO && x !== u && x.isAlly === u.isAlly);
      if (allies.length) {
        const low = allies.reduce((a, b) => (a.hp / a.maxHp < b.hp / b.maxHp ? a : b));
        const heal = Math.floor(low.maxHp * sp.allyHeal * 0.5);
        low.hp = Math.min(low.maxHp, low.hp + heal);
        if (sp.selfHpCost) u.hp = Math.max(1, u.hp - Math.floor(u.maxHp * sp.selfHpCost * 0.5));
        log.push({ type: 'special', text: `${u.name}이(가) ${low.name}을(를) ${heal} 회복시켰다` });
      }
    }
  }
}

module.exports = { collect, st, attackMods, onHit, roundStart, roundEnd };
