# -*- coding: utf-8 -*-
"""트레잇 체인 뷰어 빌더 — synthesis_chains.csv + cross_staging.csv + traits.csv → trait_tree.html
실행: python3 design/tools/build_trait_tree.py (project_AL 루트에서)"""
import re, json, os
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
P = lambda *a: os.path.join(ROOT, *a)

id2name = {}; names = set(); tierOf = {}
for l in open(P('src/game/balance/traits.csv'), encoding='utf-8').read().split('\n'):
    if re.match(r'^[A-Z]', l):
        f = l.split(','); id2name[f[0]] = f[1]; names.add(f[1]); tierOf[f[1]] = f[3]

edges = {}
for l in open(P('src/game/balance/traitSynthesis.csv'), encoding='utf-8').read().split('\n'):
    if re.match(r'^(TSYN|SYN_)', l):
        f = l.split(',')
        mats = [id2name.get(x.strip(), x.strip()) for x in f[2].split(';')]
        edges.setdefault(f[1], []).append({'mats': mats, 'src': '동일계', 'tier': 'T' + str(f[5])})
cross = []
for l in open(P('design/cross_staging.csv'), encoding='utf-8').read().split('\n'):
    if not l or l.startswith(';') or l.startswith('sec|'): continue
    f = l.split('|')
    merged = f[10].startswith('[병합') or f[10].startswith('[교체') or f[10].startswith('[선천 편입')
    cross.append({'sec': f[0], 'src': f[1], 'm1': f[2], 'm2': f[4], 'result': f[6], 'cat': f[7],
                  'tier': int(f[8][1]), 'down': f[9] == '⬇', 'eff': f[10], 'merged': merged})
    if not merged:
        edges.setdefault(f[6], []).append({'mats': [f[2], f[4]], 'src': '교차', 'tier': f[8]})
chains = []
STEP_RE = re.compile(r'^(.+?)\(T(\d)\)$')
def _nm(n):
    n = n.strip()
    if n in names: return n  # 레지스트리 정식명(괄호 포함) 우선 — 무감정(표면) 등
    return re.sub(r'\((?!T\d).+?\)\s*$', '', n).strip()
for l in open(P('design/synthesis_chains.csv'), encoding='utf-8').read().split('\n'):
    if not l or l.startswith(';') or l.startswith('cat|'): continue
    f = l.split('|')
    if len(f) < 8: continue
    cat, lane, face, fruit, tier, chain, status, note = f[:8]
    fruit = _nm(fruit) if '⟷' not in fruit else fruit
    steps = []
    fork = None
    fm = re.search(r'통합 (.+?) / 분열 (.+)$', chain)
    if '모순' in chain or '⟷' in fruit:
        poles = [_nm(x) for x in fruit.split('⟷')] if '⟷' in fruit else []
        fork = {'poles': poles, 'integ': _nm(fm.group(1)) if fm else None, 'split': _nm(fm.group(2)) if fm else None}
    if '=>' in chain and '모순' not in chain:
        for st in chain.split(' / '):
            left, right = st.split('=>')
            bases = [_nm(b) for b in left.split('+')]
            rm = STEP_RE.match(right.strip())
            if not rm: continue
            result = _nm(rm.group(1))
            steps.append(bases + [result, int(rm.group(2))])
            edges.setdefault(result, []).append({'mats': bases, 'src': '체인', 'tier': 'T' + rm.group(2)})
    chains.append({'cat': cat, 'lane': lane, 'face': face, 'fruit': fruit, 'tier': tier,
                   'steps': steps, 'fork': fork, 'status': status, 'note': note, 'chainRaw': chain})

corpus = set(r['result'] for r in cross)
for name, recs in edges.items():
    if any(r['src'] == '동일계' for r in recs): corpus.add(name)
def _norm(n):
    import re as _re
    return _re.sub(r'\(.+?\)$', '', n)
pend_all = set()
for c in chains:
    for st in c['steps']:
        for n in st[:-1]:
            if isinstance(n, str) and n not in names and _norm(n) not in names and '신규 뿌리' not in n:
                pend_all.add(n)
# 엣지 우선순위 정렬: 체인(신) > 교차 > 동일계(구) — 구 직행이 대표로 그려지는 점프 버그 수정
_PRIO = {'체인': 0, '교차': 1, '동일계': 2}
for _k in edges:
    edges[_k].sort(key=lambda r: _PRIO.get(r['src'], 9))
    # 구 직행 억제: 체인 버전이 있으면 동일계(구 TSYN 직행) 레시피는 표시 제외 (편입 시 교체 예정)
    if any(r['src'] == '체인' for r in edges[_k]):
        edges[_k] = [r for r in edges[_k] if r['src'] != '동일계']
# 공식 점프 감지 (v3): T4인데 재료 전부 T2 이하 / 결과-최고재료 차 2+
def _tier_of(n):
    n2 = _nm(n)
    if n2 in tierOf: return int(tierOf[n2])
    return None
jump = set()
for _k, recs in edges.items():
    rt = _tier_of(_k)
    if rt is None: continue
    for r in recs:
        mts = [_tier_of(m) for m in r['mats']]
        if any(m is None for m in mts): continue
        if rt <= 1: jump.add(f"{_k}(T{rt}) ← {'+'.join(r['mats'])} [{r['src']}] ※T1 산출 금지")
        elif rt >= 4 and max(mts) <= 2: jump.add(f"{_k}(T{rt}) ← {'+'.join(r['mats'])} [{r['src']}]")
        elif rt == 3 and max(mts) <= 1: jump.add(f"{_k}(T{rt}) ← {'+'.join(r['mats'])} [{r['src']}] ※T1+T1→T3")
        elif rt - max(mts) >= 3: jump.add(f"{_k}(T{rt}) ← {'+'.join(r['mats'])} [{r['src']}]")
# T2 종착 경계 (규칙⑥): 합성 산출 T2인데 상위 소비처 없음
mat_used = set()
for result, recs in edges.items():
    for r in recs:
        for m4 in r['mats']: mat_used.add(_nm(m4))
t2_dead = sorted(set(r['result'] for r in cross if r['tier'] == 2 and not r.get('merged') and r['result'] not in mat_used))
# 동일 재료 → 복수 결과 감지 (supersede 제외)
_pairs = {}
for result, recs in edges.items():
    for r in recs:
        key = frozenset(_nm(m5) for m5 in r['mats'])
        _pairs.setdefault(key, set()).add(result)
_KNOWN = {'완전속박','해부학적 약점','군림','매혹술','충의','감각폭풍','마비독체질','감각차폐'}  # 편입 시 구 레시피 교체 예정
forks_list = sorted(' + '.join(sorted(k)) + ' → ' + ' / '.join(sorted(v)) for k, v in _pairs.items() if len(v - _KNOWN) >= 2 or (len(v) >= 2 and not (v & _KNOWN)))
# 베이스 불가침 위반 감지 (규칙⑦)
import io as _io
_bv = []
for _l in open(P('src/game/balance/traits.csv'), encoding='utf-8'):
    _m = re.search(r'stat\|(ATK|DEF|HP|속도)\|add\|(-?[\d.]+)(?!\|scaleBy)', _l)
    if _m and re.match(r'^[A-Z]', _l): _bv.append(_l.split(',')[1] + ': ' + _m.group(0))
# T4 단일 영역 감지 (규칙⑧)
_t4solo = []
_sec4 = None
for _l in open(P('src/game/balance/traits.csv'), encoding='utf-8').read().split('\n'):
    _m4 = re.match(r'^\[(\w+)\]$', _l)
    if _m4: _sec4 = _m4.group(1); continue
    if re.match(r'^[A-Z]', _l):
        _f = _l.split(',')
        if _f[3] != '4': continue
        if _sec4 == 'combat':
            _eff, _br = _f[12], _f[13]; _sk = _f[10] not in ('', '0', 'None')
        else:
            _eff, _br = _f[8], _f[9]; _sk = False
        _d = set(re.findall(r'(조교|관계|생활|탐사)\|', _eff))
        if _br.strip() or _sk: _d.add('전투')
        if len(_d) <= 1: _t4solo.append(_f[1])
pending = {
 '순수 신규 잠정명 (이름·효과 확정 필요)': sorted(pend_all - corpus - names),
 '코퍼스 존재·레지스트리 미편입 (DSL 인코딩 대기)': sorted(pend_all & corpus),
 '뿌리 없음': [],  # 자 속성 → 적동(BT 금속)이 뿌리 담당으로 해소 (2026-07-17)
 '잎 미확정': ['PT 모순 미선정 2쌍', 'CT 원소 격자 잎 — 이름 확정·효과 미저작', 'PT 모순 잎 8 = 이름 확정(제월·변광·긍지·자기기만·중용·일탈·항심·범람) — 효과 미저작'],
 '⚠T2 종착 경계 (규칙⑥ 위반 — 상위 소비처 지정 필요)': t2_dead,
 '⚠동일 재료 분기 (의도 분기 외 신규 발생 감시)': forks_list,
 '⚠공식 점프 감지 (구 직행 레시피 — 편입 시 교체·재티어 대상)': sorted(jump),
 '⚠T4 단일 영역 (규칙⑧ — 영역 교차 의무)': _t4solo,
 '⚠베이스 불가침 위반 (규칙⑦ — base 스탯 add 금지)': _bv,
 '해소된 충돌 (2026-07-17)': ['달관→제월/변광', '용린→각린', '점액체질→감로체질', '폭주→일탈', '임계돌파→한계돌파 병합'],
}
# 뿌리·몸통 명부 + 역방향 쓰임 맵
cat_kr = {'combat': 'CT', 'personality': 'PT', 'adult': 'AT', 'body': 'BT'}
bases = []
sec2 = None
for l in open(P('src/game/balance/traits.csv'), encoding='utf-8').read().split('\n'):
    m2 = re.match(r'^\[(\w+)\]$', l)
    if m2: sec2 = m2.group(1); continue
    if re.match(r'^[A-Z]', l):
        f2 = l.split(',')
        if f2[3] in ('1', '2'):
            if sec2 == 'combat':
                # 스킬 판정: effects/bridges 또는 스킬 데이터(배율>0 or AP>0 능동)
                try: dmg = float(f2[10] or 0)
                except: dmg = 0
                fn = bool((f2[12] + f2[13]).strip()) if len(f2) > 13 else False
                fn = fn or dmg > 0
                kind = '스킬' if dmg > 0 else ('패시브' if fn else '')
            else:
                fn = bool((f2[8] + f2[9]).strip()) if len(f2) > 9 else False
                kind = '효과' if fn else ''
            acq = f2[7] if len(f2) > 7 else ''
            bases.append({'name': f2[1], 'cat': cat_kr[sec2], 'tier': f2[3], 'fn': fn, 'kind': kind, 'exempt': acq == '변용'})
usage = {}
for result, recs in edges.items():
    for r in recs:
        for m3 in r['mats']:
            usage.setdefault(_nm(m3), []).append(result)
for c in chains:
    if c.get('fork') and c['fork']['poles']:
        for pole in c['fork']['poles']:
            if c['fork']['integ']: usage.setdefault(pole, []).append('☯' + c['fork']['integ'] + '/✸' + c['fork']['split'])
D = {'chains': chains, 'cross': cross, 'edges': edges, 'regNames': sorted(names), 'tierOf': tierOf, 'pending': pending, 'bases': bases, 'usage': usage}

HTML_HEAD = '''<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<title>AL 트레잇 체인 뷰어 v3.1 — 전 카테고리</title>
<style>
body{background:#0e0e14;color:#ccd;font-family:'Malgun Gothic',sans-serif;margin:20px}
h1{font-size:20px;color:#e8d5a0;margin-bottom:2px} .sub{color:#667;font-size:12px;margin-bottom:14px}
.tabs button{background:#1a1a26;color:#99a;border:1px solid #33334a;padding:7px 16px;border-radius:6px;cursor:pointer;font-size:13px;margin-right:6px}
.tabs button.on{background:#2e2818;color:#e8d5a0;border-color:#a08030}
.legend{margin:10px 0 12px;font-size:12px} .legend span{margin-right:12px}
.pending{background:#16161f;border:1px solid #3a331a;border-radius:8px;padding:10px 14px;font-size:12px;color:#9aa;margin-bottom:16px}
.pending h4{margin:4px 0;color:#cb7;font-size:12px} .pending .chip{margin:2px}
.cat{margin-bottom:30px} .cat>h2{font-size:17px;color:#e8d5a0;border-bottom:2px solid #3a3a50;padding-bottom:5px}
.lane{margin:14px 0} .lane>h3{font-size:14px;color:#9ab;margin:8px 0 6px}
.chains{display:flex;flex-wrap:wrap;gap:12px}
.card{background:#16161f;border:1px solid #2a2a3a;border-radius:8px;padding:12px 14px;min-width:340px;flex:1;max-width:560px}
.card h3{margin:0 0 8px;font-size:14px} .face{color:#778;font-size:11px;margin-left:6px}
.flow{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin:5px 0}
.d1{margin-left:20px} .d2{margin-left:40px} .d3{margin-left:60px}
.chip{padding:3px 9px;border-radius:12px;font-size:12px;background:#22222e;border:1px solid #33334a}
.t1{border-color:#4a4a52;background:#1b1b21;color:#8a8a94} .t2{border-color:#2e6a50;background:#132018;color:#8ecfae}
.t3{background:#262214;border-color:#7a6a30}
.fruit{border-color:#a08030;background:#2e2818;color:#e8d5a0;font-weight:bold}
.t5{border-color:#8040a0;background:#241830;color:#d5b0e8}
.newp{border-style:dashed;color:#c90} .uning{border-style:dotted;border-color:#4a6a8a;color:#8ac}
.miss{border-style:dashed;border-color:#a04040;color:#e07070} .ok{border-color:#2a5a3a;color:#8c9}
.arrow{color:#556;font-size:12px} .srcTag{font-size:10px;color:#567;margin-left:4px}
.tcell{display:inline-block;min-width:26px;text-align:center;font-size:10px;color:#778;border-right:2px solid #2a2a3a;margin-right:8px;padding-right:6px}
.tc1{border-right-color:#3a3a44} .tc2{border-right-color:#3a4a3a} .tc3{border-right-color:#7a6a30} .tc4{border-right-color:#a08030} .tc5{border-right-color:#8040a0}
.badge{font-size:10px;padding:1px 7px;border-radius:8px;margin-left:5px}
.b교차{background:#16283a;color:#8ac} .b동일계{background:#16332a;color:#8ca} .b체인{background:#2e2818;color:#cb8}
.metal{border-color:#8a6a3a;background:#221c12;color:#d8b88a}
.note{font-size:11px;color:#889;margin-top:6px} .eff{font-size:11px;color:#9a9;margin-top:4px}
.st{float:right;font-size:11px;padding:2px 8px;border-radius:10px}
.st확정{background:#1a3a22;color:#7c9} .st잠정{background:#3a331a;color:#cb7}
.st승격{background:#1a2a3a;color:#7ac} .st뿌리{background:#3a1a1a;color:#e77} .st철회{background:#2a1a30;color:#b8a}
.st잎{background:#33202a;color:#c8a} .st공석{background:#26262e;color:#889}
.filter{margin:0 0 12px} .filter select{font-size:12px;background:#1a1a26;color:#aab;border:1px solid #33334a;border-radius:4px;padding:4px}
</style></head><body>
<h1>AL 트레잇 체인 뷰어 v3.1</h1>
<div class="sub">공식: T3=베이스2(비대칭) / T4=T3+T2(합성 최대) / T5=합성 불가(순수 유닛) · 충돌 5건 해소(2026-07-17) · 정본=synthesis_chains.csv v0.3 + cross_staging.csv v0.2 · 재생성: python3 design/tools/build_trait_tree.py</div>
<div class="tabs"><button id="tabA" class="on" onclick="show('A')">열매 체인</button><button id="tabB" onclick="show('B')">교차 코퍼스</button><button id="tabC" onclick="show('C')">뿌리·몸통 T1·T2</button></div>
<div class="legend"><span class="chip t1">T1 뿌리</span><span class="chip t2">T2 몸통</span><span class="chip t3">T3 가지</span><span class="chip fruit">T4 열매</span><span class="chip t5">T5(합성 불가)</span><span class="chip newp">순수 신규 잠정명</span><span class="chip uning">코퍼스 미편입</span><span class="chip metal">✦ 금속 재료</span><span class="badge b교차">♻ 교차</span><span class="badge b동일계">♻ 동일계</span> <span style="color:#667">— ♻=기존 레시피 재활용, 왼쪽 칸=층</span></div>
<div class="pending" id="pendBox"></div>
<div id="viewA"></div>
<div id="viewB" style="display:none">
<div class="filter">섹션 <select id="fSec" onchange="renderB()"><option value="">전체</option></select>
카테고리 <select id="fCat" onchange="renderB()"><option value="">전체</option><option>CT</option><option>PT</option><option>AT</option><option>BT</option></select>
티어 <select id="fTier" onchange="renderB()"><option value="">전체</option><option value="1">T1</option><option value="2">T2</option><option value="3">T3</option><option value="4">T4</option></select></div>
<div id="crossCards"></div></div>
<div id="viewC" style="display:none">
<div class="filter">카테고리 <select id="cCat" onchange="renderC()"><option value="">전체</option><option>CT</option><option>PT</option><option>AT</option><option>BT</option></select>
티어 <select id="cTier" onchange="renderC()"><option value="">T1+T2</option><option value="1">T1</option><option value="2">T2</option></select>
쓰임 <select id="cUse" onchange="renderC()"><option value="">전체</option><option value="y">사다리 참여</option><option value="s">단독 완결(스킬·효과)</option><option value="n">무기능(효과 미저작)</option></select></div>
<div id="baseCards"></div></div>
<script>
'''
HTML_TAIL = '''
const REG = new Set(D.regNames);
const CORPUS = new Set(D.pending['코퍼스 존재·레지스트리 미편입 (DSL 인코딩 대기)']);
D.cross.forEach(r => CORPUS.add(r.result));
(function(){
  let h = '';
  for (const [k, arr] of Object.entries(D.pending)) {
    const cls = k.startsWith('순수')?'newp':k.startsWith('코퍼스')?'uning':k.startsWith('뿌리')?'miss':k.startsWith('해소')?'ok':'';
    h += `<h4>${k} (${arr.length})</h4><div>` + arr.map(n => `<span class="chip ${cls}" style="font-size:11px">${n}</span>`).join(' ') + '</div>';
  }
  document.getElementById('pendBox').innerHTML = '<b style="color:#e8d5a0">채움 대기 목록</b>' + h;
})();
const normN = n => n.replace(/\(.+?\)$/, '');
function chipCls(n, isTop, topTier){
  if (n.includes('신규 뿌리')) return 'miss';
  if (isTop) return topTier >= 5 ? 't5' : 'fruit';
  const k = REG.has(n) ? n : (REG.has(normN(n)) ? normN(n) : null);
  if (k) { const t = D.tierOf[k]; return t==='1'?'t1':t==='2'?'t2':t==='3'?'t3':t==='4'?'fruit':t==='5'?'t5':'t2'; }
  return CORPUS.has(n) ? 'uning' : 'newp';
}
function expand(name, depth, seen){
  if (depth > 3 || seen.has(name)) return [];
  seen.add(name);
  const recs = D.edges[name];
  if (!recs) return [];
  const r = recs[0];
  let rows = [{result: name, mats: r.mats, src: r.src, tier: r.tier, depth, multi: recs.length - 1}];
  for (const m of r.mats) rows = rows.concat(expand(m, depth + 1, seen));
  return rows;
}
const METALS = new Set(['무쇠','적동','황금','백은','연갑','주석','진사']);
function chipHtml(m, isTop, topTier){
  const metal = METALS.has(normN(m)) ? ' metal' : '';
  const mark = metal ? '✦ ' : '';
  return `<span class="chip ${chipCls(m, isTop, topTier)}${metal}">${mark}${m}</span>`;
}
function flowHtml(rows, topName, topTier){
  return rows.map(r => {
    const tn = (r.tier||'').replace('T','');
    return `<div class="flow ${'d'+Math.min(r.depth,3)}"><span class="tcell tc${tn||2}">${r.tier||''}</span>` +
    r.mats.map(m => chipHtml(m, false)).join('<span class="arrow">+</span>') +
    `<span class="arrow">→</span><span class="chip ${chipCls(r.result, r.result===topName, topTier)}">${r.result} <small>${r.tier||''}</small></span>` +
    (r.multi > 0 ? `<span class="badge b체인">경로 +${r.multi}</span>` : '') +
    `<span class="badge b${r.src}">${r.src==='체인' ? '체인' : '♻ ' + r.src}</span></div>`;
  }).join('');
}
function show(t){ for (const v of ['A','B','C']) { document.getElementById('view'+v).style.display = t===v?'':'none'; document.getElementById('tab'+v).className = t===v?'on':''; } }
const stCls = s => s.startsWith('확정')?'st확정':s.startsWith('승격')?'st승격':s.startsWith('뿌리')?'st뿌리':s.startsWith('철회')?'st철회':s.startsWith('잎')?'st잎':s.startsWith('공석')?'st공석':'st잠정';
(function(){
  const cats = {};
  D.chains.forEach(c => { const k = c.cat; (cats[k] = cats[k]||{}); (cats[k][c.lane] = cats[k][c.lane]||[]).push(c); });
  const CATKR = {CT:'CT 전투', PT:'PT 성격', AT:'AT 성인', BT:'BT 신체'};
  let h = '';
  for (const [cat, lanes] of Object.entries(cats)) {
    h += `<div class="cat"><h2>${CATKR[cat]||cat}</h2>`;
    for (const [lane, cs] of Object.entries(lanes)) {
      h += `<div class="lane"><h3>${lane}</h3><div class="chains">`;
      for (const c of cs) {
        h += `<div class="card"><span class="st ${stCls(c.status)}">${c.status}</span><h3>${c.fruit} <span class="face">${c.tier} · ${c.face}</span></h3>`;
        if (c.fork && c.fork.poles.length) {
          const [pa, pb] = c.fork.poles;
          h += `<div class="flow"><span class="tcell tc3">모순</span><span class="chip ${chipCls(pa,false)}">${pa} <small>${REG.has(pa)?'T'+D.tierOf[pa]:''}</small></span><span class="arrow" style="color:#c8a">⟷</span><span class="chip ${chipCls(pb,false)}">${pb} <small>${REG.has(pb)?'T'+D.tierOf[pb]:''}</small></span><span class="arrow">→</span>`;
          if (c.fork.integ) h += `<span class="chip fruit ${REG.has(c.fork.integ)?'':'newp'}" style="border-style:${REG.has(c.fork.integ)?'solid':'dashed'}">☯ ${c.fork.integ} <small>T4</small></span><span class="arrow">/</span><span class="chip fruit ${REG.has(c.fork.split)?'':'newp'}" style="border-style:dashed">✸ ${c.fork.split} <small>T4</small></span>`;
          else h += `<span class="chip newp">잎 미정</span>`;
          h += '</div>';
          // 극이 합성 도달이면 그 사다리도 펼침
          for (const pole of c.fork.poles) if (D.edges[pole]) h += flowHtml(expand(pole, 1, new Set()), pole, 3);
        }
        else if (!c.steps.length) h += `<div class="flow"><span class="chip ${c.tier==='T5'?'t5':'fruit'}">${c.fruit}</span><span class="arrow">←</span><span class="chip newp">${c.chainRaw}</span></div>`;
        else h += flowHtml(expand(c.fruit, 0, new Set()), c.fruit, parseInt(c.tier[1]));
        h += `<div class="note">${c.note}</div></div>`;
      }
      h += '</div></div>';
    }
    h += '</div>';
  }
  document.getElementById('viewA').innerHTML = h;
})();
const secs = [...new Set(D.cross.map(r => r.sec))];
secs.forEach(s => { const o = document.createElement('option'); o.textContent = s; document.getElementById('fSec').appendChild(o); });
function renderB(){
  const fs = document.getElementById('fSec').value, fc = document.getElementById('fCat').value, ft = document.getElementById('fTier').value;
  const bySec = {};
  D.cross.filter(r => (!fs||r.sec===fs) && (!fc||r.cat===fc) && (!ft||String(r.tier)===ft))
    .forEach(r => { (bySec[r.sec] = bySec[r.sec]||[]).push(r); });
  let h = '';
  for (const [s, rs] of Object.entries(bySec)) {
    h += `<div class="lane"><h3>${s} (${rs.length})</h3><div class="chains">`;
    for (const r of rs) {
      h += `<div class="card"><span class="st ${r.merged?'st철회':'st잠정'}">${r.merged?'병합됨':'T'+r.tier+(r.down?' ⬇':'')+' · '+r.cat}</span><h3>${r.result} <span class="face">${r.src}</span></h3>` +
        flowHtml(expand(r.result, 0, new Set()), r.result, r.tier) + `<div class="eff">${r.eff}</div></div>`;
    }
    h += '</div></div>';
  }
  document.getElementById('crossCards').innerHTML = h;
}
renderB();
// C: 뿌리·몸통 — 역방향 쓰임
function renderC(){
  const fc = document.getElementById('cCat').value, ft = document.getElementById('cTier').value, fu = document.getElementById('cUse').value;
  const byCat = {};
  D.bases.filter(b => (!fc||b.cat===fc) && (!ft||b.tier===ft))
    .filter(b => { const used = (D.usage[b.name]||[]).length > 0;
      if (!fu) return true;
      if (fu==='y') return used;
      if (fu==='s') return !used && b.fn;
      return !used && !b.fn; })
    .forEach(b => { (byCat[b.cat] = byCat[b.cat]||[]).push(b); });
  const KR = {CT:'CT 전투', PT:'PT 성격', AT:'AT 성인', BT:'BT 신체'};
  let h = '';
  for (const [cat, bs] of Object.entries(byCat)) {
    bs.sort((a,b) => a.tier===b.tier ? ((D.usage[b.name]||[]).length - (D.usage[a.name]||[]).length) : a.tier.localeCompare(b.tier));
    h += `<div class="lane"><h3>${KR[cat]} (${bs.length})</h3>`;
    for (const b of bs) {
      const uses = D.usage[b.name] || [];
      h += `<div class="flow"><span class="tcell tc${b.tier}">T${b.tier}</span><span class="chip t${b.tier}">${b.name}</span>`;
      if (uses.length) {
        h += '<span class="arrow">→</span>' + [...new Set(uses)].slice(0,5).map(u => `<span class="chip ${chipCls(u,false)}" style="font-size:11px">${u}</span>`).join('<span class="arrow">·</span>');
        if (new Set(uses).size > 5) h += `<span class="badge b체인">+${new Set(uses).size-5}</span>`;
      } else if (b.exempt) h += `<span class="badge" style="background:#241830;color:#b8a">변용 칸 — 상태 사다리(면제)</span>`;
      else if (b.fn) h += `<span class="badge" style="background:#3a2a1a;color:#da5">⚠참여 필요(규칙③) · ${b.kind}</span>`;
      else h += '<span class="badge" style="background:#3a2a1a;color:#da5">효과 미저작 — 상향 패스 대기</span>';
      h += '</div>';
    }
    h += '</div>';
  }
  document.getElementById('baseCards').innerHTML = h;
}
renderC();
</script></body></html>'''

out = HTML_HEAD + 'const D = ' + json.dumps(D, ensure_ascii=False) + ';' + HTML_TAIL
open(P('design/trait_tree.html'), 'w', encoding='utf-8').write(out)
print('trait_tree.html 재생성 OK — 체인', len(chains), '/ 엣지', len(edges),
      '/ 순수 신규', len(pending['순수 신규 잠정명 (이름·효과 확정 필요)']))
