'use strict';

// ============================================================
//  삼원질 추출 (변용 환원) — system_sigil_extraction.md v0.1
//  변용 도 1+ 유닛에서 삼원질(염/수은/유황)을 정련.
//  공통 대가: 변용 리셋(침염·도 소거, 수렴 잠금 해제) + 루트 시그니처 상실 + 영혼력.
//  종류별 대가 = 體神魂 층 (염=감도 / 수은=역가·경험 / 유황=트레잇 1칸).
//  보존: 호감도 · 印. 수치 전부 잠정(통합 밸런싱 패스).
// ============================================================

// 루트 → 소거할 침염 종류
const ROUTE_CHIMYEOM = {
  '애착': ['연모'],
  '예속': ['복종'],
  '탐닉': ['음란'],
  '붕괴': ['공포', '반감', '고통'],
};

const KINDS = ['염', '수은', '유황'];

const KIND_INFO = {
  '염':   { layer: '體', full: '염(鹽)·체',   desc: '굳혀 뽑음 — 감도 하락 (키운 부위 크게, 나머지 일괄)' },
  '수은': { layer: '神', full: '수은(汞)·신', desc: '흘려 뽑음 — 숙련도 레벨 -1 · 경험치 -25%' },
  '유황': { layer: '魂', full: '유황(硫)·혼', desc: '태워 뽑음 — 트레잇 1칸 비우기 (시그니처 外 선택)' },
};

class ExtractionSystem {
  constructor(engine) {
    this.engine = engine;
    this.SOUL_COST = 1200;          // 잠정
    this.SEN_HIGH_THRESHOLD = 60;   // 잠정: 이상이면 "키운 부위" 취급
    this.SEN_HIGH_MULT = 0.4;       // 키운 부위 ×0.4
    this.SEN_FLAT_DROP = 12;        // 나머지 일괄 -12
    this.EXP_KEEP_RATIO = 0.75;     // 수은: 경험치 75% 유지
  }

  // ── 자격: 변용 도 1 이상 (가장 깊은 루트) ──
  getRoute(unit) {
    const v = unit.변용도 || {};
    let best = null;
    for (const r of Object.keys(v)) {
      if (v[r] >= 1 && (!best || v[r] > v[best])) best = r;
    }
    return best ? { route: best, degree: v[best] } : null;
  }

  eligibleUnits() {
    return (this.engine.state.ownedUnits || []).filter(u => this.getRoute(u));
  }

  // 루트의 시그니처 트레잇 (변용으로 획득한 칸 — 추출 시 회수)
  routeSignatureTraits(unit, route) {
    const rows = this.engine.getVariationRoutes().filter(r => r.route === route);
    const ids = new Set(rows.map(r => r.id));
    return (unit.traits || []).filter(t => ids.has(t)).map(id => {
      const row = rows.find(r => r.id === id);
      return { id, name: row ? row.name : id };
    });
  }

  // 유황: 비울 수 있는 트레잇 (변용 시그니처 外)
  removableTraits(unit) {
    const sigIds = new Set(this.engine.getVariationRoutes().map(r => r.id));
    const reg = this.engine.data.traits || [];
    return (unit.traits || []).filter(t => !sigIds.has(t)).map(id => {
      const def = reg.find(x => x.id === id);
      return { id, name: def ? def.name : id, category: def ? (def.category || '') : '' };
    });
  }

  // ── 미리보기: 종류별 희생 내역 ──
  preview(unit, kind) {
    const rows = [];
    if (kind === '염') {
      const sen = unit.sensitivity || {};
      const NAMES = { mouth: '입', chest: '가슴', v: 'V', c: 'C', anal: '애널', skin: '피부' };
      for (const p of Object.keys(NAMES)) {
        const cur = sen[p] || 0;
        if (cur <= 0) continue;
        const high = cur >= this.SEN_HIGH_THRESHOLD;
        const after = high ? Math.round(cur * this.SEN_HIGH_MULT) : Math.max(0, cur - this.SEN_FLAT_DROP);
        rows.push({ what: '감도 ' + NAMES[p] + (high ? ' ◆' : ''), from: cur, to: after });
      }
    } else if (kind === '수은') {
      if (unit.역가) {
        for (const grp of ['숙련', '내성', '공격숙련', '방어숙련']) {
          const g = unit.역가[grp];
          if (!g) continue;
          for (const k of Object.keys(g)) {
            if (g[k] > 0) rows.push({ what: grp + '.' + k, from: g[k], to: g[k] - 1 });
          }
        }
      }
      const POOL_NAMES = { combat: '전투', body: '신체', personality: '성격', adult: '성인' };
      for (const pool of Object.keys(unit.exp || {})) {
        const cur = unit.exp[pool] || 0;
        if (cur > 0) rows.push({ what: '경험치 ' + (POOL_NAMES[pool] || pool), from: cur, to: Math.floor(cur * this.EXP_KEEP_RATIO) });
      }
    } else if (kind === '유황') {
      for (const t of this.removableTraits(unit)) {
        rows.push({ what: '트레잇 후보', name: t.name, id: t.id, category: t.category });
      }
    }
    return rows;
  }

  // ── 실행 ──
  // opts.traitId: 유황일 때 비울 트레잇
  execute(unitInstanceId, kind, opts = {}) {
    this.engine.ensureV2State();
    const unit = this.engine.getUnitInstance(unitInstanceId);
    if (!unit) return { success: false, reason: '유닛을 찾을 수 없습니다.' };

    const info = this.getRoute(unit);
    if (!info) return { success: false, reason: '변용 도 1 이상인 유닛만 추출할 수 있습니다.' };
    if (!KINDS.includes(kind)) return { success: false, reason: '삼원질 종류를 선택하세요.' };
    if (this.engine.state.soulPower < this.SOUL_COST) {
      return { success: false, reason: '영혼력이 부족합니다. (필요 ' + this.SOUL_COST + ')' };
    }
    if (kind === '유황') {
      if (!opts.traitId) return { success: false, reason: '비울 트레잇을 선택하세요.' };
      const ok = this.removableTraits(unit).some(t => t.id === opts.traitId);
      if (!ok) return { success: false, reason: '비울 수 없는 트레잇입니다. (시그니처 또는 미보유)' };
    }

    const route = info.route;
    const detail = { route, degree: info.degree, lostSignatures: [], kindLoss: [] };

    // ── 공통 대가: 변용 리셋 ──
    detail.lostSignatures = this.routeSignatureTraits(unit, route);
    const lostIds = new Set(detail.lostSignatures.map(t => t.id));
    unit.traits = (unit.traits || []).filter(t => !lostIds.has(t));
    for (const g of ROUTE_CHIMYEOM[route] || []) {
      if (unit.침염) delete unit.침염[g];
    }
    if (unit.변용도) delete unit.변용도[route];
    if (unit.변용잠금 === route) delete unit.변용잠금; // 수렴 잠금 해제 → 타 루트 재개방
    this.engine.state.soulPower -= this.SOUL_COST;

    // ── 종류별 대가 (體神魂) ──
    if (kind === '염') {
      const sen = unit.sensitivity || {};
      for (const p of Object.keys(sen)) {
        const cur = sen[p] || 0;
        if (cur <= 0) continue;
        const high = cur >= this.SEN_HIGH_THRESHOLD;
        const after = high ? Math.round(cur * this.SEN_HIGH_MULT) : Math.max(0, cur - this.SEN_FLAT_DROP);
        if (after !== cur) {
          detail.kindLoss.push({ what: '감도 ' + p, from: cur, to: after });
          sen[p] = after;
        }
      }
    } else if (kind === '수은') {
      if (unit.역가) {
        for (const grp of ['숙련', '내성', '공격숙련', '방어숙련']) {
          const g = unit.역가[grp];
          if (!g) continue;
          for (const k of Object.keys(g)) {
            if (g[k] > 0) {
              detail.kindLoss.push({ what: grp + '.' + k, from: g[k], to: g[k] - 1 });
              g[k]--;
            }
          }
        }
      }
      for (const pool of Object.keys(unit.exp || {})) {
        const cur = unit.exp[pool] || 0;
        if (cur > 0) {
          const after = Math.floor(cur * this.EXP_KEEP_RATIO);
          detail.kindLoss.push({ what: '경험치 ' + pool, from: cur, to: after });
          unit.exp[pool] = after;
        }
      }
    } else { // 유황
      const idx = unit.traits.indexOf(opts.traitId);
      if (idx !== -1) {
        const reg = this.engine.data.traits || [];
        const def = reg.find(x => x.id === opts.traitId);
        detail.kindLoss.push({ what: '트레잇 상실', name: def ? def.name : opts.traitId, id: opts.traitId });
        unit.traits.splice(idx, 1);
      }
    }

    // ── 산출: 삼원질 1개 ──
    this.engine.state.prima[kind] = (this.engine.state.prima[kind] || 0) + 1;

    return { success: true, kind, unit: unit.name, detail, soulCost: this.SOUL_COST, stock: { ...this.engine.state.prima } };
  }
}

ExtractionSystem.KINDS = KINDS;
ExtractionSystem.KIND_INFO = KIND_INFO;

module.exports = ExtractionSystem;
