'use strict';

// ============================================================
//  v2 삼원질 추출 (ui_mockup_extraction) — 변용 환원
//  좌: 추출 가능 유닛 (변용 도1+) / 우: 體神魂 선택 + 희생 프리뷰
// ============================================================
module.exports = function (App) {

  const KIND_CARDS = {
    '염':   { layer: '體', full: '염(鹽)·체',   cost: '감도 하락 (키운 부위 크게 + 일괄)' },
    '수은': { layer: '神', full: '수은(汞)·신', cost: '숙련도 레벨 -1 · 경험치 -25%' },
    '유황': { layer: '魂', full: '유황(硫)·혼', cost: '트레잇 1칸 비우기 (선택)' },
  };

  App.prototype.showExtraction = function () {
    this._extSel = null;
    this._extKind = null;
    this._extTrait = null;
    this._renderExtraction();
  };

  App.prototype._renderExtraction = function () {
    const s = this.engine.state;
    const ex = this.extraction;
    const all = s.ownedUnits;
    const prima = s.prima || {};

    const listHtml = all.map((u, i) => {
      const v = this.unitVariation(u);
      const ok = !!v;
      return `<div class="v2-u ${i === this._extSel ? 'sel' : ''} ${ok ? '' : 'no'}" data-i="${i}" data-ok="${ok}">
        <div class="top"><span class="race r-${u.category}">${u.category}</span> <span class="nm">${u.name}</span>
          <span style="color:#667;font-size:11px">Lv.${u.level}</span></div>
        <div class="sub"><span class="${v ? 'rt-' + v.route : 'rt-none'}">${v ? `변용: ${v.route} 도${v.degree}` : '변용 없음 — 추출 불가'}</span></div>
      </div>`;
    }).join('');

    const html = `
      <div class="v2-header">
        【 <span class="loc">연성진 · 삼원질 추출</span> 】 ${s.year}년 ${s.month}월 ${s.day}일
        <span style="color:#889;font-size:12px">변용을 되돌려 본질을 정련</span>
        <span class="soul">영혼력 ${s.soulPower.toLocaleString()}</span>
        <span class="sigil">비축: <span class="v-염">염 ×${prima['염'] || 0}</span> · <span class="v-수은">수은 ×${prima['수은'] || 0}</span> · <span class="v-유황">유황 ×${prima['유황'] || 0}</span></span>
        <span class="right" style="cursor:pointer" data-cmd="tofusion">[합체로 →]</span>
      </div>
      <div class="v2-main">
        <div class="v2-list" style="width:30%">
          <h4>추출 가능 <span style="color:#445">(변용 도 1+)</span></h4>
          ${listHtml || '<div style="color:#556;padding:20px;font-size:12px">유닛이 없다.</div>'}
        </div>
        <div class="v2-detail" id="ext-panel"></div>
      </div>
      <div class="v2-actions">
        <span class="act" data-cmd="back"><span class="num">[0]</span> 허브로</span>
        <span style="color:#556;font-size:12px;margin-left:auto">유닛 선택 → 體神魂 선택 → 희생 미리보기 → 실행 · 호감도·印은 보존</span>
      </div>`;

    const el = this.openPanel('extraction', html);
    this._renderExtPanel();

    el.querySelectorAll('.v2-u').forEach(row => {
      row.addEventListener('click', () => {
        if (row.dataset.ok !== 'true') return;
        this._extSel = +row.dataset.i;
        this._extKind = null;
        this._extTrait = null;
        this._renderExtraction();
      });
    });
    el.querySelector('[data-cmd="back"]').addEventListener('click', () => this.showMainHub());
    el.querySelector('[data-cmd="tofusion"]').addEventListener('click', () => this.showFusion2(true));
    this.setPanelKeys((e) => { if (e.key === '0' || e.key === 'Escape') this.showMainHub(); });
  };

  App.prototype._renderExtPanel = function (msg) {
    const box = document.getElementById('ext-panel');
    if (!box) return;
    if (this._extSel == null) {
      box.innerHTML = '<div style="color:#445;text-align:center;padding:50px 10px">왼쪽에서 유닛을 고르세요.</div>';
      return;
    }
    const ex = this.extraction;
    const u = this.engine.state.ownedUnits[this._extSel];
    const v = this.unitVariation(u);
    if (!v) { box.innerHTML = '<div style="color:#445;padding:40px">변용이 없다.</div>'; return; }

    const sigGone = ex.routeSignatureTraits(u, v.route);
    const kind = this._extKind;
    const ready = kind && (kind !== '유황' || this._extTrait);

    let previewHtml = '<span style="color:#556">삼원질 종류를 고르세요.</span>';
    if (kind === '염' || kind === '수은') {
      const rows = ex.preview(u, kind);
      previewHtml = rows.length ? rows.map(r =>
        `<div class="v2-row"><span class="lbl" style="width:auto;min-width:110px">${r.what}</span><span class="val" style="width:auto">${r.from} → <span style="color:#e07070">${r.to}</span></span></div>`
      ).join('') : '<span style="color:#778">희생할 것이 거의 없다. (그래도 추출 가능)</span>';
      if (kind === '염') previewHtml += '<div style="color:#778;margin-top:4px;font-size:11px">◆ = 키운 부위(감도 60+)는 크게, 나머지는 일괄 −12 (잠정)</div>';
    } else if (kind === '유황') {
      const cand = ex.removableTraits(u);
      previewHtml = cand.length
        ? `<div style="color:#aab;margin-bottom:4px;font-size:12px">비울 트레잇 1칸 선택 — 칸을 비워 새 트레잇 여지 확보</div>
           <div class="pick-t">${cand.map(t => `<span class="tchip t-${t.category} ${this._extTrait === t.id ? 'chosen' : ''}" data-t="${t.id}">${t.name}</span>`).join('')}</div>`
        : '<span style="color:#e0a060">비울 수 있는 트레잇이 없다. (시그니처 제외)</span>';
    }

    box.innerHTML = `
      ${msg ? `<div style="color:#e0a060;font-size:12px;margin:8px 0">▲ ${msg}</div>` : ''}
      <div style="padding:12px 0 4px">
        <div style="font-size:18px;color:#fff">${u.name} <span class="race r-${u.category}">${u.category}</span></div>
        <div style="font-size:12px;color:#889">Lv.${u.level} · 변용 <span class="rt-${v.route}">${v.route} 도${v.degree}</span></div>
      </div>
      <div style="border-top:1px solid #1e1e1e;padding:8px 0">
        <div style="color:#778;font-size:12px;margin-bottom:4px;letter-spacing:1px">공통 대가 (어느 종류든)</div>
        <div class="loss"><span class="x">✕</span> 변용 리셋 — <span class="rt-${v.route}">${v.route}</span> 침염·도 소거 → <b style="color:#9a9">수렴 잠금 해제 (다른 루트 재개방)</b></div>
        <div class="loss"><span class="x">✕</span> 루트 시그니처 상실: ${sigGone.length ? sigGone.map(t => `<span class="tchip gone">${t.name}</span>`).join(' ') : '<span style="color:#556">없음</span>'}</div>
        <div class="loss"><span class="x">✕</span> 영혼력 <b style="color:#b88">${ex.SOUL_COST.toLocaleString()}</b></div>
        <div class="loss" style="color:#7a9">＝ 보존: 호감도 · 印 (로어/엔딩 해금)</div>
      </div>
      <div style="border-top:1px solid #1e1e1e;padding:8px 0">
        <div style="color:#778;font-size:12px;margin-bottom:4px;letter-spacing:1px">정련할 삼원질 — 體神魂 중 하나 (= 희생 층)</div>
        <div class="prima3">${['염', '수은', '유황'].map(k => `
          <div class="pcard k${k} ${kind === k ? 'on' : ''}" data-k="${k}">
            <div class="pn">${KIND_CARDS[k].full}</div>
            <div class="layer">${KIND_CARDS[k].layer} 층</div>
            <div class="cost">− ${KIND_CARDS[k].cost}</div>
          </div>`).join('')}</div>
      </div>
      <div style="border-top:1px solid #1e1e1e;padding:8px 0">
        <div style="color:#778;font-size:12px;margin-bottom:4px;letter-spacing:1px">희생 미리보기</div>
        <div style="font-size:12px">${previewHtml}</div>
      </div>
      <div class="v2-go ${ready ? '' : 'disabled'}" id="ext-go">${
        kind ? (kind === '유황' && !this._extTrait ? '비울 트레잇을 고르세요' : `◆ ${kind} 추출 — 삼원질 ${kind} ×1 획득 (영혼력 ${ex.SOUL_COST.toLocaleString()})`) : '삼원질 종류 선택 필요'
      }</div>`;

    box.querySelectorAll('.pcard').forEach(c => {
      c.addEventListener('click', () => { this._extKind = c.dataset.k; this._extTrait = null; this._renderExtPanel(); });
    });
    box.querySelectorAll('.pick-t .tchip').forEach(t => {
      t.addEventListener('click', () => { this._extTrait = t.dataset.t; this._renderExtPanel(); });
    });
    const go = box.querySelector('#ext-go');
    if (go && ready) {
      go.addEventListener('click', () => {
        const r = this.extraction.execute(u.instanceId, kind, { traitId: this._extTrait });
        if (!r.success) { this._renderExtPanel(r.reason); return; }
        this._hubAddLog(`◆ 삼원질 추출 — ${u.name}에서 ${kind} ×1 정련. (${r.detail.route} 변용 리셋)`, 'tag');
        this._extSel = null;
        this._extKind = null;
        this._extTrait = null;
        this._renderExtraction();
      });
    }
  };
};
