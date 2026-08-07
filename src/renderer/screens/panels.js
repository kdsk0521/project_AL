'use strict';

// ============================================================
//  v2 패널 공통 인프라 — 전체 화면 패널 열기/닫기 + 키/툴팁
// ============================================================
module.exports = function (App) {

  App.prototype.openPanel = function (screenName, html) {
    this.currentScreen = screenName;
    const el = document.getElementById('panel-screen');
    el.innerHTML = html;
    el.style.display = 'flex';
    // 하단 입력창 포커스 해제 (패널 키 입력 우선)
    const input = document.getElementById('command-input');
    if (input) input.blur();
    if (this._panelKeyHandler) {
      document.removeEventListener('keydown', this._panelKeyHandler);
      this._panelKeyHandler = null;
    }
    return el;
  };

  App.prototype.setPanelKeys = function (fn) {
    if (this._panelKeyHandler) document.removeEventListener('keydown', this._panelKeyHandler);
    this._panelKeyHandler = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      fn(e);
    };
    document.addEventListener('keydown', this._panelKeyHandler);
  };

  App.prototype.closePanel = function () {
    const el = document.getElementById('panel-screen');
    el.style.display = 'none';
    el.innerHTML = '';
    if (this._panelKeyHandler) {
      document.removeEventListener('keydown', this._panelKeyHandler);
      this._panelKeyHandler = null;
    }
    const tip = document.getElementById('v2-tip');
    if (tip) tip.style.display = 'none';
    const input = document.getElementById('command-input');
    if (input) input.focus();
  };

  // 트레잇 칩 HTML (id → 레지스트리 조회, 시그니처 표시)
  App.prototype.traitChip = function (traitId, opts) {
    opts = opts || {};
    const reg = this.engine.data.traits || [];
    const def = reg.find(t => t.id === traitId);
    const name = def ? def.name : traitId;
    const cat = def ? (def.category || '') : '';
    const sigIds = this._variationTraitIds();
    const isSig = sigIds.has(traitId);
    const desc = def ? (def.description || '(설명 미작성)') : '(미등록 트레잇)';
    const tip = `[${cat || '?'}${isSig ? '·시그니처' : ''}] ${desc}`;
    return `<span class="tchip t-${cat} ${isSig ? 'sig' : ''} ${opts.gone ? 'gone' : ''}" data-tip="${tip.replace(/"/g, '&quot;')}" data-tname="${name}">${isSig ? '★' : ''}${name}</span>`;
  };

  App.prototype._variationTraitIds = function () {
    if (!this._varTraitIdSet) {
      this._varTraitIdSet = new Set(this.engine.getVariationRoutes().map(r => r.id));
    }
    return this._varTraitIdSet;
  };

  // data-tip 툴팁 바인딩 (패널 내)
  App.prototype.bindPanelTips = function () {
    const tip = document.getElementById('v2-tip');
    document.querySelectorAll('#panel-screen [data-tip]').forEach(el => {
      el.onmouseenter = () => {
        const name = el.dataset.tname || el.textContent;
        tip.innerHTML = `<div class="tname">${name}</div>${el.dataset.tip}`;
        tip.style.display = 'block';
      };
      el.onmousemove = (e) => {
        const w = tip.offsetWidth, h = tip.offsetHeight;
        let x = e.clientX + 14, y = e.clientY + 14;
        if (x + w > window.innerWidth) x = e.clientX - w - 14;
        if (y + h > window.innerHeight) y = e.clientY - h - 14;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
      };
      el.onmouseleave = () => { tip.style.display = 'none'; };
    });
  };

  // 유닛 배치 위치 라벨
  App.prototype.unitDeployLabel = function (u) {
    if (this.engine.state.party.includes(u.instanceId)) return '파티';
    if (u.assignedFacility) {
      const NAMES = { well: '우물', slimeFarm: '슬라임 농장', fishery: '낚시터', greenhouse: '온실', expeditionHQ: '탐사 경비', workshop: '가공소' };
      return NAMES[u.assignedFacility] || u.assignedFacility;
    }
    return '대기';
  };

  // 변용 요약 {route, degree} | null
  App.prototype.unitVariation = function (u) {
    const v = u.변용도 || {};
    let best = null;
    for (const r of Object.keys(v)) {
      if (v[r] >= 1 && (!best || v[r] > v[best].degree)) best = { route: r, degree: v[r] };
    }
    return best;
  };
};
