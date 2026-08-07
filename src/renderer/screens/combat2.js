'use strict';

// ============================================================
//  v2 전투 관전 (ui_mockup_combat) — 자동전투 + 소모품 개입
//  기존 CombatSystem 위 패널 렌더러. 종료 시 v1 결과 흐름으로 합류.
// ============================================================
module.exports = function (App) {

  // v1 showCombatScreen 대체 — 전투 시작 시 패널 오픈
  App.prototype.showCombatScreen = function () {
    this._cb2Log = [];
    this._cb2Auto = null;
    this._cb2AddLog('전투 시작 — 준비가 전투를 결정한다.', 'sys');
    this._renderCombat2();
  };

  App.prototype._cb2AddLog = function (text, cls) {
    this._cb2Log.push({ text, cls: cls || '' });
    if (this._cb2Log.length > 200) this._cb2Log.shift();
  };

  App.prototype._cb2StopAuto = function () {
    if (this._cb2Auto) { clearInterval(this._cb2Auto); this._cb2Auto = null; }
  };

  App.prototype._cb2UsableItems = function () {
    const inv = this.engine.state.inventory;
    const out = [];
    for (const [matId, qty] of Object.entries(inv)) {
      if (qty <= 0 || matId.startsWith('MAT_')) continue;
      const mat = this.engine.data.materials.find(m => m.id === matId);
      if (!mat) continue;
      if (mat.category === 'consumable_food') continue;
      if (mat.effect && (mat.effect.type === 'heal' || mat.effect.type === 'damage' || mat.effect.type === 'debuff')) {
        out.push({ id: matId, name: mat.name, qty, effect: mat.effect });
      }
    }
    return out;
  };

  App.prototype._renderCombat2 = function () {
    const bs = this.combat.battleState;
    if (!bs) return;
    const s = this.engine.state;
    const floor = s.dungeon.currentFloor;

    const entHtml = (e) => {
      const pct = Math.max(0, e.hp / e.maxHp * 100);
      let aggro = 0;
      try { aggro = this.combat._aggro(e); } catch (err) { aggro = 0; }
      return `<div class="ent ${e.isKO ? 'dead' : ''}">
        <div class="top"><span class="nm">${e.name}</span>
          ${e.isBoss ? '<span style="font-size:10px;color:#e07070;border:1px solid #5a3030;padding:0 4px">보스</span>' : ''}
          ${!e.isKO && aggro > 1 ? `<span class="aggro">어그로 ${aggro}</span>` : ''}</div>
        <div class="hpbar"><i style="width:${pct}%"></i></div>
        <div class="apline">HP ${Math.max(0, Math.round(e.hp))}/${e.maxHp} · AP ${e.maxAp}</div>
      </div>`;
    };

    const items = this._cb2UsableItems();
    const finished = bs.finished;
    const statusText = !finished ? '자동전투 — 개입은 소모품뿐'
      : bs.result === 'win' ? '승리' : bs.result === 'flee' ? '도주' : '패배';

    const html = `
      <div class="v2-header">
        【 <span class="loc">탐사 · 조우 전투</span> 】 미궁 ${floor}층
        <span style="color:#889;font-size:12px" id="cb2-status">${statusText}</span>
        <span class="right">라운드 ${bs.round}</span>
      </div>
      <div class="cb-field">
        <div class="cb-side party"><h4>파티</h4>${bs.allies.map(entHtml).join('')}</div>
        <div class="cb-side enemy"><h4>적</h4>${bs.enemies.map(entHtml).join('')}</div>
      </div>
      <div class="cb-log" id="cb2-log">${this._cb2Log.map(l =>
        l.cls === 'turn' ? `<div class="turn">${l.text}</div>` : `<div class="le ${l.cls}">${l.text}</div>`).join('')}</div>
      <div class="cb-items">
        <span class="ilab">소모품:</span>
        ${items.length ? items.map((it, i) =>
          `<span class="item ${it.qty <= 0 ? 'empty' : ''}" data-i="${i}" title="${it.effect.desc || ''}">${it.name} <span class="cnt">×${it.qty}</span></span>`).join('')
          : '<span style="color:#556;font-size:12px">없음 (물약/독물약은 연성 공방에서)</span>'}
        <span style="color:#664;font-size:11px;margin-left:auto">※ 조교 전용품·식량은 전투 중 사용 불가</span>
      </div>
      <div class="cb-ctrl">
        ${finished
          ? '<span class="btn" data-cmd="end">결과 확인 →</span>'
          : `<span class="btn" data-cmd="step">▶ 한 턴</span>
             <span class="btn" data-cmd="auto">${this._cb2Auto ? '⏸ 멈춤' : '⏩ 자동 진행'}</span>
             <span class="btn" data-cmd="flee">도주</span>`}
        <span style="color:#556;font-size:12px;margin-left:auto">오버라이드·어그로·숙련도 보정이 로그에 표시된다</span>
      </div>`;

    const el = this.openPanel('combat2', html);
    const logEl = document.getElementById('cb2-log');
    if (logEl) logEl.scrollTop = logEl.scrollHeight;

    el.querySelectorAll('.item').forEach(chip => {
      chip.addEventListener('click', () => {
        if (bs.finished) return;
        this._cb2UseItem(items[+chip.dataset.i]);
      });
    });
    el.querySelectorAll('.btn').forEach(b => {
      b.addEventListener('click', () => {
        const cmd = b.dataset.cmd;
        if (cmd === 'step') { this._cb2StopAuto(); this._cb2Round(); }
        else if (cmd === 'auto') {
          if (this._cb2Auto) { this._cb2StopAuto(); this._renderCombat2(); }
          else {
            this._cb2Auto = setInterval(() => {
              if (this.combat.battleState.finished || this.currentScreen !== 'combat2') { this._cb2StopAuto(); return; }
              this._cb2Round();
            }, 900);
            this._renderCombat2();
          }
        }
        else if (cmd === 'flee') { this._cb2StopAuto(); this._cb2Flee(); }
        else if (cmd === 'end') { this._cb2StopAuto(); this.closePanel(); this.clearOutput(); this.showCombatEnd(); }
      });
    });
  };

  App.prototype._cb2Round = function () {
    const r = this.combat.executeRound();
    for (const entry of r.log) {
      let cls = '';
      if (entry.type === 'round') cls = 'turn';
      else if (entry.type === 'skill') cls = 'skill';
      else if (entry.type === 'ko') cls = 'ko';
      else if (entry.type === 'summary' || entry.type === 'system') cls = 'sys';
      else if (entry.type === 'result') cls = entry.text.includes('승리') ? 'win' : 'lose';
      this._cb2AddLog(entry.text, cls);
    }
    if (r.finished) this._cb2StopAuto();
    this._renderCombat2();
  };

  App.prototype._cb2UseItem = function (item) {
    if (!item || item.qty <= 0) return;
    this.engine.removeMaterial(item.id, 1);
    const bs = this.combat.battleState;
    if (item.effect.type === 'heal') {
      const allies = bs.allies.filter(u => !u.isKO);
      const target = allies.reduce((min, u) => u.hp < min.hp ? u : min, allies[0]);
      if (target) {
        target.hp = Math.min(target.maxHp, target.hp + item.effect.value);
        this._cb2AddLog(`[소모품] ${item.name} — ${target.name} HP +${item.effect.value}`, 'use');
      }
    } else if (item.effect.type === 'damage') {
      const enemies = bs.enemies.filter(u => !u.isKO);
      if (enemies.length) {
        const t = enemies[0];
        t.hp = Math.max(0, t.hp - item.effect.value);
        this._cb2AddLog(`[소모품] ${item.name} — ${t.name}에게 ${item.effect.value} 피해`, 'use');
        if (t.hp <= 0) { t.isKO = true; this._cb2AddLog(`${t.name} 쓰러짐.`, 'ko'); }
      }
    } else {
      this._cb2AddLog(`[소모품] ${item.name} 사용.`, 'use');
    }
    this._renderCombat2();
  };

  App.prototype._cb2Flee = function () {
    const partyUnits = this.engine.getPartyUnits().filter(u => !u.isKnockedOut);
    const partySpeed = partyUnits.reduce((sum, u) => sum + u.spd, this.engine.state.player.spd) / (partyUnits.length + 1);
    const success = this.combat.attemptFlee(partySpeed);
    if (success) {
      this._cb2AddLog('도주에 성공했다!', 'win');
      this._renderCombat2();
    } else {
      this._cb2AddLog('도주에 실패했다! 적의 공격이 쏟아진다.', 'lose');
      this._cb2Round();
    }
  };
};
