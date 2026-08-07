'use strict';

// ============================================================
//  v2 유닛 명부 (ui_mockup_unitlist) — 목록 + 상세 + 정렬/필터
// ============================================================
module.exports = function (App) {

  const GLOBAL_KEYS = [
    ['love', '연모'], ['submission', '복종'], ['lewdness', '음란'], ['fear', '공포'], ['resentment', '반감'],
  ];
  const PART_NAMES = { mouth: '입', chest: '가슴', v: 'V', c: 'C', anal: '애널', skin: '피부' };
  const ROUTES = ['애착', '예속', '탐닉', '붕괴'];
  const ROUTE_MAX = 4;
  const CHIM_KEYS = ['연모', '복종', '음란', '공포', '반감', '고통'];

  App.prototype.showUnitRoster = function () {
    if (this._rosterSel == null) this._rosterSel = 0;
    if (!this._rosterSort) this._rosterSort = 'default';
    if (!this._rosterFilt) this._rosterFilt = 'all';
    this._renderRoster();
  };

  App.prototype._rosterUnits = function () {
    const all = this.engine.state.ownedUnits.map((u, i) => ({ u, i }));
    let arr = all;
    const f = this._rosterFilt;
    if (f === '파티') arr = arr.filter(x => this.unitDeployLabel(x.u) === '파티');
    else if (f === '대기') arr = arr.filter(x => this.unitDeployLabel(x.u) === '대기');
    else if (f === '시설') arr = arr.filter(x => { const d = this.unitDeployLabel(x.u); return d !== '파티' && d !== '대기'; });
    const s = this._rosterSort;
    if (s === 'lv') arr = [...arr].sort((a, b) => b.u.level - a.u.level);
    else if (s === 'aff') arr = [...arr].sort((a, b) => (b.u.affection || 0) - (a.u.affection || 0));
    else if (s === 'route') arr = [...arr].sort((a, b) => {
      const va = this.unitVariation(a.u), vb = this.unitVariation(b.u);
      return (vb ? vb.degree : 0) - (va ? va.degree : 0);
    });
    return arr;
  };

  App.prototype._renderRoster = function () {
    const s = this.engine.state;
    const arr = this._rosterUnits();
    if (arr.length && !arr.some(x => x.i === this._rosterSel)) this._rosterSel = arr[0].i;

    const total = s.ownedUnits.length;
    const party = s.ownedUnits.filter(u => this.unitDeployLabel(u) === '파티').length;
    const idle = s.ownedUnits.filter(u => this.unitDeployLabel(u) === '대기').length;

    const listHtml = arr.map(({ u, i }, pos) => {
      const gs = u.globalState || {};
      let top = GLOBAL_KEYS[0];
      for (const k of GLOBAL_KEYS) if ((gs[k[0]] || 0) > (gs[top[0]] || 0)) top = k;
      const v = this.unitVariation(u);
      const dep = this.unitDeployLabel(u);
      const depHtml = dep === '대기' ? '<span style="color:#566">대기</span>'
        : dep === '파티' ? '<span style="color:#e07050">⚔ 파티</span>'
        : `<span style="color:#8a9">${dep}</span>`;
      const sigCnt = (u.traits || []).filter(t => this._variationTraitIds().has(t)).length;
      return `<div class="v2-u ${i === this._rosterSel ? 'sel' : ''}" data-i="${i}">
        <div class="top">
          <span style="color:#667;width:22px">${pos + 1}.</span>
          <span class="nm">${u.name}</span>
          <span class="race r-${u.category}">${u.category}</span>
          <span style="color:#889;font-size:12px">Lv.${u.level} · ${u.primaryElement || ''}${u.secondaryElement ? '/' + u.secondaryElement : ''}</span>
        </div>
        <div class="sub">
          <span class="c-${top[1]}">${top[1]} ${gs[top[0]] || 0}</span>
          <span class="${v ? 'rt-' + v.route : 'rt-none'}">${v ? `${v.route} ${v.degree}/${ROUTE_MAX}` : '—'}</span>
          <span>호감 ${u.affection || 0}</span>
          ${sigCnt ? `<span style="color:#7fd4ff;font-size:10px">★${sigCnt}</span>` : ''}
          ${u.isKnockedOut ? '<span style="color:#e07070">기절</span>' : ''}
          <span style="margin-left:auto">${depHtml}</span>
        </div>
      </div>`;
    }).join('');

    const html = `
      <div class="v2-header">
        【 <span class="loc">유닛 명부</span> 】 ${s.year}년 ${s.month}월 ${s.day}일
        <span>전체 <span class="soul">${total}</span> · 시설 <span style="color:#8a9">${total - party - idle}</span> · 파티 <span style="color:#e07050">${party}</span> · 대기 <span style="color:#778">${idle}</span></span>
        <span class="soul">영혼력 ${s.soulPower.toLocaleString()}</span>
        <span class="right">파티 ${party}/${s.maxPartySize}</span>
      </div>
      <div class="v2-filter">
        정렬:
        <span class="f ${this._rosterSort === 'default' ? 'on' : ''}" data-sort="default">기본</span>
        <span class="f ${this._rosterSort === 'lv' ? 'on' : ''}" data-sort="lv">레벨</span>
        <span class="f ${this._rosterSort === 'aff' ? 'on' : ''}" data-sort="aff">호감도</span>
        <span class="f ${this._rosterSort === 'route' ? 'on' : ''}" data-sort="route">변용</span>
        &nbsp;|&nbsp; 필터:
        <span class="f ${this._rosterFilt === 'all' ? 'on' : ''}" data-filt="all">전체</span>
        <span class="f ${this._rosterFilt === '시설' ? 'on' : ''}" data-filt="시설">시설</span>
        <span class="f ${this._rosterFilt === '파티' ? 'on' : ''}" data-filt="파티">파티</span>
        <span class="f ${this._rosterFilt === '대기' ? 'on' : ''}" data-filt="대기">대기</span>
      </div>
      <div class="v2-main">
        <div class="v2-list" style="width:46%">${listHtml || '<div style="color:#556;padding:20px">해당하는 유닛이 없다.</div>'}</div>
        <div class="v2-detail" id="roster-detail"></div>
      </div>
      <div class="v2-actions">
        <span class="act" data-cmd="train"><span class="num">[Enter]</span> 조교실로</span>
        <span class="act" data-cmd="party"><span class="num">[B]</span> 파티 편성/해제</span>
        <span class="act" data-cmd="fusion"><span class="num">[F]</span> 합체 소재로</span>
        <span class="act" data-cmd="back"><span class="num">[0]</span> 허브로</span>
        <span style="color:#556;font-size:12px;margin-left:auto">↑↓ 선택 이동 · 트레잇에 마우스</span>
      </div>`;

    const el = this.openPanel('unit_roster', html);
    this._renderRosterDetail();

    el.querySelectorAll('.v2-u').forEach(row => {
      row.addEventListener('click', () => { this._rosterSel = +row.dataset.i; this._renderRoster(); });
    });
    el.querySelectorAll('.v2-filter .f').forEach(f => {
      f.addEventListener('click', () => {
        if (f.dataset.sort) this._rosterSort = f.dataset.sort;
        if (f.dataset.filt) this._rosterFilt = f.dataset.filt;
        this._renderRoster();
      });
    });
    el.querySelectorAll('.v2-actions .act').forEach(a => {
      a.addEventListener('click', () => this._rosterAction(a.dataset.cmd));
    });
    this.setPanelKeys((e) => {
      const arr2 = this._rosterUnits().map(x => x.i);
      const cur = arr2.indexOf(this._rosterSel);
      if (e.key === 'ArrowDown') { e.preventDefault(); this._rosterSel = arr2[(cur + 1) % arr2.length]; this._renderRoster(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this._rosterSel = arr2[(cur - 1 + arr2.length) % arr2.length]; this._renderRoster(); }
      else if (e.key === 'Enter') { e.preventDefault(); this._rosterAction('train'); }
      else if (e.key === 'b' || e.key === 'B') this._rosterAction('party');
      else if (e.key === 'f' || e.key === 'F') this._rosterAction('fusion');
      else if (e.key === '0' || e.key === 'Escape') this._rosterAction('back');
    });
  };

  App.prototype._rosterAction = function (cmd) {
    const u = this.engine.getUnitInstance ? this.engine.state.ownedUnits[this._rosterSel] : null;
    switch (cmd) {
      case 'back': this.showMainHub(); break;
      case 'train': {
        if (!u) return;
        if (u.isKnockedOut) { this._renderRosterDetail('기절 상태의 유닛은 조교할 수 없다.'); return; }
        const check = this.training.canTrain(u);
        if (!check.ok) { this._renderRosterDetail(check.reason); return; }
        this._trainingUnit = u;
        this.closePanel();
        this.showTrainingMenu();
        break;
      }
      case 'party': {
        if (!u) return;
        const s = this.engine.state;
        if (s.party.includes(u.instanceId)) {
          s.party = s.party.filter(id => id !== u.instanceId);
        } else {
          if (u.assignedFacility) { this._renderRosterDetail('시설 배치 중 — 시설에서 해제 후 편성 가능.'); return; }
          if (u.isKnockedOut) { this._renderRosterDetail('기절 상태는 편성할 수 없다.'); return; }
          if (s.party.length >= s.maxPartySize - 1) { this._renderRosterDetail(`파티가 가득 찼다. (최대 ${s.maxPartySize - 1}유닛 + 연금술사)`); return; }
          s.party.push(u.instanceId);
        }
        this._renderRoster();
        break;
      }
      case 'fusion': {
        if (!u) return;
        this._fusion2A = u.instanceId;
        this._fusion2B = null;
        this.showFusion2();
        break;
      }
    }
  };

  App.prototype._renderRosterDetail = function (warnMsg) {
    const box = document.getElementById('roster-detail');
    if (!box) return;
    const u = this.engine.state.ownedUnits[this._rosterSel];
    if (!u) { box.innerHTML = '<div style="color:#445;text-align:center;padding:50px 10px">유닛이 없다.</div>'; return; }

    const gs = u.globalState || {};
    const stage = this.unit.getAffectionStage(u.affection);
    const stageName = stage && stage.name ? stage.name : stage;

    const gRows = GLOBAL_KEYS.map(([k, label]) => {
      const val = Math.round(gs[k] || 0);
      return `<div class="v2-row g-${label}"><span class="lbl">${label}</span><div class="v2-bar"><i style="width:${Math.min(100, val)}%"></i></div><span class="val">${val}</span></div>`;
    }).join('');

    const chim = u.침염 || {};
    const chimHtml = CHIM_KEYS.map(k => {
      const n = chim[k] || 0;
      const dots = '●'.repeat(Math.min(n, 14)) || '<span class="empty">●●</span>';
      return `<b class="c-${k}">${k} ${dots}<span style="color:#667;font-size:11px"> ${n}</span></b>`;
    }).join('&nbsp;&nbsp;');

    const vd = u.변용도 || {};
    const lock = u.변용잠금;
    const routeRows = ROUTES.map(r => {
      const step = vd[r] || 0;
      const active = step >= 1;
      const lockedOut = lock && lock !== r;
      const vt = step >= 1 ? this.engine.getVariationTrait(r, step) : null;
      return `<div class="v2-row" style="${active ? '' : 'opacity:.4'}">
        <span class="lbl rt-${r}">${r}</span>
        <span class="steps rt-${r}"><span class="on">${'■'.repeat(step)}</span><span class="off">${'□'.repeat(ROUTE_MAX - step)}</span></span>
        <span style="color:#778;font-size:11px;margin-left:8px">${active ? `도 ${step}${vt ? ' — ' + vt.name : ''}${lock === r ? ' ★수렴' : ''}` : (lockedOut ? '수렴 잠금' : '')}</span>
      </div>`;
    }).join('');

    const sen = u.sensitivity || {};
    const senHtml = Object.keys(PART_NAMES).map(p => {
      const val = Math.round(sen[p] || 0);
      return `<span style="color:#99a">${PART_NAMES[p]} <b style="color:#9fc9b9;font-weight:normal">${val}</b></span>`;
    }).join(' · ');

    const exp = u.exp || {};
    const traits = (u.traits || []).map(t => this.traitChip(t)).join('');

    box.innerHTML = `
      ${warnMsg ? `<div style="color:#e0a060;font-size:12px;margin-bottom:6px">▲ ${warnMsg}</div>` : ''}
      <h2>${u.name} <span class="race r-${u.category}" style="font-size:13px">${u.category}</span></h2>
      <div class="dline">Lv.${u.level} · 印 ${u.sigilName || this.engine.getSigilName(u.sigil)} · 속성 ${u.primaryElement || '—'}${u.secondaryElement ? '/' + u.secondaryElement : ''}
        · 배치 ${this.unitDeployLabel(u)} · 호감도 ${u.affection || 0} [${stageName}]${u.isKnockedOut ? ' · <span style="color:#e07070">기절</span>' : ''}</div>
      <div style="font-size:12px;color:#889">HP ${u.hp}/${u.maxHp} · 공 ${u.atk} · 방 ${u.def} · 속 ${u.spd}</div>
      <h4>상태 수치</h4>${gRows}
      <h4>침염 (浸染)</h4><div class="chim">${chimHtml}</div>
      <h4>변용 (變容)</h4>${routeRows}
      <h4>부위 감도</h4><div style="font-size:12px">${senHtml}</div>
      <h4>경험치</h4>
      <div style="font-size:12px;color:#99a">전투 <b style="color:#cfc">${exp.combat || 0}</b> · 신체 <b style="color:#cfc">${exp.body || 0}</b> · 성격 <b style="color:#cfc">${exp.personality || 0}</b> · 성인 <b style="color:#cfc">${exp.adult || 0}</b></div>
      <h4>트레잇 <span style="color:#445">(★=시그니처 · 마우스 올리면 설명)</span></h4>
      <div>${traits || '<span style="color:#556;font-size:12px">없음</span>'}</div>`;
    this.bindPanelTips();
  };
};
