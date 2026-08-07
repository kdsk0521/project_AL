'use strict';

// ============================================================
//  v2 합체 화면 (ui_mockup_fusion) — 印 체계 + 삼원질 주입
//  좌: 재료 풀 / 중: 슬롯 + 주입 / 우: 결과 미리보기(계승 3경로·모순쌍)
// ============================================================
module.exports = function (App) {

  const PRIMA_EFF = { '염': '직접 계승 슬롯 +1', '수은': '모순쌍 통합 발동', '유황': '잠재력 인하량 2배' };

  // fromHub: 허브에서 직접 진입 (탭 전환 시 AP 재소비 없음)
  App.prototype.showFusion2 = function (keepSel) {
    if (!keepSel) {
      if (this._fusion2A === undefined) this._fusion2A = null;
      if (this._fusion2B === undefined) this._fusion2B = null;
      this._fusion2Inject = null;
    }
    this._renderFusion2();
  };

  App.prototype._fusion2Pool = function () {
    // 시설 배치 유닛 제외 (엔진 검증과 동일), 파티 유닛은 허용 (합체 시 자동 해제)
    return this.engine.state.ownedUnits.filter(u => !u.assignedFacility);
  };

  App.prototype._renderFusion2 = function (msg) {
    const s = this.engine.state;
    const pool = this._fusion2Pool();
    const prima = s.prima || {};
    const A = pool.find(u => u.instanceId === this._fusion2A) || null;
    const B = pool.find(u => u.instanceId === this._fusion2B) || null;

    const listHtml = pool.map(u => {
      const picked = (A && u.instanceId === A.instanceId) || (B && u.instanceId === B.instanceId);
      const isPrima = u.sigil === 7;
      return `<div class="v2-u ${picked ? 'picked' : ''}" data-id="${u.instanceId}">
        <div class="top"><span class="race r-${u.category}">${u.category}</span> <span class="nm">${u.name}</span>
          <span style="color:#667;font-size:11px">Lv.${u.level}</span></div>
        <div class="sub"><span class="sigb ${isPrima ? 'prima' : ''}">印 ${u.sigilName || this.engine.getSigilName(u.sigil)}</span>
          ${this.engine.state.party.includes(u.instanceId) ? '<span style="color:#e07050">⚔</span>' : ''}</div>
      </div>`;
    }).join('');

    const slotHtml = (u, which) => {
      if (!u) return `<div class="empty">소재 ${which} — 왼쪽에서 선택</div>`;
      return `<span class="x" data-x="${which}">✕ 해제</span>
        <span class="sname">${u.name}</span> <span class="race r-${u.category}">${u.category}</span>
        <div class="sline">Lv.${u.level} · <span class="sigb ${u.sigil === 7 ? 'prima' : ''}">印 ${u.sigilName || this.engine.getSigilName(u.sigil)}</span></div>
        <div>${(u.traits || []).map(t => this.traitChip(t)).join('')}</div>`;
    };

    // 삼원질 노트 (소재 印)
    const matPrimas = [];
    if (A && A.sigil === 7) matPrimas.push('염');
    if (B && B.sigil === 7) matPrimas.push('염');
    const noteActive = matPrimas.length > 0;

    const html = `
      <div class="v2-header">
        【 <span class="loc">연성진 · 합체</span> 】 ${s.year}년 ${s.month}월 ${s.day}일
        <span style="color:#889;font-size:12px">印A × 印B = 印C</span>
        <span class="soul">영혼력 ${s.soulPower.toLocaleString()}</span>
        <span class="right" style="cursor:pointer" data-cmd="toext">[추출로 →]</span>
      </div>
      <div class="v2-main">
        <div class="v2-list" style="width:28%">
          <h4>재료 후보 <span style="color:#445">(시설 배치 제외)</span></h4>
          ${listHtml || '<div style="color:#556;padding:20px;font-size:12px">유닛이 없다.</div>'}
        </div>
        <div style="width:34%;border-right:1px solid #2a2a2a;overflow-y:auto;padding-bottom:12px">
          <h4>소재</h4>
          <div class="v2-slot ${A ? 'filled' : ''}" id="f2-slotA">${slotHtml(A, 'A')}</div>
          <div class="v2-plus">＋</div>
          <div class="v2-slot ${B ? 'filled' : ''}" id="f2-slotB">${slotHtml(B, 'B')}</div>
          <div class="prima-note ${noteActive ? 'active' : ''}">${
            noteActive
              ? '삼원질 소재 — ' + matPrimas.map(p => `<b>${p}</b>: ${PRIMA_EFF[p]}`).join(' · ')
              : '삼원질 印(염)을 가진 소재를 넣으면 계승에 특수 효과가 붙습니다.'
          }</div>
          <h4>삼원질 주입 <span style="color:#445">(비축분 — 印 유닛 없이)</span></h4>
          <div class="v2-inject">${['염', '수은', '유황'].map(p => {
            const n = prima[p] || 0;
            const cls = n <= 0 ? 'off' : (this._fusion2Inject === p ? 'on' : '');
            return `<div class="vial ${cls}" data-vial="${p}">
              <div class="vn v-${p}">${p}</div>
              <div style="color:#778">×${n}</div>
              <div style="color:#556">${PRIMA_EFF[p]}</div>
            </div>`;
          }).join('')}</div>
        </div>
        <div class="v2-detail" id="f2-result"></div>
      </div>
      <div class="v2-actions">
        <span class="act" data-cmd="back"><span class="num">[0]</span> 허브로</span>
        <span style="color:#556;font-size:12px;margin-left:auto">소재 클릭 → 슬롯 · ✕ 해제 · 소재 2 소멸 주의</span>
      </div>`;

    const el = this.openPanel('fusion2', html);
    this._renderFusion2Result(msg);

    el.querySelectorAll('.v2-u').forEach(row => {
      row.addEventListener('click', () => {
        const id = +row.dataset.id;
        if (this._fusion2A === id || this._fusion2B === id) return;
        if (this._fusion2A == null) this._fusion2A = id;
        else if (this._fusion2B == null) this._fusion2B = id;
        else return;
        this._renderFusion2();
      });
    });
    el.querySelectorAll('.x').forEach(x => {
      x.addEventListener('click', () => {
        if (x.dataset.x === 'A') this._fusion2A = null; else this._fusion2B = null;
        this._renderFusion2();
      });
    });
    el.querySelectorAll('.vial').forEach(v => {
      v.addEventListener('click', () => {
        const p = v.dataset.vial;
        if ((prima[p] || 0) <= 0) return;
        this._fusion2Inject = (this._fusion2Inject === p ? null : p);
        this._renderFusion2();
      });
    });
    el.querySelector('[data-cmd="back"]').addEventListener('click', () => { this._fusion2A = this._fusion2B = null; this.showMainHub(); });
    el.querySelector('[data-cmd="toext"]').addEventListener('click', () => this.showExtraction());
    this.setPanelKeys((e) => { if (e.key === '0' || e.key === 'Escape') { this._fusion2A = this._fusion2B = null; this.showMainHub(); } });
    this.bindPanelTips();
  };

  App.prototype._renderFusion2Result = function (msg) {
    const box = document.getElementById('f2-result');
    if (!box) return;
    const pool = this._fusion2Pool();
    const A = pool.find(u => u.instanceId === this._fusion2A) || null;
    const B = pool.find(u => u.instanceId === this._fusion2B) || null;

    if (!A || !B) {
      box.innerHTML = `${msg ? `<div style="color:#e0a060;font-size:12px;margin:10px 0">▲ ${msg}</div>` : ''}
        <div style="color:#445;text-align:center;padding:40px 10px">소재 2를 고르면<br>印 합성 결과를 미리 봅니다.</div>`;
      return;
    }

    const preview = this.unit.previewFusion(A.instanceId, B.instanceId);
    const cost = this.unit.fusionCost(A, B);
    const canPay = this.engine.state.soulPower >= cost;

    // 삼원질 종합 (소재 + 주입)
    const primas = [];
    if (A.sigil === 7) primas.push('염');
    if (B.sigil === 7) primas.push('염');
    if (this._fusion2Inject) primas.push(this._fusion2Inject);
    const hasSalt = primas.includes('염'), hasMercury = primas.includes('수은'), hasSulfur = primas.includes('유황');

    // 계승 미리보기 (근사 — 실제 계승은 성장도 정렬)
    const synths = this.unit.checkTraitSynthesis(A.traits || [], B.traits || []);
    const usedInSynth = new Set();
    for (const sy of synths) for (const c of sy.consumed) usedInSynth.add(c);
    const remaining = [...new Set([...(A.traits || []), ...(B.traits || [])].filter(t => !usedInSynth.has(t)))];
    const directSlots = 3 + (hasSalt ? 1 : 0);
    const direct = remaining.slice(0, directSlots);
    const potential = remaining.slice(directSlots);

    // 모순쌍 (합산 풀 기준 예측)
    const contras = this.unit._checkContradictions([...(A.traits || []), ...(B.traits || [])]);

    let html = `
      ${msg ? `<div style="color:#e0a060;font-size:12px;margin:10px 0">▲ ${msg}</div>` : ''}
      <h4 style="margin-left:0">결과 미리보기</h4>
      <div style="text-align:center;padding:12px 0 6px">
        <div style="font-size:18px;color:#fff">${preview.resultUnit}</div>
        <div class="sigeq">印 ${preview.unitA.sigil} <span class="op">×</span> 印 ${preview.unitB.sigil} <span class="op">=</span> <b style="color:#cde">印 ${preview.resultSigilName}</b></div>
        <div style="font-size:12px;color:#889">${A.name} ＋ ${B.name}${this._fusion2Inject ? ` ＋ <span class="v-${this._fusion2Inject}">${this._fusion2Inject} 주입</span>` : ''} · Lv.${preview.resultLevel} (평균)</div>
        <div style="font-size:11px;color:#667;margin-top:2px">※ 5% 확률 합체 사고 — 다른 결과 출현</div>
      </div>
      <h4 style="margin-left:0">계승 3경로 <span style="color:#445">(근사 미리보기)</span></h4>
      <div class="inherit-row"><span class="path p-합성">합성 발동</span><span>${
        synths.length ? synths.map(sy => `<span class="tchip sig">★${sy.name || sy.result}</span>`).join('') : '<span style="color:#556">발동 레시피 없음</span>'
      }</span></div>
      <div class="inherit-row"><span class="path p-직접">직접 계승${hasSalt ? ' (염 +1)' : ''} ×${directSlots}</span><span>${direct.map(t => this.traitChip(t)).join('') || '<span style="color:#556">—</span>'}</span></div>
      <div class="inherit-row"><span class="path p-잠재">잠재력 계승${hasSulfur ? ' (유황 ×2)' : ''}</span><span style="color:#778;font-size:12px">${
        potential.length ? `${potential.length}개 트레잇 임계 인하${hasSulfur ? ' — 두텁게(2배)' : ''}로 다음 세대에` : '없음'
      }</span></div>`;

    if (contras.length) {
      html += `<h4 style="margin-left:0">모순쌍 검출</h4>`;
      for (const c of contras) {
        const willMerge = (c.integrate && c.integrate !== '-') || hasMercury;
        html += `<div class="contra ${willMerge ? 'merge' : 'split'}">
          <div class="ctitle">${c.pair[0]} ⟷ ${c.pair[1]} : ${willMerge ? `통합형${c.integrate && c.integrate !== '-' ? ' → ' + c.integrate : ''}${hasMercury && !(c.integrate && c.integrate !== '-') ? ' (수은이 발동)' : ''}` : `분열형 위험${c.split && c.split !== '-' ? ' → ' + c.split : ''}`}</div>
          <div style="color:#889;margin-top:2px">두 극이 한 몸에 공존한다.</div>
        </div>`;
      }
    }

    html += `<div class="v2-go ${canPay ? '' : 'disabled'}" id="f2-go">◆ 합체 실행 (영혼력 ${cost.toLocaleString()} · 소재 2 소멸)${canPay ? '' : ' — 영혼력 부족'}</div>`;
    box.innerHTML = html;
    this.bindPanelTips();

    const go = box.querySelector('#f2-go');
    if (go && canPay) {
      go.addEventListener('click', () => {
        const r = this.unit.executeFusion(A.instanceId, B.instanceId, { prima: this._fusion2Inject });
        if (!r.success) { this._renderFusion2Result(r.reason); return; }
        this._fusion2A = this._fusion2B = null;
        this._fusion2Inject = null;
        this._hubAddLog(`◆ 합체 — ${r.consumed.join(' + ')} → ${r.result.name}${r.isAccident ? ' (합체 사고!)' : ''} (영혼력 -${r.cost})`, 'tag');
        this._renderFusion2();
        this._renderFusion2Done(r);
      });
    }
  };

  App.prototype._renderFusion2Done = function (r) {
    const box = document.getElementById('f2-result');
    if (!box) return;
    const it = r.inheritedTraits;
    const contraHtml = (r.result.contradictions || []).map(c => `
      <div class="contra ${c.resolution === 'integrate' ? 'merge' : 'split'}">
        <div class="ctitle">${c.pair[0]} ⟷ ${c.pair[1]} : ${c.resolution === 'integrate' ? '통합형' + (c.integrate && c.integrate !== '-' ? ' → ' + c.integrate : '') : '분열형 위험'}</div>
      </div>`).join('');
    box.innerHTML = `
      <h4 style="margin-left:0">합체 완료</h4>
      <div style="text-align:center;padding:14px 0 8px">
        ${r.isAccident ? '<div style="color:#e07070;margin-bottom:4px">⚠ 합체 사고 — 예상과 다른 존재가 태어났다!</div>' : ''}
        <div style="font-size:20px;color:#fff">${r.result.name}</div>
        <div style="font-size:12px;color:#889">印 ${r.result.sigilName || ''} · Lv.${r.result.level}${r.primas.length ? ' · 삼원질: ' + r.primas.join('·') : ''}</div>
      </div>
      <h4 style="margin-left:0">계승 결과</h4>
      <div class="inherit-row"><span class="path p-합성">합성 발동</span><span>${(it.synthesized || []).map(t => this.traitChip(t)).join('') || '<span style="color:#556">없음</span>'}</span></div>
      <div class="inherit-row"><span class="path p-직접">직접 계승</span><span>${(it.direct || []).map(t => this.traitChip(t)).join('') || '<span style="color:#556">없음</span>'}</span></div>
      <div class="inherit-row"><span class="path p-잠재">잠재 인자</span><span style="color:#778;font-size:12px">${(it.potentialTraits || []).length}개 임계 인하</span></div>
      ${contraHtml}
      <div class="v2-go" id="f2-done">확인 — 명부로</div>`;
    this.bindPanelTips();
    box.querySelector('#f2-done').addEventListener('click', () => {
      this._rosterSel = this.engine.state.ownedUnits.findIndex(u => u.instanceId === r.result.instanceId);
      if (this._rosterSel < 0) this._rosterSel = 0;
      this.showUnitRoster();
    });
  };
};
