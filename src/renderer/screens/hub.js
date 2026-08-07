'use strict';

// ============================================================
//  v2 메인 행동 허브 (ui_mockup_main) — town 허브 대체
//  메인 행동(1~6) = AP 1 소비 / 상시(7~9,i,t,s) = 무료 / 0 = 하루 넘기기
// ============================================================
module.exports = function (App) {

  App.prototype._hubAddLog = function (text, cls) {
    if (!this._hubLog) this._hubLog = [];
    this._hubLog.push({ text, cls: cls || '' });
    if (this._hubLog.length > 60) this._hubLog.shift();
  };

  App.prototype.showMainHub = function () {
    const eng = this.engine;
    eng.ensureV2State();
    this.autoSave();
    const s = eng.state;
    if (!this._hubLog) {
      this._hubLog = [];
      this._hubAddLog(`${s.month}월 ${s.day}일 — 행동 ${s.ap}회 가능.`);
    }

    const sigNames = (s.activeSignals || []).map(n => eng.getSigilName(n));
    const noAp = s.ap <= 0;

    // ── 배치 현황 ──
    const party = [], facility = [], idle = [];
    for (const u of s.ownedUnits) {
      const where = this.unitDeployLabel(u);
      if (where === '파티') party.push(u.name);
      else if (where === '대기') idle.push(u.name);
      else facility.push(u.name + ' (' + where + ')');
    }

    // ── 알림 ──
    const events = [];
    for (const u of s.ownedUnits) {
      if (u.isKnockedOut) events.push(`<span class="warn">▲</span> ${u.name} — 기절 (회복 ${u.recoveryDays}일)`);
      const v = this.unitVariation(u);
      if (v && v.degree >= 2) {
        const vt = eng.getVariationTrait(v.route, v.degree);
        events.push(`<span class="tag">●</span> ${u.name} — <span class="rt-${v.route}">${v.route} 도${v.degree}</span>${vt ? ' 「' + vt.name + '」' : ''} ★수렴`);
      }
      if (u.affection >= 90) events.push(`<span class="tag">●</span> ${u.name} — 호감도 [헌신] 도달`);
    }
    if (s.milestones.compressorBuilt && s.soulPower < 100) {
      events.push(`<span class="warn">▲</span> 영혼력 ${s.soulPower} — 유지비 정산 주의`);
    }
    if (!events.length) events.push('<span style="color:#556">조용하다.</span>');

    const prima = s.prima || {};
    const soulMax = Math.max(1, s.soulPower + 200);

    const mainActs = [
      { key: '1', nm: '조교 공방', desc: '유닛 1명 집중 조교' },
      { key: '2', nm: '미궁 탐사', desc: '파티 출격 · 채집/전투' },
      { key: '3', nm: '연성 공방', desc: '가공 · 조합' },
      { key: '4', nm: '연성진 (합체/추출)', desc: '印 합성 · 삼원질' },
      { key: '5', nm: '유닛 거처 방문', desc: '교류 · 호감도' },
      { key: '6', nm: '광장 (전서)', desc: '유닛 구매 · 납품' },
    ];
    const freeActs = [
      { key: '7', nm: '유닛 명부', desc: '상태 확인 · 배치 변경' },
      { key: '8', nm: '도시 / 시설', desc: '배치 · 강화' },
      { key: '9', nm: '전수서 (레시피)', desc: '발견한 레시피' },
      { key: 'i', nm: '인벤토리', desc: '소지품 확인' },
      { key: 't', nm: '도구 관리', desc: '도구 부품 · 업그레이드' },
      { key: 's', nm: '저장', desc: '슬롯 저장' },
    ];

    const html = `
      <div class="v2-header">
        <span class="loc">${s.year}년 ${s.month}월 ${s.day}일</span>
        <span>행동 <span class="ap">${s.ap}</span>/${s.apMax}</span>
        <span class="soul">영혼력 ${s.soulPower.toLocaleString()}</span>
        <span class="stam">스태미나 ${s.stamina}/${s.maxStamina}</span>
        <span class="sigil">활성 印: <b>${sigNames.join(' · ') || '—'}</b></span>
        <span class="right">${s.month}월 · 30일까지 · 미궁 ${s.dungeon.maxFloorReached}층 도달</span>
      </div>
      <div class="v2-main">
        <div class="v2-menu">
          <h4 style="margin-left:16px">오늘의 행동 <span style="color:#445">(하루 ${s.apMax}회)</span></h4>
          ${mainActs.map(a => `
            <div class="v2-act ${noAp ? 'disabled' : ''}" data-cmd="${a.key}">
              <span class="num">${a.key}.</span><span class="nm">${a.nm}</span>
              <span class="cost">행동 1</span><span class="desc">${a.desc}</span>
            </div>`).join('')}
          <h4 style="margin-left:16px">상시 (행동 소비 없음)</h4>
          ${freeActs.map(a => `
            <div class="v2-act" data-cmd="${a.key}">
              <span class="num">${a.key}.</span><span class="nm" style="color:#cbd">${a.nm}</span>
              <span class="desc">${a.desc}</span>
            </div>`).join('')}
          <div class="v2-act" data-cmd="0">
            <span class="num">0.</span><span class="nm" style="color:#9aa">하루 넘기기 (휴식)</span>
            <span class="desc">행동 회복 · 월말 진행</span>
          </div>
        </div>
        <div class="v2-board">
          <h4>유닛 배치 현황</h4>
          <div class="v2-deploy"><span class="where">⚔ 파티</span><span class="who">${party.join(' · ') || '<span style="color:#556">없음</span>'}</span></div>
          <div class="v2-deploy"><span class="where">시설</span><span class="who">${facility.join(' · ') || '<span style="color:#556">없음</span>'}</span></div>
          <div class="v2-deploy"><span class="where" style="color:#667">대기</span><span class="who" style="color:#889">${idle.join(' · ') || '없음'}</span></div>
          <h4>관측소 — 활성 印</h4>
          <div class="v2-ev"><span class="tag">◈</span> 이번 달 활성 印 <b style="color:#c8b0e0">${sigNames.join(' · ')}</b> — <span style="color:#9aa">해당 印 유닛 경험치·납품가 ↑</span></div>
          <h4>알림 / 이벤트</h4>
          ${events.map(e => `<div class="v2-ev">${e}</div>`).join('')}
          <h4>자원</h4>
          <div class="v2-row"><span class="lbl">영혼력</span><div class="v2-bar b-soul"><i style="width:${Math.min(100, s.soulPower / soulMax * 100)}%"></i></div><span class="val">${s.soulPower.toLocaleString()}</span></div>
          <div class="v2-row"><span class="lbl">스태미나</span><div class="v2-bar b-stam"><i style="width:${s.stamina / s.maxStamina * 100}%"></i></div><span class="val">${s.stamina}/${s.maxStamina}</span></div>
          <div style="font-size:11px;color:#667;margin-top:4px">삼원질 비축: <span class="v-염">염 ×${prima['염'] || 0}</span> · <span class="v-수은">수은 ×${prima['수은'] || 0}</span> · <span class="v-유황">유황 ×${prima['유황'] || 0}</span></div>
        </div>
      </div>
      <div class="v2-log" id="hub-log">${this._hubLog.map(l => `<div class="l ${l.cls}">${l.text}</div>`).join('')}</div>
      <div class="v2-hint">메인 행동(1~6) = 행동 1 소비 · 상시(7~9, i/t/s) = 무료 · 0 = 하루 넘기기 · 숫자 키 입력 가능</div>`;

    const el = this.openPanel('hub', html);
    el.querySelectorAll('.v2-act').forEach(a => {
      a.addEventListener('click', () => this.handleHub(a.dataset.cmd));
    });
    const logEl = document.getElementById('hub-log');
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
    this.setPanelKeys((e) => {
      if (/^[0-9its]$/.test(e.key)) { e.preventDefault(); this.handleHub(e.key); }
    });
    this.updateStatus();
  };

  App.prototype._hubSpend = function () {
    if (!this.engine.canAct()) {
      this._hubAddLog('오늘의 행동을 모두 썼다. 하루를 넘겨야 한다.', 'tag');
      this.showMainHub();
      return false;
    }
    this.engine.spendAction();
    return true;
  };

  App.prototype.handleHub = function (cmd) {
    const eng = this.engine;
    switch (cmd) {
      case '1': { // 조교 공방
        if (!this._hubSpend()) return;
        this._hubAddLog('▶ 조교 공방 — 행동 1 소비.');
        this.closePanel();
        this.showTrainingFacility();
        break;
      }
      case '2': { // 미궁 탐사
        const check = eng.canExplore();
        if (!check.ok) { this._hubAddLog(check.reason, 'warn'); this.showMainHub(); return; }
        if (!this._hubSpend()) return;
        this._hubAddLog('▶ 미궁 탐사 — 행동 1 소비.');
        this.closePanel();
        this.showDungeonPrep();
        break;
      }
      case '3': { // 연성 공방
        if (!this._hubSpend()) return;
        this._hubAddLog('▶ 연성 공방 — 행동 1 소비.');
        this.closePanel();
        this.showCrafting();
        break;
      }
      case '4': { // 연성진 (합체/추출)
        if (!this._hubSpend()) return;
        this._hubAddLog('▶ 연성진 — 행동 1 소비.');
        this.showFusion2();
        break;
      }
      case '5': { // 유닛 거처
        if (!this._hubSpend()) return;
        this._hubAddLog('▶ 유닛 거처 — 행동 1 소비.');
        this.showResidence();
        break;
      }
      case '6': { // 광장 (전서)
        if (!this._hubSpend()) return;
        this._hubAddLog('▶ 광장 — 행동 1 소비.');
        this.closePanel();
        this.showCompendium();
        break;
      }
      case '7': this.showUnitRoster(); break;
      case '8': this.closePanel(); this.showCityFacilities(); break;
      case '9': this.closePanel(); this.showRecipeList(); break;
      case 'i': this.closePanel(); this.showInventory(); break;
      case 't': this.closePanel(); this.showToolManagement(); break;
      case 's': this.closePanel(); this.clearOutput(); this.doSaveGame(); this.currentScreen = 'town'; break;
      case '0': this.hubAdvanceDay(); break;
      default: break;
    }
  };

  // 하루 넘기기 — town.js doAdvanceDay의 허브판
  App.prototype.hubAdvanceDay = function () {
    const eng = this.engine;
    const prevDay = eng.state.day, prevMonth = eng.state.month;
    eng.advanceDay();
    const s = eng.state;
    this._hubAddLog(`— ${prevMonth}월 ${prevDay}일을 마치고 ${s.month}월 ${s.day}일로. 행동 ${s.apMax} 회복.`, 'tag');

    if (s.month !== prevMonth) {
      this._hubAddLog(`▣ ${prevMonth}월 월말 정산 — 다음 달로.`, 'tag');
      const report = eng.getMonthReport();
      if (report.maintenanceCost > 0) this._hubAddLog(`유지비 지출: 영혼력 -${report.maintenanceCost}`, 'warn');
      this._hubAddLog('시설 생산이 완료되었다.');
      const wr = s._workshopResults;
      if (wr && wr.length) {
        this._hubAddLog(`가공소 자동 가공 ${wr.length}건.`);
        s._workshopResults = null;
      }
      this._hubAddLog(`이번 달 활성 印: ${(s.activeSignals || []).map(n => eng.getSigilName(n)).join(' · ')}`, 'tag');
      const bankCheck = this.economy.checkBankruptcy();
      if (bankCheck.bankrupt) {
        this.closePanel();
        this.print(bankCheck.message, 'danger');
        this.showEndGame(false);
        return;
      }
    }
    if (s.day >= 28 && s.day <= 30) this._hubAddLog('▲ 월말 임박 — 유지비 정산이 다가온다.', 'warn');
    this.showMainHub();
  };

  // 유닛 거처 — 간이 패널: 유닛 선택 → 교류 (호감도)
  App.prototype.showResidence = function () {
    const units = this.engine.state.ownedUnits.filter(u => !u.isKnockedOut);
    const html = `
      <div class="v2-header">
        【 <span class="loc">유닛 거처</span> 】 ${this.engine.state.year}년 ${this.engine.state.month}월 ${this.engine.state.day}일
        <span class="right">교류할 유닛을 고르세요</span>
      </div>
      <div class="v2-main">
        <div class="v2-list" style="width:46%">
          <h4>거주 유닛</h4>
          ${units.length ? units.map((u, i) => {
            const stage = this.unit.getAffectionStage(u.affection);
            return `<div class="v2-u" data-i="${i}">
              <div class="top"><span style="color:#667;width:20px">${i + 1}.</span><span class="nm">${u.name}</span>
                <span class="race r-${u.category}">${u.category}</span>
                <span style="color:#889;font-size:12px">Lv.${u.level}</span></div>
              <div class="sub"><span>호감 ${u.affection} [${stage.name || stage}]</span><span>${this.unitDeployLabel(u)}</span></div>
            </div>`;
          }).join('') : '<div style="color:#556;padding:20px">유닛이 없다.</div>'}
        </div>
        <div class="v2-detail" id="res-log">
          <div style="color:#445;text-align:center;padding:40px 10px">유닛을 클릭하면 함께 시간을 보낸다.<br>(호감도 상승 · 스태미나 1)</div>
        </div>
      </div>
      <div class="v2-actions"><span class="act" data-cmd="back"><span class="num">[0]</span> 허브로</span></div>`;

    const el = this.openPanel('residence', html);
    const log = el.querySelector('#res-log');
    el.querySelectorAll('.v2-u').forEach(row => {
      row.addEventListener('click', () => {
        const u = units[+row.dataset.i];
        const r = this.unit.socialize(u.instanceId);
        const line = document.createElement('div');
        line.style.cssText = 'font-size:13px;padding:3px 0;color:' + (r.success ? '#9a9' : '#e0a060');
        line.textContent = r.success ? `${u.name} — ${r.message}` : r.reason;
        if (log.querySelector('[style*="text-align:center"]')) log.innerHTML = '';
        log.appendChild(line);
        if (r.success && r.unlocked) {
          const l2 = document.createElement('div');
          l2.style.cssText = 'font-size:13px;padding:3px 0;color:#c678dd';
          l2.textContent = `새로운 특성 해금: ${r.unlocked.traitName}!`;
          log.appendChild(l2);
        }
      });
    });
    el.querySelector('[data-cmd="back"]').addEventListener('click', () => this.showMainHub());
    this.setPanelKeys((e) => { if (e.key === '0' || e.key === 'Escape') this.showMainHub(); });
  };

  // ── town 허브를 v2 허브로 대체 ──
  App.prototype.showTownMenu = function () {
    this.showMainHub();
  };
};
