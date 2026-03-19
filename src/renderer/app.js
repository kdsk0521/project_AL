// ============================================================
//  미궁 연금술사 알파 — App (Renderer Entry Point)
// ============================================================
//  Wires the HTML UI to the REAL game engine and all 5 systems.
//  Screen-based FSM: currentScreen determines which handler
//  processes commands.
// ============================================================
'use strict';

const GameEngine     = require('../game/engine');
const DungeonSystem  = require('../game/systems/dungeon');
const CombatSystem   = require('../game/systems/combat');
const CraftingSystem = require('../game/systems/crafting');
const UnitSystem     = require('../game/systems/unit');
const EconomySystem  = require('../game/systems/economy');

// ============================================================
//  App Class
// ============================================================
class App {
  constructor() {
    // DOM refs
    this.outputEl = document.getElementById('game-output');
    this.inputEl  = document.getElementById('command-input');

    // Engine + Systems (REAL — no stubs)
    const TrainingSystem = require('../game/systems/training');
    this.engine   = new GameEngine();
    this.combat   = new CombatSystem(this.engine);
    this.dungeon  = new DungeonSystem(this.engine);
    this.crafting = new CraftingSystem(this.engine);
    this.unit     = new UnitSystem(this.engine);
    this.economy  = new EconomySystem(this.engine);
    this.training = new TrainingSystem(this.engine);

    // Dungeon needs a combat reference
    this.dungeon.combat = this.combat;

    // Screen FSM
    this.currentScreen = 'main_menu';

    // Transient state for multi-step flows
    this._encounter = null;        // current dungeon encounter data
    this._selectedUnitId = null;   // unit detail target
    this._processingMatId = null;  // crafting: material being processed
    this._combineStep = 0;         // crafting combine step
    this._combineMatA = null;
    this._combineMatB = null;
    this._negotiationAttempt = 0;  // negotiation attempt counter
    this._facilityKey = null;      // selected facility key
    this._fusionStep = 0;
    this._fusionUnitA = null;
    this._fusionUnitB = null;
    this._inventoryList = [];      // cached material id list for selection
    this._compendiumList = [];     // cached compendium pool
    this._unitList = [];           // cached unit list for selection
    this._facilityList = [];       // cached facility list
    this._processingOptions = [];  // cached processing options
    this._recipeList = [];         // cached recipe list

    // Quick-button wiring
    document.getElementById('inventory-btn').addEventListener('click', () => this._quickCommand('인벤토리'));
    document.getElementById('unit-btn').addEventListener('click',      () => this._quickCommand('유닛'));
    document.getElementById('map-btn').addEventListener('click',       () => this._quickCommand('지도'));

    this.init();
  }

  // ----------------------------------------------------------
  //  Initialisation
  // ----------------------------------------------------------
  init() {
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = this.inputEl.value.trim();
        this.inputEl.value = '';
        if (cmd) this.processCommand(cmd);
      }
    });
    this.showMainMenu();
  }

  // ----------------------------------------------------------
  //  Output helpers
  // ----------------------------------------------------------
  print(text, className = '') {
    const line = document.createElement('div');
    line.className = `output-line ${className}`.trim();
    line.innerHTML = text;
    this.outputEl.appendChild(line);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  // Progress bar (CSS 기반)
  printProgress(label, value, max, color = '#4a9eff', width = 140) {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    const el = document.createElement('div');
    el.className = 'output-line';
    el.innerHTML = `<div class="progress-bar">
      <span class="bar-label">${label}</span>
      <div class="bar-bg" style="width:${width}px">
        <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
        <span class="bar-text">${value}/${max}</span>
      </div>
    </div>`;
    this.outputEl.appendChild(el);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  // Column grid (칼럼 레이아웃)
  // cols: [{content, width, align, color, className}] — width는 1~24 (24=100%)
  printColumns(cols) {
    const el = document.createElement('div');
    el.className = 'output-columns';
    el.style.gridTemplateColumns = cols.map(c => `${((c.width || 12) / 24 * 100).toFixed(1)}%`).join(' ');
    for (const col of cols) {
      const cell = document.createElement('div');
      cell.className = col.className || '';
      cell.style.textAlign = col.align || 'left';
      if (col.color) cell.style.color = col.color;
      cell.innerHTML = col.content || '';
      el.appendChild(cell);
    }
    this.outputEl.appendChild(el);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  // Clickable menu option — highlights on hover, executes command on click
  printOption(cmd, text, className = 'menu') {
    const line = document.createElement('div');
    line.className = `output-line ${className} clickable`;
    line.innerHTML = text;
    line.dataset.cmd = cmd;
    line.addEventListener('click', () => {
      this.print(`> ${cmd}`, 'command');
      this.processCommand(cmd);
    });
    this.outputEl.appendChild(line);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  // Fixed action bar — always visible at bottom, shows current choices
  setActions(actions) {
    // actions = [{key: '1', label: '탐사 준비'}, {key: 'r', label: '귀환하기'}, ...]
    const bar = document.getElementById('action-bar');
    if (!bar) return;
    bar.innerHTML = '';
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.innerHTML = `<span class="key">[${a.key}]</span>${a.label}`;
      btn.addEventListener('click', () => {
        this.print(`> ${a.key}`, 'command');
        this.processCommand(a.key);
      });
      bar.appendChild(btn);
    }
  }

  clearActions() {
    const bar = document.getElementById('action-bar');
    if (bar) bar.innerHTML = '';
  }

  // 아이템 태그 + tier 요약 표시
  // 튜토리얼 가이드 체크 (도시 복귀 시마다 호출)
  _checkTutorialGuide(s) {
    const t = s.tutorial;
    if (!t) return;

    // 1단계: 첫 탐사 전 → 탐사 안내
    if (!t.firstExploration && s.dungeon.maxFloorReached === 0) {
      this.print('💡 전임자의 메모: "미궁에 들어가면 재료를 캘 수 있다. 1번을 눌러 탐사를 시작해보자."', 'lore');
      this.printBlank();
      return;
    }

    // 2단계: 첫 탐사 후 + 첫 조합 전 → 조합 안내
    if (!t.firstCrafting && s.dungeon.maxFloorReached >= 1 && Object.keys(s.inventory).length > 2) {
      if (!t.firstExploration) { t.firstExploration = true; }
      this.print('💡 전임자의 메모: "가져온 재료로 뭔가 만들어보자. 2번 가공/연구에서 조합할 수 있다."', 'lore');
      this.print('   "약초와 물을 합치면 회복 물약이 된다. 기초 중의 기초."', 'dim');
      this.printBlank();
      return;
    }

    // 3단계: 조합 경험 후 + 유닛 1체만 → 영입 안내
    if (!t.firstRecruitment && t.firstCrafting && s.ownedUnits.length <= 1) {
      this.print('💡 미궁 2층부터는 분기가 나뉜다. 만나는 유닛에게 대화를 시도해보자.', 'lore');
      this.printBlank();
      return;
    }

    // 4단계: 유닛 2체+ + 도시 배치 경험 없음 → 배치 안내
    if (!t.firstPlacement && s.ownedUnits.length >= 2) {
      if (!t.firstRecruitment) { t.firstRecruitment = true; }
      const inParty = s.party.length;
      if (s.ownedUnits.length > inParty) {
        this.print('💡 탐사에 안 데려갈 유닛은 도시 시설에 배치할 수 있다. (5번 도시 시설)', 'lore');
        this.printBlank();
        return;
      }
    }

    // 5단계: 보스 격파 후 + 압축기 미제작 → 압축기 안내
    if (s.milestones.firstBossDefeated && !s.milestones.compressorBuilt) {
      if (!t.firstBoss) { t.firstBoss = true; }
      if (s.inventory['MAT_SPRING'] > 0) {
        this.print('💡 보스에서 얻은 스프링으로 압축기를 만들 수 있다. 마법강철도 필요하다.', 'lore');
        this.print('   (철광석→분쇄→철가루 + 마력석 = 마법강철)', 'dim');
        this.printBlank();
      }
      return;
    }

    // 유지비 경고 (압축기 제작 후 + 첫 경고 안 함)
    if (s.milestones.compressorBuilt && !t.maintenanceWarned) {
      t.maintenanceWarned = true;
      this.print('⚠ 압축기 설치로 월간 유지비가 발생합니다. 영혼력이 부족해지면 유닛을 납품하세요.', 'error');
      this.printBlank();
      return;
    }

    // 납품 유도 (유지비 시작 후 + 영혼력 부족 + 납품 경험 없음)
    if (s.milestones.compressorBuilt && !t.firstDelivery && s.soulPower < 100) {
      this.print('💡 영혼력이 부족하다. 유닛을 전서에 납품하면 영혼력을 얻을 수 있다. (3번 유닛 관리 → 납품)', 'lore');
      this.printBlank();
      return;
    }
  }

  _printTagSummary(item) {
    if (!item) return;
    const tags = item.tags || {};
    const funcs = (tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : [])).filter(Boolean);
    const elems = (tags.elements || (tags.element ? (Array.isArray(tags.element) ? tags.element : [tags.element]) : [])).filter(Boolean);
    const forms = (tags.forms || (tags.form ? (Array.isArray(tags.form) ? tags.form : [tags.form]) : [])).filter(Boolean);

    // 태그별 중복 횟수로 표시
    const countMap = (arr) => {
      const m = {};
      arr.forEach(t => { m[t] = (m[t] || 0) + 1; });
      return Object.entries(m).map(([k, v]) => v > 1 ? `${k}×${v}` : k).join(', ');
    };

    const parts = [];
    if (funcs.length) parts.push(`기능[${countMap(funcs)}]`);
    if (elems.length) parts.push(`원소[${countMap(elems)}]`);
    if (forms.length) parts.push(`형태[${countMap(forms)}]`);

    const tier = item.tier || 1;
    if (parts.length) {
      this.print(`  Tier ${tier} | ${parts.join(' ')}`, 'dim');
    }
  }


  // 부품 태그 요약 (밀도 기반)
  // ═══ Training Dashboard Renderer ═══

  _renderTrainingDashboard(unit, resultMsg = null) {
    const gs = unit.globalState;
    const sen = unit.sensitivity;
    const isHidden = this.training.getAdultTrait(unit) === 'AT_ACCUMULATIVE';
    const parts = this.training.getAvailableParts(unit);
    const colors = this.engine.colors;

    // Header
    document.getElementById('td-unit-name').textContent =
      `【 ${unit.name} 】 Lv.${unit.level} ${unit.sigilName} — ${this.training.getAdultTraitName(unit)}`;
    document.getElementById('td-stamina').textContent =
      `스태미나: ${this.engine.state.stamina}/${this.engine.state.maxStamina}`;

    // Sensitivity bars
    const senEl = document.getElementById('td-sensitivity-bars');
    senEl.innerHTML = '';
    for (const p of parts) {
      const val = isHidden ? 0 : (sen[p.id] || 0);
      const disp = isHidden ? '???' : val;
      const pct = Math.min(100, val);
      const color = val >= 80 ? '#ff69b4' : val >= 50 ? '#ff4444' : val >= 20 ? '#ffaa00' : '#44cc44';
      senEl.innerHTML += `<div class="td-bar-row">
        <span class="td-bar-label">${p.name}</span>
        <span class="td-bar-value">${disp}</span>
        <div class="td-bar-bg">
          <div class="td-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span style="font-size:10px;color:#888;min-width:50px">【${p.milestone}】</span>
        ${p.locked ? '<span style="color:#ff4444;font-size:10px">[잠금]</span>' : ''}
      </div>`;
    }

    // Global states
    const gsEl = document.getElementById('td-global-state');
    const stateItems = [
      { key: 'love', label: '연모', color: colors.globalState.love },
      { key: 'submission', label: '복종', color: colors.globalState.submission },
      { key: 'lewdness', label: '음란', color: colors.globalState.lewdness },
      { key: 'fear', label: '공포', color: colors.globalState.fear },
      { key: 'resentment', label: '반감', color: colors.globalState.resentment }
    ];
    gsEl.innerHTML = '';
    for (const s of stateItems) {
      const val = gs[s.key] || 0;
      gsEl.innerHTML += `<div class="td-bar-row">
        <span class="td-bar-label">${s.label}</span>
        <span class="td-bar-value" style="color:${s.color}">${val}</span>
        <div class="td-bar-bg">
          <div class="td-bar-fill" style="width:${Math.min(100,val)}%;background:${s.color}"></div>
        </div>
      </div>`;
    }

    // Experience
    const de = unit.detailedExp || {};
    const expEl = document.getElementById('td-exp');
    const expItems = [
      ['애무', de.caress||0], ['자극', de.stimulate||0], ['핥기', de.lick||0], ['키스', de.kiss||0],
      ['삽입', de.insert||0], ['도구', de.toy||0], ['절정', de.orgasm||0], ['봉사', de.service||0],
      ['조련', de.discipline||0], ['노출', de.exposure||0], ['총회', de.totalSessions||0]
    ];
    expEl.innerHTML = expItems.map(([k,v]) => `<span>${k}:${v}</span>`).join('');

    // Description (result message or default)
    const descEl = document.getElementById('td-desc');
    descEl.textContent = resultMsg || `${unit.name}이(가) 당신을 바라보고 있다.`;

    // Action buttons
    const actions = this.training.getAvailableActions(unit);
    this._trainingActions = actions;
    const actEl = document.getElementById('td-actions');
    actEl.innerHTML = '';
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = `td-action-btn ${a.locked ? 'locked' : ''}`;
      btn.textContent = `${a.id}. ${a.name}${a.locked ? ' [X]' : ''}`;
      if (a.locked) {
        btn.title = a.lockReason;
      } else {
        btn.onclick = () => {
          const tdInput = document.getElementById('td-input');
          tdInput.value = '';
          this.processCommand(`${a.id}`);
        };
      }
      actEl.appendChild(btn);
    }

    // 돌아가기 버튼
    const backBtn = document.createElement('button');
    backBtn.className = 'td-action-btn';
    backBtn.textContent = '0. 돌아가기';
    backBtn.style.background = '#2a1a1a';
    backBtn.onclick = () => this.processCommand('0');
    actEl.appendChild(backBtn);
  }

  _closeTrainingDashboard() {
    document.getElementById('training-dashboard').classList.remove('active');
    document.getElementById('main-area').style.display = '';
    this.showTrainingMenu();
  }

  _partSummary(part) {
    if (!part.tags || part.tags.length === 0) return '기본';
    const counts = {};
    part.tags.forEach(t => { counts[t] = (counts[t]||0)+1; });
    return Object.entries(counts).map(([k,v]) => v > 1 ? k + '×' + v : k).join(',');
  }
  _partTier(part) {
    if (!part.tags || part.tags.length === 0) return 0;
    const counts = {};
    part.tags.forEach(t => { counts[t] = (counts[t]||0)+1; });
    const total = Object.values(counts).reduce((s,v)=>s+v,0);
    const unique = Object.keys(counts).length;
    return Math.floor(total / unique);
  }

  printSeparator() {
    this.print('─'.repeat(60), 'dim');
  }

  printBlank() {
    this.print('&nbsp;');
  }

  clearOutput() {
    this.outputEl.innerHTML = '';
  }

  // ----------------------------------------------------------
  //  Status-panel updater  (REAL engine state)
  // ----------------------------------------------------------
  updateStatus() {
    const s = this.engine.state;
    if (!s) return;

    const safe = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    const safeStyle = (id, prop, val) => {
      const el = document.getElementById(id);
      if (el) el.style[prop] = val;
    };

    // Location
    const loc = s.dungeon && s.dungeon.inDungeon
      ? `미궁 ${s.dungeon.currentFloor}층`
      : '미궁 도시';
    safe('location-display', loc);

    // Date
    safe('date-display', `${s.year}년 ${s.month}월 ${s.day}일`);

    // Player stats
    safe('hp-display', `${s.player.hp}/${s.player.maxHp}`);
    safe('stamina-display', `${s.stamina}/${s.maxStamina}`);
    safe('soulpower-display', s.soulPower);
    // 재료 현황 — 주요 재료 수량 표시
    const matEl = document.getElementById('materials-display');
    if (matEl) {
      const inv = s.inventory || {};
      const keyMats = [
        ['MAT_HERB','약초'], ['MAT_CATALYST_HERB','촉매초'], ['MAT_IRON_ORE','철광석'],
        ['MAT_MAGIC_STONE','마력석'], ['MAT_POISON_FISH','독물고기'], ['MAT_WATER','물'],
        ['MAT_SLIME_CORE','슬라임핵'], ['MAT_SPRING','스프링']
      ];
      const lines = keyMats
        .filter(([id]) => (inv[id] || 0) > 0)
        .map(([id, name]) => `${name}:${inv[id]}`);
      // Count crafted items
      const craftedCount = Object.keys(inv).filter(id => !id.startsWith('MAT_') && (inv[id] || 0) > 0).length;
      if (craftedCount > 0) lines.push(`제작품:${craftedCount}종`);
      matEl.innerHTML = lines.join(' | ') || '없음';
    }

    // Bars
    safeStyle('hp-bar', 'width', `${(s.player.hp / s.player.maxHp) * 100}%`);
    safeStyle('stamina-bar', 'width', `${(s.stamina / s.maxStamina) * 100}%`);
    const soulMax = Math.max(1, s.soulPower + 200);
    safeStyle('soul-bar', 'width', `${Math.min(100, (s.soulPower / soulMax) * 100)}%`);

    // Party list
    const partyEl = document.getElementById('party-display');
    if (!partyEl) return;
    const partyUnits = this.engine.getPartyUnits();
    if (partyUnits.length > 0) {
      partyEl.innerHTML = partyUnits.map(u =>
        `<div class="party-member">` +
        `<span class="name">${u.name}</span> ` +
        `<span class="info">Lv.${u.level} HP:${u.hp}/${u.maxHp}${u.isKnockedOut ? ' [기절]' : ''}</span>` +
        `</div>`
      ).join('');
    } else {
      partyEl.innerHTML = '<span class="empty-text">편성된 유닛 없음</span>';
    }
  }

  // ----------------------------------------------------------
  //  Command router
  // ----------------------------------------------------------
  processCommand(cmd) {
    this.print(`> ${cmd}`, 'command');

    // Debug commands (prefix: /)
    if (cmd.startsWith('/')) {
      this.handleDebug(cmd);
      return;
    }

    switch (this.currentScreen) {
      case 'main_menu':          this.handleMainMenu(cmd);          break;
      case 'new_game_slot':      this.handleNewGameSlot(cmd);       break;
      case 'intro':              this.handleIntro(cmd);             break;
      case 'town':               this.handleTown(cmd);              break;
      case 'dungeon_prep':       this.handleDungeonPrep(cmd);       break;
      case 'dungeon_node':       this.handleDungeonNode(cmd);       break;
      case 'encounter':          this.handleEncounter(cmd);         break;
      case 'recruit_choice':     this.handleRecruitChoice(cmd);     break;
      case 'combat':             this.handleCombat(cmd);            break;
      case 'combat_result':      this.handleCombatResult(cmd);      break;
      case 'crafting':           this.handleCrafting(cmd);          break;
      case 'crafting_process':   this.handleCraftingProcess(cmd);   break;
      case 'crafting_process_eq':this.handleCraftingProcessEq(cmd); break;
      case 'crafting_combine':   this.handleCraftingCombine(cmd);   break;
      case 'crafting_combine_b': this.handleCraftingCombineB(cmd);  break;
      case 'craft_result':      if (this._craftResultHandler) this._craftResultHandler(cmd); else this.showCrafting(); break;
      case 'recipe_list':        this.handleRecipeList(cmd);       break;
      case 'unit_management':    this.handleUnitManagement(cmd);    break;
      case 'unit_detail':        this.handleUnitDetail(cmd);        break;
      case 'unit_fusion_a':      this.handleFusionSelectA(cmd);     break;
      case 'unit_fusion_b':      this.handleFusionSelectB(cmd);     break;
      case 'unit_fusion_confirm':this.handleFusionConfirm(cmd);     break;
      case 'unit_party':         this.handlePartyEdit(cmd);         break;
      case 'city_facilities':    this.handleCityFacilities(cmd);    break;
      case 'facility_detail':    this.handleFacilityDetail(cmd);    break;
      case 'facility_assign':    this.handleFacilityAssign(cmd);    break;
      case 'compendium':         this.handleCompendium(cmd);        break;
      case 'inventory':          this.handleInventory(cmd);         break;
      case 'tool_manage':        this.handleToolManagement(cmd);    break;
      case 'tool_detail':        this.handleToolDetail(cmd);        break;
      case 'tool_upgrade':       this.handleToolUpgrade(cmd);       break;
      case 'training_select':    this.handleTrainingSelect(cmd);    break;
      case 'training_menu':      this.handleTrainingMenu(cmd);      break;
      case 'training_part':      this.handleTrainingPart(cmd);      break;
      case 'training_action':    this.handleTrainingAction(cmd);    break;
      case 'advance_day':        this.handleAdvanceDay(cmd);        break;
      case 'end_game':           this.handleEndGame(cmd);           break;
      default:
        this.print('알 수 없는 상태입니다. 마을로 돌아갑니다.', 'error');
        this.showTownMenu();
        break;
    }
  }

  // ============================================================
  //  DEBUG COMMANDS (prefix: /)
  // ============================================================
  handleDebug(cmd) {
    const parts = cmd.substring(1).split(' ');
    const action = parts[0];
    const arg1 = parts[1];
    const arg2 = parts[2];

    switch (action) {
      case 'help':
        this.print('── 디버그 명령어 ──', 'system');
        this.print('  /soul [양]       — 영혼력 추가 (기본 1000)', 'dim');
        this.print('  /mat [ID] [양]   — 재료 추가 (예: /mat MAT_HERB 10)', 'dim');
        this.print('  /matall [양]     — 기초 재료 7종 전부 추가', 'dim');
        this.print('  /stamina [양]    — 스태미나 추가 (기본 30)', 'dim');
        this.print('  /hp [양]         — 연금술사 HP 전회복', 'dim');
        this.print('  /healall         — 전 유닛 HP 전회복 + 기절 해제', 'dim');
        this.print('  /level [양]      — 선택 유닛 레벨업 (유닛관리에서)', 'dim');
        this.print('  /party [크기]    — 파티 최대 크기 변경', 'dim');
        this.print('  /floor [층]      — 최대 도달 층수 설정', 'dim');
        this.print('  /unit [ID]       — 유닛 즉시 획득', 'dim');
        this.print('  /items           — 전체 재료 목록 표시', 'dim');
        this.print('  /units           — 전체 유닛 ID 목록 표시', 'dim');
        this.print('  /god             — 갓모드 (재료+영혼력+스태미나 대량)', 'dim');
        this.print('  /title           — 타이틀 화면으로 돌아가기', 'dim');
        break;

      case 'soul':
        const soulAmt = parseInt(arg1) || 1000;
        this.engine.state.soulPower += soulAmt;
        this.print(`영혼력 +${soulAmt} (현재: ${this.engine.state.soulPower})`, 'success');
        break;

      case 'mat':
        if (!arg1) { this.print('사용법: /mat [재료ID] [수량]', 'error'); break; }
        const matQty = parseInt(arg2) || 5;
        this.engine.addMaterial(arg1, matQty);
        this.print(`${this.engine.getMaterialName(arg1)} +${matQty}`, 'success');
        break;

      case 'matall':
        const qty = parseInt(arg1) || 20;
        const basics = ['MAT_HERB','MAT_CATALYST_HERB','MAT_IRON_ORE','MAT_MAGIC_STONE','MAT_POISON_FISH','MAT_WATER','MAT_SLIME_CORE'];
        for (const m of basics) {
          this.engine.addMaterial(m, qty);
        }
        this.print(`기초 재료 7종 각 +${qty}`, 'success');
        break;

      case 'stamina':
        const stamAmt = parseInt(arg1) || 30;
        this.engine.state.stamina = Math.min(this.engine.state.maxStamina, this.engine.state.stamina + stamAmt);
        this.print(`스태미나 → ${this.engine.state.stamina}/${this.engine.state.maxStamina}`, 'success');
        break;

      case 'hp':
        this.engine.state.player.hp = this.engine.state.player.maxHp;
        this.engine.state.player.recoveryDays = 0;
        this.print(`연금술사 HP 전회복 (${this.engine.state.player.hp}/${this.engine.state.player.maxHp})`, 'success');
        break;

      case 'healall':
        for (const u of this.engine.state.ownedUnits) {
          u.hp = u.maxHp;
          u.isKnockedOut = false;
          u.recoveryDays = 0;
        }
        this.print(`전 유닛 HP 전회복 + 기절 해제`, 'success');
        break;

      case 'level':
        if (this._selectedUnitId) {
          const unit = this.engine.getUnitInstance(this._selectedUnitId);
          if (unit) {
            const times = parseInt(arg1) || 1;
            for (let i = 0; i < times; i++) {
              unit.exp.combat += unit.level * 100;
              const g = {
                '요괴':{hp:5,atk:3,def:2,spd:2},'정령':{hp:5,atk:2,def:2,spd:2},
                '인조':{hp:6,atk:2,def:3,spd:1},'야수':{hp:4,atk:2,def:1,spd:3},
                '환상':{hp:3,atk:2,def:2,spd:2}
              };
              const gr = g[unit.category] || g['정령'];
              unit.level++;
              unit.maxHp += gr.hp; unit.hp = unit.maxHp;
              unit.atk += gr.atk; unit.def += gr.def; unit.spd += gr.spd;
            }
            this.print(`${unit.name} → Lv.${unit.level} (ATK:${unit.atk} DEF:${unit.def} SPD:${unit.spd})`, 'success');
          }
        } else {
          this.print('유닛 관리에서 유닛을 선택한 상태에서 사용하세요.', 'error');
        }
        break;

      case 'party':
        const newSize = parseInt(arg1) || 5;
        this.engine.state.maxPartySize = newSize;
        this.print(`파티 최대 크기 → ${newSize}`, 'success');
        break;

      case 'floor':
        const floorNum = parseInt(arg1) || 15;
        this.engine.state.dungeon.maxFloorReached = floorNum;
        this.print(`최대 도달 층수 → ${floorNum}`, 'success');
        break;

      case 'unit':
        if (!arg1) { this.print('사용법: /unit [유닛ID]  (예: /unit UNIT_THORN_IMP)', 'error'); break; }
        const unitDef = this.engine.getUnitDef(arg1);
        if (!unitDef) { this.print(`유닛 "${arg1}" 을(를) 찾을 수 없습니다.`, 'error'); break; }
        const inst = this.engine.createUnitInstance(unitDef);
        this.engine.state.ownedUnits.push(inst);
        if (!this.engine.state.compendium.registered.includes(arg1)) {
          this.engine.state.compendium.registered.push(arg1);
        }
        this.print(`${unitDef.name} Lv.${unitDef.level} 획득!`, 'success');
        break;

      case 'items':
        this.print('── 전체 재료 ID ──', 'system');
        this.engine.data.materials.forEach(m => this.print(`  ${m.id} — ${m.name}`, 'dim'));
        break;

      case 'units':
        this.print('── 전체 유닛 ID (일부) ──', 'system');
        this.engine.data.units.slice(0, 20).forEach(u =>
          this.print(`  ${u.id} — ${u.name} Lv.${u.level} 인:${u.sigilName}`, 'dim')
        );
        this.print(`  ... 외 ${this.engine.data.units.length - 20}체`, 'dim');
        break;

      case 'god':
        this.engine.state.soulPower += 9999;
        this.engine.state.stamina = this.engine.state.maxStamina;
        this.engine.state.player.hp = this.engine.state.player.maxHp;
        this.engine.state.player.recoveryDays = 0;
        const allMats = ['MAT_HERB','MAT_CATALYST_HERB','MAT_IRON_ORE','MAT_MAGIC_STONE','MAT_POISON_FISH','MAT_WATER','MAT_SLIME_CORE','MAT_SPRING'];
        for (const m of allMats) this.engine.addMaterial(m, 99);
        for (const u of this.engine.state.ownedUnits) {
          u.hp = u.maxHp; u.isKnockedOut = false; u.recoveryDays = 0;
        }
        this.engine.state.maxPartySize = 5;
        this.engine.state.dungeon.maxFloorReached = 15;
        this.print('★ GOD MODE ★ 영혼력+9999, 재료 99개, 전회복, 파티5인, 15층 해금', 'success');
        break;

      case 'title':
        this.engine.autoSave();
        this.print('자동 저장 후 타이틀로 돌아갑니다...', 'system');
        setTimeout(() => this.showMainMenu(), 500);
        break;

      default:
        this.print(`알 수 없는 디버그 명령: ${action}. /help로 목록 확인.`, 'error');
        break;
    }
    this.updateStatus();
  }

  // ============================================================
  //  SCREEN: Main Menu
  // ============================================================
  showMainMenu() {
    this.clearOutput();
    this.clearActions();
    this.currentScreen = 'main_menu';
    this.printBlank();
    this.print('╔══════════════════════════════════════════╗', 'system');
    this.print('║                                          ║', 'system');
    this.print('║      미 궁  연 금 술 사  알 파           ║', 'system');
    this.print('║      Labyrinth Alchemist Alpha           ║', 'system');
    this.print('║                                          ║', 'system');
    this.print('╚══════════════════════════════════════════╝', 'system');
    this.printBlank();

    // Show save slots
    const slots = this.engine.getSaveSlots();
    this.print('── 세이브 슬롯 ──', 'system');
    slots.forEach((s) => {
      if (s.empty) {
        this.print(`  슬롯 ${s.slot + 1}: [비어있음]`, 'dim');
      } else {
        this.printOption(`${s.slot + 1}`,
          `  슬롯 ${s.slot + 1}: ${s.date} | 영혼력:${s.soulPower} | 유닛:${s.units}체 | ${s.floor}층 | ${s.realTime}`
        );
      }
    });
    this.printBlank();
    this.printOption('n', '  n. 새 게임');
    this.printBlank();
    this.setActions([
      ...slots.filter(s => !s.empty).map(s => ({key:`${s.slot+1}`, label:`슬롯${s.slot+1} 불러오기`})),
      {key:'n', label:'새 게임'}
    ]);
  }

  handleMainMenu(cmd) {
    // Load save slot
    if (['1','2','3'].includes(cmd)) {
      const slot = parseInt(cmd) - 1;
      if (this.engine.loadGame(slot)) {
        this.print(`슬롯 ${cmd} 불러오기 완료!`, 'success');
        this.updateStatus();
        this.showTownMenu();
      } else {
        this.print(`슬롯 ${cmd}에 저장 데이터가 없습니다.`, 'error');
      }
      return;
    }

    switch (cmd.toLowerCase()) {
      case 'n':
        this.showNewGameSlotSelect();
        break;
      default:
        this.print('슬롯 번호(1~3) 또는 n(새 게임)을 입력하세요.', 'error');
        break;
    }
  }

  showNewGameSlotSelect() {
    this.currentScreen = 'new_game_slot';
    this.printBlank();
    this.print('새 게임을 저장할 슬롯을 선택하세요:', 'system');
    const slots = this.engine.getSaveSlots();
    slots.forEach(s => {
      if (s.empty) {
        this.printOption(`${s.slot + 1}`, `  슬롯 ${s.slot + 1}: [비어있음]`);
      } else {
        this.printOption(`${s.slot + 1}`, `  슬롯 ${s.slot + 1}: ${s.date} | ${s.realTime} [덮어쓰기]`, 'error');
      }
    });
    this.printBlank();
    this.printOption('0', '  0. 취소');
    this.setActions([{key:'1',label:'슬롯1'},{key:'2',label:'슬롯2'},{key:'3',label:'슬롯3'},{key:'0',label:'취소'}]);
  }

  handleNewGameSlot(cmd) {
    if (cmd === '0') { this.showMainMenu(); return; }
    if (['1','2','3'].includes(cmd)) {
      this._currentSaveSlot = parseInt(cmd) - 1;
      this.engine.newGame();
      this.engine.saveGame(this._currentSaveSlot);
      this.showIntro();
    } else {
      this.print('1~3 또는 0을 입력하세요.', 'error');
    }
  }

  // ============================================================
  //  SCREEN: Intro
  // ============================================================
  showIntro() {
    this.clearOutput();
    this.currentScreen = 'intro';
    this.printBlank();
    this.print('전임자가 남긴 공방의 문을 연다.', 'lore');
    this.printBlank();
    this.print('낡은 작업대 위에 어제 만들다 만 혼합물이 남아있다.', 'description');
    this.print('서랍 속에서 메모 몇 장을 발견한다.', 'description');
    this.printBlank();
    this.print('"약초를 물에 달이면 회복약이 된다. 기초 중의 기초." — 전임자의 메모', 'lore');
    this.printBlank();
    this.print('공방 한 켠에 유닛 한 체가 남아 있다...', 'description');
    this.printBlank();

    const starter = this.engine.state.ownedUnits[0];
    const starterName = starter ? starter.name : '거품 슬라임';
    this.print(`${starterName}이(가) 천천히 다가온다.`, 'unit');
    this.print('"...부글부글..."', 'unit');
    this.printBlank();
    this.print(`  [초기 유닛 "${starterName}" 획득]`, 'success');
    if (starter) {
      this.print(`  인(${starter.sigilName}) | ${starter.category} | Lv.${starter.level}`, 'dim');
    }
    this.printBlank();
    this.printOption('1', '  [계속]');
    this.setActions([{key:'1', label:'계속'}]);
  }

  handleIntro(_cmd) {
    this.updateStatus();
    this.showTownMenu();
  }

  // ============================================================
  //  SCREEN: Town (Hub)
  // ============================================================
  showTownMenu() {
    this.currentScreen = 'town';
    this.autoSave(); // 도시 복귀 시 자동 저장
    this.clearOutput();
    this.printSeparator();
    this.print('【 미궁 도시 】', 'location');
    this.printBlank();

    const s = this.engine.state;

    // 튜토리얼 가이드 트리거 (alpha_progression.md)
    this._checkTutorialGuide(s);

    this.print(`${s.year}년 ${s.month}월 ${s.day}일`, 'lore');
    this.print(`스태미나: ${s.stamina}/${s.maxStamina}  |  영혼력: ${s.soulPower}`, 'system');
    this.printBlank();
    this.print('도시의 중심 광장. 탐사자들이 분주히 오가고 있다.', 'description');
    this.printBlank();
    this.printOption('1', '  1. 탐사 준비    — 미궁에 진입한다');
    this.printOption('2', '  2. 가공/연구    — 공방에서 가공·조합한다');
    this.printOption('3', '  3. 유닛 관리    — 유닛을 확인/육성한다');
    this.printOption('4', '  4. 조교소       — 유닛을 조교한다');
    this.printOption('5', '  5. 도시 시설    — 시설을 관리한다');
    this.printOption('6', '  6. 전서         — 유닛을 구매/등록한다');
    this.printOption('7', '  7. 인벤토리     — 소지품을 확인한다');
    this.printOption('t', '  t. 도구 관리    — 도구를 확인/업그레이드한다');
    this.printOption('8', '  8. 하루 넘기기');
    this.printOption('9', '  9. 저장');
    const p = this.engine.state.player;
    if (p.hp < p.maxHp) {
      this.printOption('0', `  0. 회복 (연금술사 HP: ${p.hp}/${p.maxHp})`);
    }
    this.printBlank();
    this.setActions([
      {key:'1', label:'탐사'}, {key:'2', label:'가공/연구'}, {key:'3', label:'유닛'},
      {key:'4', label:'조교소'}, {key:'5', label:'시설'}, {key:'6', label:'전서'},
      {key:'7', label:'인벤토리'}, {key:'t', label:'도구'}, {key:'8', label:'넘기기'}, {key:'9', label:'저장'},
      ...(p.hp < p.maxHp ? [{key:'0', label:'회복'}] : [])
    ]);
    this.updateStatus();
  }

  handleTown(cmd) {
    switch (cmd) {
      case '1': {
        const check = this.engine.canExplore();
        if (!check.ok) { this.print(check.reason, 'error'); break; }
        this.showDungeonPrep();
        break;
      }
      case '2': this.showCrafting();        break;
      case '3': this.showUnitManagement();  break;
      case '4': this.showTrainingFacility(); break;
      case '5': this.showCityFacilities();  break;
      case '6': this.showCompendium();      break;
      case '7': this.showInventory();       break;
      case 't': this.showToolManagement();  break;
      case '8': this.doAdvanceDay();        break;
      case '9': this.doSaveGame();          break;
      case '0': this.doHealPlayer();        break;
      default:
        this.print('번호를 입력하세요.', 'error');
        break;
    }
  }

  doHealPlayer() {
    const p = this.engine.state.player;
    if (p.hp >= p.maxHp) {
      this.print('이미 만전입니다.', 'dim');
      return;
    }

    // Find healing items (제작품만 — 원재료 직접 사용 불가)
    const inv = this.engine.state.inventory;
    const healItems = [];
    for (const [matId, qty] of Object.entries(inv)) {
      if (qty <= 0) continue;
      if (matId.startsWith('MAT_')) continue; // 원재료 제외
      const mat = this.engine.data.materials.find(m => m.id === matId);
      if (!mat) continue;
      const isHeal = (mat.effect && mat.effect.type === 'heal') ||
        (mat.category === 'consumable_potion') || (mat.category === 'consumable_food');
      if (isHeal) {
        healItems.push({ id: matId, name: mat.name, qty, value: (mat.effect && mat.effect.value) || 20 });
      }
    }

    if (healItems.length === 0) {
      this.print('회복 아이템이 없습니다. (물약이나 스프를 만들어보세요)', 'error');
      return;
    }

    this.print(`연금술사 HP: ${p.hp}/${p.maxHp}`, 'system');
    this.printBlank();
    healItems.forEach((item, i) => {
      this.printOption(`${i + 1}`, `  ${i + 1}. ${item.name} ×${item.qty} (HP +${item.value})`);
    });
    this.printOption('0', '  0. 취소');
    this.setActions([{key:'0', label:'취소'}]);

    const self = this;
    const origHandler = this.handleTown.bind(this);
    this.handleTown = function(c) {
      self.handleTown = origHandler;
      if (c === '0') { self.showTownMenu(); return; }
      const idx = parseInt(c);
      if (isNaN(idx) || idx < 1 || idx > healItems.length) { self.showTownMenu(); return; }
      const selected = healItems[idx - 1];
      self.engine.removeMaterial(selected.id, 1);
      const result = self.engine.healPlayer(selected.value);
      self.print(`${selected.name} 사용! HP +${result.healed} (${result.hp}/${result.maxHp})`, 'success');
      self.printBlank();
      self.updateStatus();
      self.showTownMenu();
    };
  }

  doSaveGame() {
    const slot = this._currentSaveSlot != null ? this._currentSaveSlot : 0;
    this.printBlank();
    this.print('── 저장할 슬롯 선택 ──', 'system');
    const slots = this.engine.getSaveSlots();
    slots.forEach(s => {
      if (s.empty) {
        this.printOption(`${s.slot + 1}`, `  슬롯 ${s.slot + 1}: [비어있음]`);
      } else {
        this.printOption(`${s.slot + 1}`, `  슬롯 ${s.slot + 1}: ${s.date} | ${s.realTime}`);
      }
    });
    this.printOption('0', '  0. 취소');
    this.setActions([{key:'1',label:'슬롯1'},{key:'2',label:'슬롯2'},{key:'3',label:'슬롯3'},{key:'0',label:'취소'}]);

    const self = this;
    const origHandler = this.handleTown.bind(this);
    this.handleTown = function(c) {
      self.handleTown = origHandler;
      if (c === '0') { self.showTownMenu(); return; }
      if (['1','2','3'].includes(c)) {
        const s = parseInt(c) - 1;
        self._currentSaveSlot = s;
        if (self.engine.saveGame(s)) {
          self.print(`슬롯 ${c}에 저장 완료!`, 'success');
        } else {
          self.print('저장 실패.', 'error');
        }
      }
      self.showTownMenu();
    };
  }

  // Auto save — call at key moments
  autoSave() {
    if (this._currentSaveSlot != null) {
      this.engine.saveGame(this._currentSaveSlot);
    }
  }

  // ============================================================
  //  SCREEN: Dungeon Preparation
  // ============================================================
  showDungeonPrep() {
    this.currentScreen = 'dungeon_prep';
    this.clearOutput();
    this.printSeparator();
    this.print('【 탐사 준비 】', 'location');
    this.printBlank();

    // Party display
    const partyUnits = this.engine.getPartyUnits();
    this.print('현재 파티:', 'system');
    if (partyUnits.length > 0) {
      partyUnits.forEach((u, i) => {
        const koText = u.isKnockedOut ? ' [기절]' : '';
        this.print(`  ${i + 1}. ${u.name} (Lv.${u.level} HP:${u.hp}/${u.maxHp}${koText})`, 'unit');
      });
    } else {
      this.print('  파티에 편성된 유닛이 없습니다!', 'error');
    }
    this.printBlank();

    // Floor selection
    const maxFloor = this.engine.state.dungeon.maxFloorReached;
    const maxAvailable = Math.min(15, maxFloor + 1);
    this.print(`스태미나: ${this.engine.state.stamina}/${this.engine.state.maxStamina}`, 'system');
    this.printBlank();

    // ASCII dungeon map
    this.print('── 미궁 구조도 ──', 'lore');
    const bossFloors = [5, 10, 15];
    const zones = { 1:'석굴',2:'석굴/수계',3:'수계/독림',4:'석굴/독림/결빙',5:'석굴심부★',
      6:'석굴심부/수계',7:'기관부/독림',8:'기관부/수계/결빙',9:'독림심부/수계심부',10:'경계★',
      11:'위험/기관부',12:'경계/결빙',13:'기관부/수계심부',14:'위험/기관부',15:'위험★' };
    for (let f = maxAvailable; f >= 1; f--) {
      const isBoss = bossFloors.includes(f);
      const reached = f <= maxFloor;
      const zone = zones[f] || '???';
      const marker = isBoss ? '◆' : '│';
      const status = reached ? '  ' : '新';
      const line = `  ${marker} ${String(f).padStart(2)}F ${status} [${zone}]`;
      if (f <= maxAvailable) {
        this.printOption(`${f}`, line);
      }
    }
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();

    // Action bar with floor buttons
    const floorActions = [];
    for (let f = 1; f <= maxAvailable; f++) {
      floorActions.push({ key: `${f}`, label: `${f}F${bossFloors.includes(f) ? '★' : ''}` });
    }
    floorActions.push({ key: '0', label: '돌아가기' });
    this.setActions(floorActions);
    this.updateStatus();
  }

  handleDungeonPrep(cmd) {
    if (cmd === '0') {
      this.showTownMenu();
      return;
    }
    const floor = parseInt(cmd);
    const maxFloor = this.engine.state.dungeon.maxFloorReached;
    const maxAvailable = Math.min(15, maxFloor + 1);

    if (isNaN(floor) || floor < 1 || floor > maxAvailable) {
      this.print(`1~${maxAvailable} 사이의 층 번호를 입력하세요. (0 = 돌아가기)`, 'error');
      return;
    }

    const result = this.dungeon.enterDungeon(floor);
    if (!result.success) {
      this.print(result.reason, 'error');
      return;
    }

    this.print(result.message, 'success');
    this.updateStatus();
    this.showDungeonNode();
  }

  // ============================================================
  //  SCREEN: Dungeon Node
  // ============================================================
  showDungeonNode() {
    this.currentScreen = 'dungeon_node';
    this.clearOutput();
    this.printSeparator();

    const node = this.dungeon.getCurrentNode();
    const floor = this.engine.state.dungeon.currentFloor;

    if (!node) {
      this.print('노드 정보를 찾을 수 없습니다. 귀환합니다.', 'error');
      this.doRetreat();
      return;
    }

    this.print(`【 미궁 ${floor}층 — ${node.zone || '구역'} 】`, 'location');
    this.printBlank();

    // Zone description
    const desc = this.dungeon.getFloorDescription(floor);
    this.print(desc, 'description');
    this.printBlank();

    // Node info
    const typeNames = {
      entrance: '입구', exit: '출구', combat: '전투 구역',
      collect: '채집 구역', rest: '휴식처', chest: '보물 상자',
      event: '이벤트', boss: '보스 구역'
    };
    this.print(`현재 노드: ${node.name || node.id} (${typeNames[node.type] || node.type})`, 'system');
    this.printBlank();

    // ASCII mini-map of current floor
    const floorNodes = this.dungeon.getFloorNodes(floor);
    if (floorNodes.length > 0) {
      const typeIcons = { entrance:'입', exit:'출', combat:'⚔', collect:'♦', rest:'♥', chest:'★', event:'?', boss:'◆' };
      const typeNames = { entrance:'입구', exit:'출구', combat:'전투', collect:'채집', rest:'휴식', chest:'상자', event:'이벤트', boss:'보스' };

      // BFS from entrance to build order
      const visited = new Set();
      const queue = [floorNodes.find(n => n.type === 'entrance')].filter(Boolean);
      const displayed = [];
      while (queue.length > 0) {
        const n = queue.shift();
        if (!n || visited.has(n.id)) continue;
        visited.add(n.id);
        displayed.push(n);
        for (const connId of (n.connections || [])) {
          const conn = floorNodes.find(fn => fn.id === connId);
          if (conn && !visited.has(conn.id)) queue.push(conn);
        }
      }

      // Render each node as a line (vertical map)
      this.print('  ┌─ 층 구조도 ─┐', 'dim');
      displayed.forEach((n, i) => {
        const icon = typeIcons[n.type] || '○';
        const isCurrent = n.id === node.id;
        const zone = n.zone ? `${n.zone}` : '';
        const typeName = typeNames[n.type] || n.type;
        const label = zone ? `${typeName}/${zone}` : typeName;

        // Connections indicator
        const connCount = (n.connections || []).length;
        const branch = connCount > 2 ? '╠' : '│';

        if (isCurrent) {
          this.print(`  ${branch} ▶ [${icon} ${label}] ◀ 현재`, 'system');
        } else {
          this.print(`  ${branch}   ${icon} ${label}`, 'dim');
        }

        // Draw connector to next
        if (i < displayed.length - 1) {
          const nextConn = (n.connections || []).filter(c => {
            const idx = displayed.findIndex(d => d.id === c);
            return idx > i;
          });
          if (nextConn.length > 1) {
            this.print('  ├───┬───┤', 'dim');
          } else {
            this.print('  │', 'dim');
          }
        }
      });
      this.print('  └───────────┘', 'dim');
      this.printBlank();
    }

    // Connected nodes
    const connected = this.dungeon.getConnectedNodes();
    if (connected.length > 0) {
      this.print('이동 가능한 노드:', 'system');
      connected.forEach((n, i) => {
        const nType = typeNames[n.type] || n.type;
        this.printOption(`${i + 1}`, `  ${i + 1}. ${n.name || n.id} [${nType}]`);
      });
    }
    this.printBlank();

    // Node-type-specific actions
    switch (node.type) {
      case 'entrance':
        this.printOption('r', '  r. 귀환하기');
        break;
      case 'exit':
        this.printOption('d', '  d. 다음 층으로 내려가기');
        this.printOption('r', '  r. 귀환하기');
        break;
      case 'collect':
        this.printOption('c', '  c. 채집하기');
        this.printOption('r', '  r. 귀환하기');
        break;
      case 'rest':
        this.printOption('h', '  h. 휴식하기 (체력 회복)');
        this.printOption('r', '  r. 귀환하기');
        break;
      case 'chest':
        this.printOption('o', '  o. 상자 열기');
        this.printOption('r', '  r. 귀환하기');
        break;
      case 'event':
        this.printOption('r', '  r. 귀환하기');
        break;
      case 'combat':
        this.printOption('r', '  r. 귀환하기');
        break;
      case 'boss':
        this.printOption('r', '  r. 귀환하기');
        break;
      default:
        this.printOption('r', '  r. 귀환하기');
        break;
    }
    this.printBlank();

    // Build fixed action bar for dungeon
    const actions = [];
    connected.forEach((n, i) => {
      const nType = typeNames[n.type] || n.type;
      actions.push({key: `${i+1}`, label: `${n.id} [${nType}]`});
    });
    if (node.type === 'exit') actions.push({key:'d', label:'다음 층'});
    if (node.type === 'collect') actions.push({key:'c', label:'채집'});
    if (node.type === 'rest') actions.push({key:'h', label:'휴식'});
    if (node.type === 'chest') actions.push({key:'o', label:'상자'});
    actions.push({key:'r', label:'귀환'});
    this.setActions(actions);

    this.updateStatus();
  }

  handleDungeonNode(cmd) {
    const lowerCmd = cmd.toLowerCase();

    // Retreat
    if (lowerCmd === 'r') {
      this.doRetreat();
      return;
    }

    // Descend (exit node only)
    if (lowerCmd === 'd') {
      const currentNode = this.dungeon.getCurrentNode();
      if (!currentNode || currentNode.type !== 'exit') {
        this.print('여기서는 내려갈 수 없습니다.', 'error');
        return;
      }
      const result = this.dungeon.moveToNextFloor();
      if (!result.success) {
        this.print(result.reason, 'error');
        return;
      }
      this.print(result.message, 'success');
      this.updateStatus();
      this.showDungeonNode();
      return;
    }

    // Collect
    if (lowerCmd === 'c') {
      const currentNode = this.dungeon.getCurrentNode();
      if (!currentNode || currentNode.type !== 'collect') {
        this.print('여기서는 채집할 수 없습니다.', 'error');
        return;
      }
      const collectibles = this.dungeon.getCollectibles(currentNode);
      if (collectibles.length === 0) {
        this.print('채집할 수 있는 것이 없다.', 'dim');
        return;
      }
      const result = this.dungeon.collectMaterials(collectibles);
      if (!result.success) {
        this.print(result.reason, 'error');
        return;
      }
      this.print('【 채집 】 (스태미나 -1)', 'system');
      for (const item of result.items) {
        this.print(`  ▸ ${item.name} ×${item.qty}`, 'success');
      }
      this.printBlank();
      this.updateStatus();
      return;
    }

    // Rest / Heal
    if (lowerCmd === 'h') {
      const currentNode = this.dungeon.getCurrentNode();
      if (!currentNode || currentNode.type !== 'rest') {
        this.print('여기서는 휴식할 수 없습니다.', 'error');
        return;
      }
      const healed = this.dungeon.restAtNode();
      if (healed.length > 0) {
        this.print('휴식을 취했다.', 'success');
        for (const h of healed) {
          this.print(`  ${h.name}: HP +${h.healed}`, 'heal');
        }
      } else {
        this.print('모두 건강하다. 특별히 회복할 것이 없다.', 'dim');
      }
      this.printBlank();
      this.updateStatus();
      return;
    }

    // Open chest (repeatable, costs stamina)
    if (lowerCmd === 'o') {
      const currentNode = this.dungeon.getCurrentNode();
      if (!currentNode || currentNode.type !== 'chest') {
        this.print('여기에 상자가 없습니다.', 'error');
        return;
      }
      if (!this.engine.useStamina(1)) {
        this.print('스태미나가 부족합니다.', 'error');
        return;
      }
      const chest = this.dungeon.openChest(currentNode);
      this.print('【 상자 】 (스태미나 -1)', 'system');
      if (chest.loot) {
        for (const item of chest.loot) {
          this.print(`  ▸ ${item.name} ×${item.qty}`, 'success');
        }
      }
      this.printBlank();
      this.updateStatus();
      return;
    }

    // Move to connected node (number input)
    const idx = parseInt(cmd);
    const connected = this.dungeon.getConnectedNodes();
    if (isNaN(idx) || idx < 1 || idx > connected.length) {
      this.print('올바른 번호 또는 명령어를 입력하세요.', 'error');
      return;
    }

    const targetNode = connected[idx - 1];
    const moveResult = this.dungeon.moveToNode(targetNode.id);

    if (!moveResult.success) {
      this.print(moveResult.reason, 'error');
      return;
    }

    // Handle node-type-specific events on arrival
    if (moveResult.encounter) {
      // Combat or unit encounter
      this._encounter = moveResult.encounter;
      this._negotiationAttempt = 0;
      if (moveResult.encounter.canNegotiate) {
        this.showEncounter();
      } else {
        // Direct combat (slime or boss)
        this.startCombatFromEncounter();
      }
      return;
    }

    if (moveResult.event) {
      this.clearOutput();
      this.printSeparator();
      this.print('【 이벤트 】', 'location');
      this.printBlank();
      this.print(moveResult.event.text, 'lore');
      if (moveResult.event.lore) {
        this.printBlank();
        this.print(moveResult.event.lore, 'lore');
      }
      this.printBlank();
      this.printOption('1', '  [계속]');
      this.currentScreen = 'dungeon_node';
      const self = this;
      const origHandler = this.handleDungeonNode.bind(this);
      this.handleDungeonNode = function(_c) {
        self.handleDungeonNode = origHandler;
        self.showDungeonNode();
      };
      return;
    }

    // Normal move — show the new node
    this.showDungeonNode();
  }

  doRetreat() {
    const result = this.dungeon.retreat();
    this.clearOutput();
    this.printSeparator();
    this.print(result.message, 'success');
    this.printBlank();
    if (result.collected && result.collected.length > 0) {
      this.print('이번 탐사에서 수집한 재료:', 'system');
      for (const item of result.collected) {
        this.print(`  ${item.name} x${item.qty}`, 'dim');
      }
      this.printBlank();
    }
    this.printOption('1', '  [마을로 돌아가기]');
    this.currentScreen = 'advance_day';
    const self = this;
    this.handleAdvanceDay = function(_c) {
      self.handleAdvanceDay = App.prototype.handleAdvanceDay.bind(self);
      self.updateStatus();
      self.showTownMenu();
    };
  }

  // ============================================================
  //  SCREEN: Encounter (unit meeting in dungeon)
  // ============================================================
  showEncounter() {
    this.currentScreen = 'encounter';
    this.clearOutput();
    this.printSeparator();
    this.print('【 조우 】', 'location');
    this.printBlank();

    const enc = this._encounter;
    if (!enc || !enc.unitDef) {
      this.print('알 수 없는 조우입니다.', 'error');
      this.showDungeonNode();
      return;
    }

    const ud = enc.unitDef;
    this.print(`${ud.name}이(가) 나타났다!`, 'unit');
    this.print(`  Lv.${ud.level}  인: ${ud.sigilName}  원소: ${ud.primaryElement || '없음'}  분류: ${ud.category}`, 'dim');
    if (ud.personalityTraits && ud.personalityTraits.length > 0) {
      const names = ud.personalityTraits.map(t => typeof t === 'object' ? t.name : t).filter(Boolean);
      if (names.length > 0) this.print(`  성향: ${names.join(', ')}`, 'dim');
    }
    this.printBlank();
    this.printOption('1', '  1. 대화 (교섭)');
    this.printOption('2', '  2. 전투');
    this.printOption('3', '  3. 도주');
    this.printBlank();
    this.setActions([
      {key:'1', label:'대화(교섭)'}, {key:'2', label:'전투'}, {key:'3', label:'도주'}
    ]);
  }

  handleEncounter(cmd) {
    switch (cmd) {
      case '1':
        this.doNegotiation();
        break;
      case '2':
        this.startCombatFromEncounter();
        break;
      case '3':
        this.doEncounterFlee();
        break;
      default:
        this.print('1~3 사이의 번호를 입력하세요.', 'error');
        break;
    }
  }

  doNegotiation() {
    const enc = this._encounter;
    if (!enc || !enc.unitDef) return;

    this._negotiationAttempt++;
    const result = this.dungeon.attemptNegotiation(enc.unitDef, null);

    this.printBlank();
    this.print(`교섭 시도... (성공률: ${result.chance}%)`, 'system');
    this.printBlank();

    if (result.success) {
      // Recruit!
      const instance = this.dungeon.recruitUnit(enc.unitDef);
      if (this.engine.state.tutorial) this.engine.state.tutorial.firstRecruitment = true;
      this.print(`${enc.unitDef.name}이(가) 동료가 되었다!`, 'success');
      this.print(`  인: ${instance.sigilName} | Lv.${instance.level} | ${instance.category}`, 'unit');
      this.printBlank();

      // Check if party has room
      const partySize = this.engine.state.party.length;
      const maxParty = this.engine.state.maxPartySize;
      if (partySize < maxParty) {
        this.print(`파티에 빈 자리가 있다. (${partySize}/${maxParty})`, 'system');
        this.printOption('1', '  1. 파티에 편입');
        this.printOption('2', '  2. 공방으로 송환');
        this.printBlank();
        this._recruitedInstance = instance;
        this.currentScreen = 'recruit_choice';
      } else {
        this.print(`파티가 가득 차 있어 공방으로 송환된다. (${partySize}/${maxParty})`, 'dim');
        this.printBlank();
        this.printOption('1', '  [계속]');
        this.currentScreen = 'dungeon_node';
        const self = this;
        const origHandler = this.handleDungeonNode.bind(this);
        this.handleDungeonNode = function(_c) {
          self.handleDungeonNode = origHandler;
          self.updateStatus();
          self.showDungeonNode();
        };
      }
    } else {
      // Failure
      const failResult = this.dungeon.handleNegotiationFailure(enc.unitDef, this._negotiationAttempt);
      this.print(failResult.message, 'error');
      this.printBlank();

      if (failResult.result === 'fight') {
        this.print('전투가 시작된다!', 'combat');
        this.printBlank();
        this.printOption('1', '  [전투 시작]');
        this.currentScreen = 'encounter';
        const self = this;
        const origEncHandler = this.handleEncounter.bind(this);
        this.handleEncounter = function(_c) {
          self.handleEncounter = origEncHandler;
          self.startCombatFromEncounter();
        };
      } else if (failResult.result === 'flee') {
        this.printOption('1', '  [계속]');
        this.currentScreen = 'dungeon_node';
        const self = this;
        const origHandler = this.handleDungeonNode.bind(this);
        this.handleDungeonNode = function(_c) {
          self.handleDungeonNode = origHandler;
          self.showDungeonNode();
        };
      } else if (failResult.result === 'rejected' && this._negotiationAttempt < 2) {
        // Can try again
        this.printOption('1', '  1. 다시 대화 시도');
        this.printOption('2', '  2. 전투');
        this.printOption('3', '  3. 도주');
        this.printBlank();
        // Stay on encounter screen
      } else {
        // ignore — unit leaves
        this.printOption('1', '  [계속]');
        this.currentScreen = 'dungeon_node';
        const self = this;
        const origHandler = this.handleDungeonNode.bind(this);
        this.handleDungeonNode = function(_c) {
          self.handleDungeonNode = origHandler;
          self.showDungeonNode();
        };
      }
    }
  }

  doEncounterFlee() {
    this.printBlank();
    if (Math.random() < 0.7) {
      this.print('빠르게 뒤로 물러선다. 도주 성공!', 'success');
      this.printBlank();
      this.printOption('1', '  [계속]');
      this.currentScreen = 'dungeon_node';
      const self = this;
      const origHandler = this.handleDungeonNode.bind(this);
      this.handleDungeonNode = function(_c) {
        self.handleDungeonNode = origHandler;
        self.showDungeonNode();
      };
    } else {
      this.print('도주에 실패했다! 전투가 시작된다!', 'combat');
      this.printBlank();
      this.printOption('1', '  [전투 시작]');
      this.currentScreen = 'encounter';
      const self = this;
      const origEncHandler = this.handleEncounter.bind(this);
      this.handleEncounter = function(_c) {
        self.handleEncounter = origEncHandler;
        self.startCombatFromEncounter();
      };
    }
  }

  // ============================================================
  //  SCREEN: Combat
  // ============================================================
  handleRecruitChoice(cmd) {
    const n = parseInt(cmd);
    const instance = this._recruitedInstance;
    if (!instance) { this.showDungeonNode(); return; }

    if (n === 1) {
      // 파티 편입
      this.engine.state.party.push(instance.instanceId);
      this.print(`${instance.name}이(가) 파티에 합류했다!`, 'success');
    } else {
      this.print(`${instance.name}은(는) 공방으로 보내졌다.`, 'dim');
    }
    this._recruitedInstance = null;
    this.printBlank();
    this.updateStatus();
    this.showDungeonNode();
  }

  startCombatFromEncounter() {
    const enc = this._encounter;
    if (!enc) {
      this.print('조우 정보가 없습니다.', 'error');
      this.showDungeonNode();
      return;
    }

    // Commander system: only units fight. Player commands.
    const partyInstances = this.engine.getPartyUnits().filter(u => !u.isKnockedOut);
    if (partyInstances.length === 0) {
      this.print('전투 가능한 유닛이 없다! 귀환해야 한다.', 'error');
      this.dungeon.retreat();
      this.showTownMenu();
      return;
    }

    this.combat.startBattle(partyInstances, enc.enemies);
    this.showCombatScreen();
  }

  showCombatScreen() {
    this.currentScreen = 'combat';
    this.clearOutput();
    this.printSeparator();
    this.print('【 전투 】', 'combat');
    this.printBlank();

    const bs = this.combat.battleState;

    // Commander status
    this.print(`☆ ${this.engine.state.player.name} [지휘 중]`, 'system');
    this.printBlank();
    // Show ally/enemy HP
    this.print('— 아군 유닛 —', 'system');
    for (const u of bs.allies) {
      const koText = u.isKO ? ' [기절]' : '';
      this.print(`  ${u.name} HP:${Math.max(0, u.hp)}/${u.maxHp}${koText}`, 'unit');
    }
    this.printBlank();
    this.print('— 적 —', 'system');
    for (const u of bs.enemies) {
      const koText = u.isKO ? ' [기절]' : '';
      this.print(`  ${u.name} HP:${Math.max(0, u.hp)}/${u.maxHp}${koText}`, 'danger');
    }
    this.printBlank();

    if (bs.finished) {
      this.showCombatEnd();
      return;
    }

    this.printOption('1', '  1. 다음 라운드 (계속)');
    this.printOption('2', '  2. 아이템 사용');
    this.printOption('3', '  3. 도주');
    this.setActions([{key:'1', label:'계속'}, {key:'2', label:'아이템'}, {key:'3', label:'도주'}]);
    this.printBlank();
  }

  handleCombat(cmd) {
    switch (cmd) {
      case '1':
        this.executeCombatRound();
        break;
      case '2':
        this.doCombatItem();
        break;
      case '3':
        this.doCombatFlee();
        break;
      default:
        this.print('1~3 사이의 번호를 입력하세요.', 'error');
        break;
    }
  }

  executeCombatRound() {
    const roundResult = this.combat.executeRound();

    this.printBlank();
    for (const entry of roundResult.log) {
      let cls = 'dim';
      if (entry.type === 'round') cls = 'system';
      else if (entry.type === 'action') cls = 'description';
      else if (entry.type === 'skill') cls = 'lore';
      else if (entry.type === 'ko') cls = 'combat';
      else if (entry.type === 'summary') cls = 'system';
      else if (entry.type === 'result') cls = entry.text.includes('승리') ? 'success' : 'danger';
      this.print(entry.text, cls);
    }
    this.printBlank();

    if (roundResult.finished) {
      this.showCombatEnd();
    } else {
      // Show updated HP
      const bs = this.combat.battleState;
      this.print('— 아군 —', 'system');
      for (const u of bs.allies) {
        if (!u.isKO) this.print(`  ${u.name} HP:${u.hp}/${u.maxHp}`, 'unit');
      }
      this.print('— 적 —', 'system');
      for (const u of bs.enemies) {
        if (!u.isKO) this.print(`  ${u.name} HP:${u.hp}/${u.maxHp}`, 'danger');
      }
      this.printBlank();
      this.printOption('1', '  1. 다음 라운드 (계속)');
      this.printOption('2', '  2. 아이템 사용');
      this.printOption('3', '  3. 도주');
      this.printBlank();
    }
    this.updateStatus();
  }

  doCombatItem() {
    // List usable items (전투 중: 물약만. 식량은 전투 중 사용 불가)
    const inv = this.engine.state.inventory;
    const usableItems = [];
    for (const [matId, qty] of Object.entries(inv)) {
      if (qty <= 0) continue;
      if (matId.startsWith('MAT_')) continue;
      const mat = this.engine.data.materials.find(m => m.id === matId);
      if (!mat) continue;
      if (mat.category === 'consumable_food') continue; // 식량은 전투 중 사용 불가
      if (mat.effect && (mat.effect.type === 'heal' || mat.effect.type === 'damage' || mat.effect.type === 'debuff')) {
        usableItems.push({ id: matId, name: mat.name, qty, effect: mat.effect });
      }
    }

    if (usableItems.length === 0) {
      this.print('사용 가능한 아이템이 없습니다. (물약/독물약을 만들어오세요. 식량은 전투 밖에서만 사용 가능)', 'dim');
      return;
    }

    this.print('사용 가능한 아이템:', 'system');
    usableItems.forEach((item, i) => {
      this.printOption(`${i + 1}`, `  ${i + 1}. ${item.name} x${item.qty} — ${item.effect.desc}`);
    });
    this.printOption('0', '  0. 취소');
    this.printBlank();

    // Temporarily override handler for item selection
    this._combatItems = usableItems;
    const self = this;
    const origHandler = this.handleCombat.bind(this);
    this.handleCombat = function(c) {
      self.handleCombat = origHandler;
      if (c === '0') {
        self.print('취소했습니다.', 'dim');
        return;
      }
      const idx = parseInt(c);
      if (isNaN(idx) || idx < 1 || idx > self._combatItems.length) {
        self.print('올바른 번호를 입력하세요.', 'error');
        return;
      }
      const selected = self._combatItems[idx - 1];
      self.engine.removeMaterial(selected.id, 1);

      if (selected.effect.type === 'heal') {
        // Heal lowest HP ally
        const allies = self.combat.battleState.allies.filter(u => !u.isKO);
        const target = allies.reduce((min, u) => u.hp < min.hp ? u : min, allies[0]);
        if (target) {
          target.hp = Math.min(target.maxHp, target.hp + selected.effect.value);
          self.print(`${target.name}의 HP가 ${selected.effect.value} 회복되었다!`, 'heal');
        }
      } else if (selected.effect.type === 'damage') {
        // Damage first alive enemy
        const enemies = self.combat.battleState.enemies.filter(u => !u.isKO);
        if (enemies.length > 0) {
          const target = enemies[0];
          target.hp = Math.max(0, target.hp - selected.effect.value);
          self.print(`${target.name}에게 ${selected.effect.value} 데미지!`, 'combat');
          if (target.hp <= 0) {
            target.isKO = true;
            self.print(`${target.name}이(가) 쓰러졌다!`, 'combat');
          }
        }
      }
      self.updateStatus();
    };
  }

  doCombatFlee() {
    const partySpeed = this.engine.getPartyUnits()
      .filter(u => !u.isKnockedOut)
      .reduce((sum, u) => sum + u.spd, this.engine.state.player.spd) /
      (this.engine.getPartyUnits().filter(u => !u.isKnockedOut).length + 1);

    const success = this.combat.attemptFlee(partySpeed);

    if (success) {
      this.print('도주에 성공했다!', 'success');
      this.printBlank();
      // Apply partial results
      this.combat.applyBattleResults();
      this.updateStatus();
      this.printOption('1', '  [계속]');
      this.currentScreen = 'combat_result';
      this._combatWon = false;
      this._combatFled = true;
    } else {
      this.print('도주에 실패했다!', 'error');
      this.printBlank();
      // Enemy gets a free round
      this.executeCombatRound();
    }
  }

  showCombatEnd() {
    this.currentScreen = 'combat_result';
    const bs = this.combat.battleState;
    const won = bs.result === 'win';
    this._combatWon = won;
    this._combatFled = bs.result === 'flee';

    this.printSeparator();
    if (won) {
      this.print('전투 승리!', 'success');
    } else if (bs.result === 'flee') {
      this.print('도주 성공.', 'system');
    } else {
      this.print('유닛 전멸... 연금술사가 부상을 입었다!', 'danger');
    }
    this.printBlank();

    // Apply battle results
    const results = this.combat.applyBattleResults();
    if (results) {
      if (results.won) {
        if (results.drops.length > 0) {
          this.print('획득 아이템:', 'system');
          for (const drop of results.drops) {
            this.print(`  ▸ ${drop.name} ×${drop.qty}`, 'lore');
          }
        }
        if (results.expGained > 0) {
          this.print(`전투 경험치: +${Math.floor(results.expGained)}`, 'success');
        }
        if (results.levelUps && results.levelUps.length > 0) {
          for (const lu of results.levelUps) {
            this.print(`  ★ ${lu.name} 레벨 업! → Lv.${lu.newLevel}`, 'success');
          }
        }

        // Boss milestone check
        const enemies = bs.enemies || [];
        const defeatedBoss = enemies.find(e => e.isBoss);
        if (defeatedBoss) {
          const floor = this.engine.state.dungeon.currentFloor;
          this.printBlank();
          this.print(`★ 보스 격파! (${floor}층)`, 'lore');

          if (floor === 5 && !this.engine.state.milestones.firstBossDefeated) {
            this.engine.state.milestones.firstBossDefeated = true;
          }
          if (floor === 10 && !this.engine.state.milestones.floor10Cleared) {
            this.engine.state.milestones.floor10Cleared = true;
          }
          if (floor === 15 && !this.engine.state.milestones.floor15Cleared) {
            this.engine.state.milestones.floor15Cleared = true;
          }

          // Apply milestone rewards (party expansion etc.)
          const rewards = this.engine.checkMilestones();
          for (const r of rewards) {
            this.print(`  ★ ${r}`, 'success');
          }
        }
      }
    }

    // Show player injury on loss
    if (results && results.playerInjury) {
      this.printBlank();
      const p = this.engine.state.player;
      this.print(`연금술사 부상: HP -${results.playerInjury} (잔여 HP: ${p.hp}/${p.maxHp})`, 'error');
      if (p.hp <= 0) {
        p.hp = 0;
        p.recoveryDays = 3;
        this.print('심각한 부상! 3일간 탐사 불가.', 'error');
      }
    }

    this.printBlank();
    this.printOption('1', '  [계속]');
    this.setActions([{key:'1', label:'계속'}]);
    this.updateStatus();
  }

  handleCombatResult(_cmd) {
    const bs = this.combat.battleState;
    if (bs && bs.result === 'lose') {
      // Wipe
      const wipeResult = this.dungeon.handleWipe();
      this.clearOutput();
      this.printSeparator();
      this.print('의식을 잃고 도시로 강제 귀환되었다...', 'danger');
      this.printBlank();
      this.print(wipeResult.message, 'system');
      if (wipeResult.lost && wipeResult.lost.length > 0) {
        this.print('잃어버린 재료:', 'error');
        for (const item of wipeResult.lost) {
          this.print(`  ${item.name} x${item.qty}`, 'dim');
        }
      }
      this.printBlank();
      this.updateStatus();

      // Check bankruptcy
      const bankCheck = this.economy.checkBankruptcy();
      if (bankCheck.bankrupt) {
        this.showEndGame(false);
        return;
      }

      this.showTownMenu();
    } else {
      // Won or fled — return to dungeon
      this.showDungeonNode();
    }
  }

  // ============================================================
  //  SCREEN: Crafting
  // ============================================================
  showCrafting() {
    this.currentScreen = 'crafting';
    this.clearOutput();
    this.printSeparator();
    this.print('【 공방 — 가공/연구 】', 'location');
    this.printBlank();
    this.print('작업대 위에 도구들이 정리되어 있다.', 'description');

    // Show available equipment
    const eq = this.engine.state.equipment;
    this.print(`  장비: 가마${eq.furnace ? '(O)' : '(X)'} | 분쇄기${eq.crusher ? '(O)' : '(X)'} | 압축기${eq.compressor ? '(O)' : '(X)'}`, 'dim');
    this.printBlank();
    this.printOption('1', '  1. 가공 (재료에 장비 사용)');
    this.printOption('2', '  2. 조합 (재료 2개 합성)');
    this.printOption('3', '  3. 레시피 확인');
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
    this.setActions([{key:'1', label:'가공'}, {key:'2', label:'조합'}, {key:'3', label:'레시피'}, {key:'0', label:'돌아가기'}]);
    this.updateStatus();
  }

  handleCrafting(cmd) {
    switch (cmd) {
      case '1': this.showCraftingProcess(); break;
      case '2': this.showCraftingCombine(); break;
      case '3': this.showRecipeList();      break;
      case '0': this.showTownMenu();        break;
      default:
        this.print('0~3 사이의 번호를 입력하세요.', 'error');
        break;
    }
  }

  showCraftingProcess() {
    this.currentScreen = 'crafting_process';
    this.printBlank();
    this.print('── 가공할 재료 선택 ──', 'system');

    const inv = this.engine.state.inventory;
    const matIds = Object.keys(inv).filter(id => inv[id] > 0);
    this._inventoryList = matIds;

    if (matIds.length === 0) {
      this.print('  가공 가능한 재료가 없습니다.', 'dim');
      this.printBlank();
      this.printOption('0', '  0. 돌아가기');
      return;
    }

    matIds.forEach((matId, i) => {
      const name = this.engine.getMaterialName(matId);
      this.printOption(`${i + 1}`, `  ${i + 1}. ${name} x${inv[matId]}`);
    });
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
  }

  handleCraftingProcess(cmd) {
    if (cmd === '0') {
      this.showCrafting();
      return;
    }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._inventoryList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    const matId = this._inventoryList[idx - 1];
    this._processingMatId = matId;

    // Show processing options for this material
    const options = this.crafting.getProcessingOptions(matId);
    this._processingOptions = options;

    if (options.length === 0) {
      this.print('이 재료에 사용 가능한 가공 장비가 없습니다.', 'dim');
      return;
    }

    this.currentScreen = 'crafting_process_eq';
    const matName = this.engine.getMaterialName(matId);
    this.printBlank();
    this.print(`── ${matName} 가공 장비 선택 ──`, 'system');
    options.forEach((opt, i) => {
      this.printOption(`${i + 1}`, `  ${i + 1}. ${opt.name}`);
    });
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
  }

  handleCraftingProcessEq(cmd) {
    if (cmd === '0') {
      this.showCraftingProcess();
      return;
    }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._processingOptions.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    const equipId = this._processingOptions[idx - 1].id;
    const result = this.crafting.processMaterial(this._processingMatId, equipId);

    if (!result.success) {
      this.print(result.reason, 'error');
      return;
    }

    this.printBlank();
    this.print('가공 완료!', 'success');
    this.print(`  ${result.input} → ${result.result.name || '가공물'}`, 'lore');
    this._printTagSummary(result.result);
    this.printBlank();
    this.printOption('1', '  [공방으로]');
    this.currentScreen = 'craft_result';
    this.setActions([{key:'1', label:'공방으로'}]);
    this.updateStatus();

    const self = this;
    this._craftResultHandler = function(_c) {
      delete self._craftResultHandler;
      self.showCrafting();
    };
  }

  showCraftingCombine() {
    this.currentScreen = 'crafting_combine';
    this._combineStep = 1;
    this.printBlank();
    this.print('── 조합: 첫 번째 재료 선택 ──', 'system');

    const inv = this.engine.state.inventory;
    const matIds = Object.keys(inv).filter(id => inv[id] > 0);
    this._inventoryList = matIds;

    if (matIds.length < 2) {
      this.print('  조합하려면 재료가 2종류 이상 필요합니다.', 'dim');
      this.printBlank();
      this.printOption('0', '  0. 돌아가기');
      this.setActions([{key:'0', label:'돌아가기'}]);
      return;
    }

    matIds.forEach((matId, i) => {
      const name = this.engine.getMaterialName(matId);
      this.printOption(`${i + 1}`, `  ${i + 1}. ${name} x${inv[matId]}`);
    });
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
  }

  handleCraftingCombine(cmd) {
    if (cmd === '0') {
      this.showCrafting();
      return;
    }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._inventoryList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    this._combineMatA = this._inventoryList[idx - 1];
    const nameA = this.engine.getMaterialName(this._combineMatA);
    this.print(`  첫 번째 재료: ${nameA}`, 'system');
    this.printBlank();

    // Show second material list
    this.currentScreen = 'crafting_combine_b';
    this.print('── 두 번째 재료 선택 ──', 'system');

    const inv = this.engine.state.inventory;
    const matIds = Object.keys(inv).filter(id => {
      if (id === this._combineMatA && inv[id] < 2) return false;
      return inv[id] > 0;
    });
    this._inventoryList = matIds;

    matIds.forEach((matId, i) => {
      const name = this.engine.getMaterialName(matId);
      this.printOption(`${i + 1}`, `  ${i + 1}. ${name} x${inv[matId]}`);
    });
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
  }

  handleCraftingCombineB(cmd) {
    if (cmd === '0') {
      this.showCraftingCombine();
      return;
    }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._inventoryList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    this._combineMatB = this._inventoryList[idx - 1];
    const nameA = this.engine.getMaterialName(this._combineMatA);
    const nameB = this.engine.getMaterialName(this._combineMatB);

    this.printBlank();
    this.print(`조합: ${nameA} + ${nameB}`, 'system');

    const result = this.crafting.combine(this._combineMatA, this._combineMatB);

    if (!result.success) {
      this.print(result.reason, 'error');
      this.showCrafting();
      return;
    }

    this.printBlank();
    if (result.type === 'special') {
      this.print('특수 레시피 발동!', 'lore');
    } else if (result.type === 'unknown') {
      this.print('모순이 너무 많아 미지의 결과물이 생성되었다...', 'error');
    }

    this.print(`결과: ${result.result.name}`, 'success');
    if (this.engine.state.tutorial) this.engine.state.tutorial.firstCrafting = true;
    this._printTagSummary(result.result);
    if (result.result.effect && result.result.effect.desc) {
      this.print(`  효과: ${result.result.effect.desc}`, 'dim');
    }
    if (result.contradictions !== undefined && result.contradictions > 0) {
      this.print(`  모순: ${result.contradictions}쌍`, 'dim');
    }

    // Special: 압축기 제작 시 자동 설비 설치
    if (result.result.id === 'ITEM_COMPRESSOR' && !this.engine.state.equipment.compressor) {
      this.engine.removeMaterial('ITEM_COMPRESSOR', 1);
      this.engine.state.equipment.compressor = true;
      this.engine.state.milestones.compressorBuilt = true;
      this.printBlank();
      this.print('★ 압축기가 공방에 설치되었다!', 'success');
      this.print('  새로운 가공 경로 개방: 압축 (위 주입 + 동 해방)', 'lore');
      this.print('  주의: 이제부터 월간 유지비가 발생합니다.', 'error');
    }

    // 채집 도구 업그레이드 자동 장착
    const toolUpgrades = {
      'TOOL_PICKAXE_2': { key: 'pickaxe', tier: 2, name: '단단한 곡괭이' },
      'TOOL_SICKLE_2':  { key: 'sickle',  tier: 2, name: '날카로운 낫' },
      'TOOL_FISHING_ROD_2': { key: 'rod', tier: 2, name: '튼튼한 낚시대' },
    };
    const upgrade = toolUpgrades[result.result.id];
    if (upgrade) {
      this.engine.removeMaterial(result.result.id, 1);
      const tool = this.engine.state.gatherTools[upgrade.key];
      tool.id = result.result.id;
      tool.tier = upgrade.tier;
      tool.name = upgrade.name;
      this.printBlank();
      this.print(`★ ${upgrade.name} 장착! 채집량 ×${1 + (upgrade.tier - 1) * 0.5}`, 'success');
    }

    // 조합 상태 리셋
    this._combineMatA = null;
    this._combineMatB = null;
    this._combineStep = 0;

    this.printBlank();
    this.printOption('1', '  [공방으로]');
    this.currentScreen = 'craft_result'; // 전용 화면으로 (crafting_combine_b 탈출)
    this.setActions([{key:'1', label:'공방으로'}]);
    this.updateStatus();

    const self = this;
    this._craftResultHandler = function(_c) {
      delete self._craftResultHandler;
      self.showCrafting();
    };
  }

  showRecipeList() {
    this.currentScreen = 'recipe_list';
    this.clearOutput();
    this.printSeparator();
    this.print('【 레시피 목록 】', 'location');
    this.printBlank();

    const recipes = this.crafting.getKnownRecipes();
    this._recipeList = recipes;

    if (recipes.length === 0) {
      this.print('  아직 발견한 레시피가 없습니다.', 'dim');
    } else {
      recipes.forEach((r, i) => {
        const matNames = (r.materials || []).map(mid => this.engine.getMaterialName(mid));
        const canCraft = this.crafting.canCraftRecipe(r);
        const craftTag = canCraft ? '[제작 가능]' : '[재료 부족]';
        if (canCraft) {
          this.printOption(`${i + 1}`, `  ${i + 1}. ${r.name} ← ${matNames.join(' + ')} ${craftTag}`);
        } else {
          this.print(`  ${i + 1}. ${r.name} ← ${matNames.join(' + ')} ${craftTag}`, 'dim');
        }
      });
    }
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
  }

  handleRecipeList(cmd) {
    if (cmd === '0') { this.showCrafting(); return; }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || !this._recipeList || idx > this._recipeList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }
    const recipe = this._recipeList[idx - 1];
    const result = this.crafting.craftRecipe(recipe.id);
    this.printBlank();
    if (!result.success) {
      this.print(result.reason, 'error');
      return;
    }
    this.print(`제작 완료: ${result.result.name}`, 'success');
    this._printTagSummary(result.result);
    if (result.result.effect) {
      this.print(`  효과: ${result.result.effect}`, 'dim');
    }

    // 압축기 자동 설치
    if (result.result.id === 'ITEM_COMPRESSOR' && !this.engine.state.equipment.compressor) {
      this.engine.removeMaterial('ITEM_COMPRESSOR', 1);
      this.engine.state.equipment.compressor = true;
      this.engine.state.milestones.compressorBuilt = true;
      this.printBlank();
      this.print('★ 압축기가 공방에 설치되었다!', 'success');
    }

    // 채집 도구 자동 장착
    const toolUp = { 'TOOL_PICKAXE_2':{key:'pickaxe',tier:2}, 'TOOL_SICKLE_2':{key:'sickle',tier:2}, 'TOOL_FISHING_ROD_2':{key:'rod',tier:2} };
    const tu = toolUp[result.result.id];
    if (tu) {
      this.engine.removeMaterial(result.result.id, 1);
      const tool = this.engine.state.gatherTools[tu.key];
      tool.id = result.result.id;
      tool.tier = tu.tier;
      tool.name = result.result.name;
      this.print(`★ ${result.result.name} 장착!`, 'success');
    }

    this.printBlank();
    this.updateStatus();
    this.showRecipeList();
  }

  // ============================================================
  //  SCREEN: Unit Management
  // ============================================================
  showUnitManagement() {
    this.currentScreen = 'unit_management';
    this.clearOutput();
    this.printSeparator();
    this.print('【 유닛 관리 】', 'location');
    this.printBlank();

    const units = this.engine.state.ownedUnits;
    this._unitList = units;

    if (units.length === 0) {
      this.print('  보유 유닛이 없습니다.', 'dim');
    } else {
      units.forEach((u, i) => {
        const affStage = this.unit.getAffectionStage(u.affection);
        const inParty = this.engine.state.party.includes(u.instanceId) ? ' [파티]' : '';
        const facilityText = u.assignedFacility ? ` [${this.economy.getFacilityName(u.assignedFacility)}]` : '';
        const koText = u.isKnockedOut ? ' [기절]' : '';
        this.printOption(`${i + 1}`,
          `  ${i + 1}. ${u.name} Lv.${u.level} | 인:${u.sigilName} | HP:${u.hp}/${u.maxHp} | ` +
          `호감:${affStage.name}(${u.affection})${inParty}${facilityText}${koText}`,
          'unit'
        );
      });
    }
    this.printBlank();
    this.print('유닛 번호를 입력하여 상세 보기 (0 = 돌아가기)', 'dim');
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
    this.updateStatus();
  }

  handleUnitManagement(cmd) {
    if (cmd === '0') {
      this.showTownMenu();
      return;
    }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._unitList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    this._selectedUnitId = this._unitList[idx - 1].instanceId;
    this.showUnitDetail();
  }

  showUnitDetail() {
    this.currentScreen = 'unit_detail';
    const u = this.engine.getUnitInstance(this._selectedUnitId);
    if (!u) {
      this.print('유닛을 찾을 수 없습니다.', 'error');
      this.showUnitManagement();
      return;
    }

    this.clearOutput();
    this.printSeparator();
    this.print(`【 ${u.name} 상세 】`, 'location');
    this.printBlank();

    const affStage = this.unit.getAffectionStage(u.affection);
    this.print(`  이름: ${u.name}`, 'unit');
    this.print(`  레벨: ${u.level}`, 'dim');
    this.print(`  인: ${u.sigilName} (${u.sigil})`, 'dim');
    this.print(`  분류: ${u.category}`, 'dim');
    this.print(`  원소: ${u.primaryElement || '없음'} / ${u.secondaryElement || '없음'}`, 'dim');
    this.print(`  HP: ${u.hp}/${u.maxHp}  ATK:${u.atk}  DEF:${u.def}  SPD:${u.spd}`, 'dim');
    this.print(`  호감도: ${u.affection} (${affStage.name})`, 'relation');

    if (u.traits.length > 0) {
      const traitNames = u.traits.map(tid => {
        const td = this.engine.data.traits.find(t => t.id === tid);
        return td ? td.name : tid;
      });
      this.print(`  특성: ${traitNames.join(', ')}`, 'lore');
    }

    // Experience
    this.print(`  경험치 — 전투:${u.exp.combat} 신체:${u.exp.body} 성격:${u.exp.personality} 성인:${u.exp.adult}`, 'dim');

    // Equipment
    const slotNames = { weapon: '무기', armor: '방어구', accessory: '장신구' };
    const eqNames = [];
    for (const [slot, itemId] of Object.entries(u.equipment)) {
      if (itemId) {
        const mat = this.engine.data.materials.find(m => m.id === itemId);
        eqNames.push(`${slotNames[slot] || slot}: ${mat ? mat.name : itemId}`);
      }
    }
    if (eqNames.length > 0) {
      this.print(`  장비: ${eqNames.join(' | ')}`, 'dim');
    }

    if (u.isKnockedOut) {
      this.print(`  ★ 기절 상태 (회복까지 ${u.recoveryDays}일)`, 'error');
    }

    const inParty = this.engine.state.party.includes(u.instanceId);
    this.printBlank();

    if (u.isKnockedOut) {
      this.printOption('1', '  1. 치료 (회복 아이템 사용)');
      this.printOption('2', '  2. 납품 (영혼력 획득)');
      this.printOption('0', '  0. 돌아가기');
      this.printBlank();
      this.setActions([{key:'1',label:'치료'},{key:'2',label:'납품'},{key:'0',label:'돌아가기'}]);
    } else {
      this.printOption('1', '  1. 장비 변경');
      this.printOption('2', `  2. 파티 편성 (현재: ${inParty ? '편성됨' : '미편성'})`);
      this.printOption('3', '  3. 납품 (영혼력 획득)');
      this.printOption('4', '  4. 합체 (유닛 합성)');
      this.printOption('5', '  5. 치료 (회복 아이템 사용)');
      this.printOption('0', '  0. 돌아가기');
      this.printBlank();
      this.setActions([{key:'1',label:'장비'},{key:'2',label:'파티'},{key:'3',label:'납품'},{key:'4',label:'합체'},{key:'5',label:'치료'},{key:'0',label:'돌아가기'}]);
    }
    this.updateStatus();
  }

  handleUnitDetail(cmd) {
    const u = this.engine.getUnitInstance(this._selectedUnitId);
    if (u && u.isKnockedOut) {
      // 기절 시 메뉴
      switch (cmd) {
        case '1': this.doHealUnit();         break;
        case '2': this.doDeliver();          break;
        case '0': this.showUnitManagement(); break;
        default: this.print('올바른 번호를 입력하세요.', 'error'); break;
      }
    } else {
      // 정상 메뉴 (훈련/교류/조교는 조교소로 이동됨)
      switch (cmd) {
        case '1': this.doEquipChange();      break;
        case '2': this.doPartyToggle();      break;
        case '3': this.doDeliver();          break;
        case '4': this.showFusionSelectA();  break;
        case '5': this.doHealUnit();         break;
        case '0': this.showUnitManagement(); break;
        default: this.print('올바른 번호를 입력하세요.', 'error'); break;
      }
    }
  }

  doTrain() {
    const result = this.unit.trainUnit(this._selectedUnitId);
    this.printBlank();
    if (!result.success) {
      this.print(result.reason, 'error');
      return;
    }
    this.print(result.message, 'success');
    if (result.unlocked) {
      this.print(`  새로운 특성 해금: ${result.unlocked.traitName}!`, 'lore');
    }
    if (result.leveled) {
      this.print(`  레벨 업! → Lv.${result.leveled.newLevel}`, 'success');
    }
    this.printBlank();
    this.updateStatus();
    this.showUnitDetail();
  }

  doSocialize() {
    const result = this.unit.socialize(this._selectedUnitId);
    this.printBlank();
    if (!result.success) {
      this.print(result.reason, 'error');
      return;
    }
    this.print(result.message, 'success');
    if (result.unlocked) {
      this.print(`  새로운 특성 해금: ${result.unlocked.traitName}!`, 'lore');
    }
    if (result.leveled) {
      this.print(`  ★ 레벨 업! → Lv.${result.leveled.newLevel}`, 'success');
    }
    this.printBlank();
    this.updateStatus();
    this.showUnitDetail();
  }

  doHealUnit() {
    const u = this.engine.getUnitInstance(this._selectedUnitId);
    if (!u) return;

    // Find healing items (제작품만 — 원재료 직접 사용 불가)
    const healItems = [];
    const inv = this.engine.state.inventory;
    for (const [matId, qty] of Object.entries(inv)) {
      if (qty <= 0) continue;
      if (matId.startsWith('MAT_')) continue; // 원재료 제외
      const mat = this.engine.data.materials.find(m => m.id === matId);
      if (!mat) continue;
      const isHeal = (mat.effect && mat.effect.type === 'heal') ||
        (mat.category === 'consumable_potion') || (mat.category === 'consumable_food');
      if (isHeal) {
        healItems.push({ id: matId, name: mat.name, qty, effect: mat.effect || { type: 'heal', value: 20, desc: 'HP 회복' } });
      }
    }

    if (healItems.length === 0) {
      this.print('회복 아이템이 없습니다. (물약이나 스프를 만들어보세요)', 'error');
      return;
    }

    this.printBlank();
    this.print('── 치료: 아이템 선택 ──', 'system');

    if (u.isKnockedOut) {
      this.print(`  ${u.name} — 기절 (회복까지 ${u.recoveryDays}일)`, 'error');
    } else {
      this.print(`  ${u.name} — HP: ${u.hp}/${u.maxHp}`, 'unit');
    }
    this.printBlank();

    healItems.forEach((item, i) => {
      this.printOption(`${i + 1}`, `  ${i + 1}. ${item.name} ×${item.qty} — ${item.effect.desc}`);
    });
    this.printOption('0', '  0. 취소');
    this.setActions([{key:'0', label:'취소'}]);

    const self = this;
    const origHandler = this.handleUnitDetail.bind(this);
    this.handleUnitDetail = function(c) {
      self.handleUnitDetail = origHandler;
      if (c === '0') { self.showUnitDetail(); return; }

      const idx = parseInt(c);
      if (isNaN(idx) || idx < 1 || idx > healItems.length) {
        self.print('올바른 번호를 입력하세요.', 'error');
        self.showUnitDetail();
        return;
      }

      const selected = healItems[idx - 1];
      self.engine.removeMaterial(selected.id, 1);

      if (u.isKnockedOut) {
        // 기절 해제 + HP 부분 회복
        u.isKnockedOut = false;
        u.recoveryDays = 0;
        u.hp = Math.min(u.maxHp, Math.floor(u.maxHp * 0.3) + (selected.effect.value || 20));
        self.print(`${selected.name}을(를) 사용! ${u.name}의 기절이 풀렸다! (HP: ${u.hp}/${u.maxHp})`, 'success');
      } else {
        // HP 회복
        const healAmt = selected.effect.value || 20;
        const before = u.hp;
        u.hp = Math.min(u.maxHp, u.hp + healAmt);
        self.print(`${selected.name}을(를) 사용! ${u.name}의 HP ${before} → ${u.hp} (+${u.hp - before})`, 'success');
      }

      self.printBlank();
      self.updateStatus();
      self.showUnitDetail();
    };
  }

  doTrainAdult() {
    const result = this.unit.trainAdult(this._selectedUnitId, null);
    this.printBlank();
    if (!result.success) {
      this.print(result.reason, 'error');
      return;
    }
    this.print(result.message, 'success');
    if (result.senResult && result.senResult.changes) {
      for (const [part, val] of Object.entries(result.senResult.changes)) {
        const partName = result.senResult.partNames[part] || part;
        this.print(`  감도(${partName}) +${val}`, 'dim');
      }
    }
    if (result.stateResult) {
      for (const [key, val] of Object.entries(result.stateResult)) {
        if (val > 0) this.print(`  ${key} +${val}`, 'dim');
      }
    }
    if (result.unlocked) {
      this.print(`  새로운 특성 해금: ${result.unlocked.traitName}!`, 'lore');
    }
    this.printBlank();
    this.updateStatus();
    this.showUnitDetail();
  }

  doEquipChange() {
    // List equipment items in inventory
    const inv = this.engine.state.inventory;
    const equipItems = [];
    for (const [matId, qty] of Object.entries(inv)) {
      const mat = this.engine.data.materials.find(m => m.id === matId);
      if (mat && mat.category && mat.category.startsWith('equipment_')) {
        equipItems.push({ id: matId, name: mat.name, qty, category: mat.category, effect: mat.effect });
      }
    }

    if (equipItems.length === 0) {
      this.print('장착 가능한 장비가 없습니다.', 'dim');
      return;
    }

    this.printBlank();
    this.print('── 장착 가능한 장비 ──', 'system');
    equipItems.forEach((item, i) => {
      const slotName = item.category === 'equipment_weapon' ? '무기' :
                        item.category === 'equipment_armor' ? '방어구' : '장신구';
      const effectDesc = item.effect ? (typeof item.effect === 'string' ? item.effect : (item.effect.desc || '')) : '';
      this.printOption(`${i + 1}`, `  ${i + 1}. ${item.name} [${slotName}] ${effectDesc}`);
    });
    this.printOption('0', '  0. 취소');
    this.printBlank();

    this._equipItems = equipItems;
    const self = this;
    const origHandler = this.handleUnitDetail.bind(this);
    this.handleUnitDetail = function(c) {
      self.handleUnitDetail = origHandler;
      if (c === '0') return;
      const idx = parseInt(c);
      if (isNaN(idx) || idx < 1 || idx > self._equipItems.length) {
        self.print('올바른 번호를 입력하세요.', 'error');
        return;
      }
      const selected = self._equipItems[idx - 1];
      const slot = selected.category === 'equipment_weapon' ? 'weapon' :
                    selected.category === 'equipment_armor' ? 'armor' : 'accessory';
      const result = self.unit.equipItem(self._selectedUnitId, selected.id, slot);
      if (result.success) {
        self.print(result.message, 'success');
      } else {
        self.print(result.reason, 'error');
      }
      self.updateStatus();
      self.showUnitDetail();
    };
  }

  doPartyToggle() {
    const u = this.engine.getUnitInstance(this._selectedUnitId);
    if (!u) return;

    const party = this.engine.state.party;
    const inParty = party.includes(u.instanceId);

    if (inParty) {
      this.engine.state.party = party.filter(id => id !== u.instanceId);
      this.print(`${u.name}을(를) 파티에서 제외했습니다.`, 'system');
    } else {
      if (party.length >= this.engine.state.maxPartySize) {
        this.print(`파티가 가득 찼습니다. (최대 ${this.engine.state.maxPartySize}명)`, 'error');
        return;
      }
      if (u.isKnockedOut) {
        this.print('기절 상태의 유닛은 편성할 수 없습니다.', 'error');
        return;
      }
      if (u.assignedFacility) {
        this.print('시설에 배치된 유닛은 파티에 편성할 수 없습니다. 먼저 해제해주세요.', 'error');
        return;
      }
      party.push(u.instanceId);
      this.print(`${u.name}을(를) 파티에 편성했습니다.`, 'success');
    }
    this.printBlank();
    this.updateStatus();
    this.showUnitDetail();
  }

  doDeliver() {
    const u = this.engine.getUnitInstance(this._selectedUnitId);
    if (!u) return;

    const soulValue = this.engine.calcSoulPowerValue(u);
    this.printBlank();
    this.print(`${u.name}을(를) 납품하면 영혼력 ${soulValue}을(를) 획득합니다.`, 'system');
    this.print('정말 납품하시겠습니까?', 'important');
    this.printBlank();
    this.printOption('y', '  y. 납품');
    this.printOption('n', '  n. 취소');
    this.setActions([{key:'y', label:'납품 실행'}, {key:'n', label:'취소'}]);

    const self = this;
    const origHandler = this.handleUnitDetail.bind(this);
    this.handleUnitDetail = function(c) {
      self.handleUnitDetail = origHandler;
      if (c.toLowerCase() === 'y') {
        const result = self.unit.deliverUnit(self._selectedUnitId);
        if (self.engine.state.tutorial) self.engine.state.tutorial.firstDelivery = true;
        if (result.success) {
          self.print(result.message, 'success');
          self.updateStatus();
          self.showUnitManagement();
        } else {
          self.print(result.reason, 'error');
          self.showUnitDetail();
        }
      } else {
        self.print('납품을 취소했습니다.', 'dim');
        self.showUnitDetail();
      }
    };
  }

  // ============================================================
  //  Fusion Sub-screens
  // ============================================================
  showFusionSelectA() {
    this.currentScreen = 'unit_fusion_a';
    const units = this.engine.state.ownedUnits.filter(u =>
      !u.assignedFacility && u.instanceId !== this._selectedUnitId
    );
    this._unitList = units;

    this.printBlank();
    this.print('── 합체: 두 번째 유닛 선택 ──', 'system');
    this.print(`첫 번째 유닛: ${this.engine.getUnitInstance(this._selectedUnitId).name}`, 'unit');
    this.printBlank();

    if (units.length === 0) {
      this.print('합체 가능한 다른 유닛이 없습니다.', 'dim');
      this.printOption('0', '  0. 돌아가기');
      return;
    }

    units.forEach((u, i) => {
      this.printOption(`${i + 1}`, `  ${i + 1}. ${u.name} Lv.${u.level} (인:${u.sigilName})`);
    });
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
  }

  handleFusionSelectA(cmd) {
    if (cmd === '0') {
      this.showUnitDetail();
      return;
    }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._unitList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    this._fusionUnitA = this._selectedUnitId;
    this._fusionUnitB = this._unitList[idx - 1].instanceId;

    // Show preview
    const preview = this.unit.previewFusion(this._fusionUnitA, this._fusionUnitB);
    if (!preview) {
      this.print('합체 미리보기에 실패했습니다.', 'error');
      this.showUnitDetail();
      return;
    }

    this.currentScreen = 'unit_fusion_confirm';
    this.printBlank();
    this.print('── 합체 미리보기 ──', 'system');
    this.print(`  ${preview.unitA.name} (인:${preview.unitA.sigil} Lv.${preview.unitA.level})`, 'unit');
    this.print(`  + ${preview.unitB.name} (인:${preview.unitB.sigil} Lv.${preview.unitB.level})`, 'unit');
    this.printSeparator();
    this.print(`  → 결과 인: ${preview.resultSigilName} (${preview.resultSigil})`, 'lore');
    this.print(`  → 예상 유닛: ${preview.resultUnit}`, 'lore');
    this.print(`  → 예상 레벨: ${preview.resultLevel}`, 'lore');
    this.printBlank();
    this.print('합체를 실행하시겠습니까? 원본 유닛은 사라집니다.', 'important');
    this.printBlank();
    this.printOption('y', '  y. 실행');
    this.printOption('n', '  n. 취소');
    this.printBlank();
    this.setActions([{key:'y', label:'합체 실행'}, {key:'n', label:'취소'}]);
  }

  handleFusionSelectB(_cmd) {
    // Not used — handled in flow above
  }

  handleFusionConfirm(cmd) {
    if (cmd.toLowerCase() === 'y') {
      const result = this.unit.executeFusion(this._fusionUnitA, this._fusionUnitB);
      this.printBlank();
      if (!result.success) {
        this.print(result.reason, 'error');
        this.showUnitManagement();
        return;
      }

      if (result.isAccident) {
        this.print('합체 사고 발생! 예상치 못한 유닛이 탄생했다!', 'error');
      }

      this.print(`합체 성공! ${result.result.name} 탄생!`, 'success');
      this.print(`  인: ${result.result.sigilName} | Lv.${result.result.level} | ${result.result.category}`, 'unit');

      if (result.inheritedTraits.synthesized.length > 0) {
        this.print(`  합성 특성: ${result.inheritedTraits.synthesized.join(', ')}`, 'lore');
      }
      if (result.inheritedTraits.direct.length > 0) {
        const directNames = result.inheritedTraits.direct.map(tid => {
          const td = this.engine.data.traits.find(t => t.id === tid);
          return td ? td.name : tid;
        });
        this.print(`  직접 계승: ${directNames.join(', ')}`, 'dim');
      }

      this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
      this.updateStatus();
      this.showUnitManagement();
    } else {
      this.print('합체를 취소했습니다.', 'dim');
      this.showUnitDetail();
    }
  }

  // ============================================================
  //  SCREEN: City Facilities
  // ============================================================
  showCityFacilities() {
    this.currentScreen = 'city_facilities';
    this.clearOutput();
    this.printSeparator();
    this.print('【 도시 시설 】', 'location');
    this.printBlank();
    this.print('도시의 시설을 관리하고 확장할 수 있다.', 'description');
    this.printBlank();

    const facilities = this.economy.getAllFacilities();
    this._facilityList = facilities;

    facilities.forEach((fac, i) => {
      const unitName = fac.assignedUnit || '없음';
      const levelStr = fac.level > 0 ? `Lv.${fac.level}` : '미건설';
      this.printOption(`${i + 1}`, `  ${i + 1}. ${fac.name} [${levelStr}] — 배치: ${unitName}`);
      this.print(`     ${fac.description}`, 'dim');
    });

    this.printBlank();
    this.print('시설 번호를 입력하여 관리 (0 = 돌아가기)', 'dim');
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
    this.updateStatus();
  }

  handleCityFacilities(cmd) {
    if (cmd === '0') {
      this.showTownMenu();
      return;
    }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._facilityList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    this._facilityKey = this._facilityList[idx - 1].key;
    this.showFacilityDetail();
  }

  showFacilityDetail() {
    this.currentScreen = 'facility_detail';
    const fac = this._facilityList.find(f => f.key === this._facilityKey);
    if (!fac) {
      this.showCityFacilities();
      return;
    }

    this.printBlank();
    this.printSeparator();
    this.print(`【 ${fac.name} 】`, 'location');
    const levelStr = fac.level > 0 ? `Lv.${fac.level}` : '미건설';
    this.print(`  현재 레벨: ${levelStr}`, 'dim');
    this.print(`  ${fac.description}`, 'dim');
    this.print(`  배치 유닛: ${fac.assignedUnit || '없음'}`, 'dim');
    this.printBlank();

    // Upgrade cost
    if (fac.upgradeCost) {
      const cost = fac.upgradeCost;
      this.print(`  업그레이드 비용: 영혼력 ${cost.soulPower}`, 'system');
      if (cost.materials && Object.keys(cost.materials).length > 0) {
        for (const [matId, qty] of Object.entries(cost.materials)) {
          const name = this.engine.getMaterialName(matId);
          const have = this.engine.state.inventory[matId] || 0;
          const tag = have >= qty ? '[충족]' : '[부족]';
          this.print(`    ${name} x${qty} (보유: ${have}) ${tag}`, 'dim');
        }
      }
    } else {
      this.print('  최대 레벨에 도달했습니다.', 'dim');
    }
    this.printBlank();

    const actions = [];
    if (fac.upgradeCost) {
      this.printOption('1', '  1. 업그레이드 (건설)');
      actions.push({key:'1', label:'업그레이드'});
    }
    this.printOption('2', '  2. 유닛 배치');
    this.printOption('3', '  3. 유닛 해제');
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
    this.setActions([...actions, {key:'2',label:'배치'},{key:'3',label:'해제'},{key:'0',label:'돌아가기'}]);
  }

  handleFacilityDetail(cmd) {
    switch (cmd) {
      case '1':
        this.doFacilityUpgrade();
        break;
      case '2':
        this.showFacilityAssign();
        break;
      case '3':
        this.doFacilityUnassign();
        break;
      case '0':
        this.showCityFacilities();
        break;
      default:
        this.print('0~3 사이의 번호를 입력하세요.', 'error');
        break;
    }
  }

  doFacilityUpgrade() {
    const result = this.economy.buildFacility(this._facilityKey);
    this.printBlank();
    if (result.success) {
      this.print(result.message, 'success');
      // Refresh facility list
      this._facilityList = this.economy.getAllFacilities();
    } else {
      this.print(result.reason, 'error');
    }
    this.printBlank();
    this.setActions([{key:'1',label:'업그레이드'},{key:'2',label:'배치'},{key:'3',label:'해제'},{key:'0',label:'돌아가기'}]);
    this.updateStatus();
    this.showFacilityDetail();
  }

  showFacilityAssign() {
    this.currentScreen = 'facility_assign';

    const availableUnits = this.engine.state.ownedUnits.filter(u =>
      !u.isKnockedOut && !u.assignedFacility && !this.engine.state.party.includes(u.instanceId)
    );
    this._unitList = availableUnits;

    this.printBlank();
    this.print('── 배치할 유닛 선택 ──', 'system');

    if (availableUnits.length === 0) {
      this.print('  배치 가능한 유닛이 없습니다.', 'dim');
      this.print('  (파티/시설에 속하지 않고 기절하지 않은 유닛만 가능)', 'dim');
      this.printOption('0', '  0. 돌아가기');
      return;
    }

    availableUnits.forEach((u, i) => {
      this.printOption(`${i + 1}`, `  ${i + 1}. ${u.name} Lv.${u.level}`);
    });
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
  }

  handleFacilityAssign(cmd) {
    if (cmd === '0') {
      this.showFacilityDetail();
      return;
    }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._unitList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    const unitInstance = this._unitList[idx - 1];
    const result = this.economy.assignUnit(unitInstance.instanceId, this._facilityKey);
    this.printBlank();
    if (result.success) {
      this.print(result.message, 'success');
      if (this.engine.state.tutorial) this.engine.state.tutorial.firstPlacement = true;
      this._facilityList = this.economy.getAllFacilities();
    } else {
      this.print(result.reason, 'error');
    }
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
    this.updateStatus();
    this.showFacilityDetail();
  }

  doFacilityUnassign() {
    const result = this.economy.unassignUnit(this._facilityKey);
    this.printBlank();
    if (result.success) {
      this.print(result.message, 'success');
      this._facilityList = this.economy.getAllFacilities();
    } else {
      this.print(result.reason, 'error');
    }
    this.printBlank();
    this.updateStatus();
    this.showFacilityDetail();
  }

  // ============================================================
  //  SCREEN: Compendium (전서)
  // ============================================================
  showCompendium() {
    this.currentScreen = 'compendium';
    this.clearOutput();
    this.printSeparator();
    this.print('【 전서 — 유닛 등록소 】', 'location');
    this.printBlank();
    this.print('전서를 통해 영혼력으로 유닛을 소환할 수 있다.', 'description');
    this.print(`현재 영혼력: ${this.engine.state.soulPower}`, 'system');
    this.printBlank();

    // Build compendium pool
    const pool = [
      ...this.engine.state.compendium.basicPool,
      ...this.engine.state.compendium.registered
    ];
    const uniquePool = [...new Set(pool)];
    this._compendiumList = [];

    this.print('  등록된 유닛:', 'system');
    uniquePool.forEach((unitId, i) => {
      const ud = this.engine.getUnitDef(unitId);
      if (ud) {
        const price = ud.level * 15;
        const canBuy = this.engine.state.soulPower >= price;
        this._compendiumList.push(unitId);
        if (canBuy) {
          this.printOption(`${i + 1}`,
            `  ${i + 1}. ${ud.name} Lv.${ud.level} | 인:${ud.sigilName} | 가격: ${price} 영혼력`
          );
        } else {
          this.print(
            `  ${i + 1}. ${ud.name} Lv.${ud.level} | 인:${ud.sigilName} | 가격: ${price} 영혼력 [부족]`,
            'dim'
          );
        }
      }
    });

    this.printBlank();
    this.print('소환할 유닛 번호를 입력하세요. (0 = 돌아가기)', 'dim');
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
    this.updateStatus();
  }

  handleCompendium(cmd) {
    if (cmd === '0') {
      this.showTownMenu();
      return;
    }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._compendiumList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    const unitId = this._compendiumList[idx - 1];
    const result = this.unit.buyFromCompendium(unitId);
    this.printBlank();

    if (result.success) {
      this.print(result.message, 'success');
      this.print(`  ${result.unit.name} Lv.${result.unit.level} | 인:${result.unit.sigilName}`, 'unit');
    } else {
      this.print(result.reason, 'error');
    }
    this.printBlank();
    this.updateStatus();

    // Refresh compendium
    this.showCompendium();
  }

  // ============================================================
  //  SCREEN: Tool Management (도구 관리)
  // ============================================================
  showToolManagement() {
    this.currentScreen = 'tool_manage';
    this.clearOutput();
    this.printSeparator();
    this.print('【 도구 관리 】', 'location');
    this.printBlank();

    const tools = this.engine.state.tools;
    const categories = {
      gather: { label: '채집 도구', keys: ['pickaxe', 'rod', 'staff'] },
      training: { label: '육성 도구', keys: ['dummy', 'treadmill'] },
      adult: { label: '조교 도구', keys: ['rotor', 'textbook'] }
    };

    let idx = 1;
    this._toolList = [];
    for (const [catKey, cat] of Object.entries(categories)) {
      this.print(`  [${cat.label}]`, 'system');
      for (const key of cat.keys) {
        const tool = tools[key];
        if (!tool) continue;
        const gating = this.engine.getToolGating(key);
        const partsStr = tool.parts.map(p => {
          const suffix = this._partSummary(p);
          return `${p.slot}(${suffix} t${p.tier})`;
        }).join(' | ');
        this._toolList.push(key);
        this.printOption(`${idx}`, `  ${idx}. ${tool.name} [게이팅:${gating}] — ${partsStr}`);
        idx++;
      }
      this.printBlank();
    }

    this.printOption('0', '  0. 돌아가기');
    this.setActions([{key:'0', label:'돌아가기'}]);
    this.updateStatus();
  }

  handleToolManagement(cmd) {
    if (cmd === '0') { this.showTownMenu(); return; }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._toolList.length) {
      this.print('번호를 입력하세요.', 'error');
      return;
    }
    this._selectedToolKey = this._toolList[idx - 1];
    this.showToolDetail();
  }

  showToolDetail() {
    this.currentScreen = 'tool_detail';
    const toolKey = this._selectedToolKey;
    const tool = this.engine.state.tools[toolKey];
    if (!tool) { this.showToolManagement(); return; }

    this.clearOutput();
    this.printSeparator();
    const gating = this.engine.getToolGating(toolKey);
    this.print(`【 ${tool.name} 】 게이팅: ${gating}`, 'location');
    this.printBlank();

    // 부품 상세
    this.print('  부품 구성:', 'system');
    tool.parts.forEach((p, i) => {
      const suffix = this._partSummary(p);
      const bar = '█'.repeat(Math.min(10, p.tier)) + '·'.repeat(Math.max(0, 10 - p.tier));
      this.printOption(`${i + 1}`, `  ${i + 1}. [${p.slot}] 접미사: ${suffix} | tier: ${p.tier} [${bar}]`);
    });
    this.printBlank();

    // 보관함 (이 도구의 보관된 부품)
    const stored = this.engine.state.partInventory.filter(p => p.toolKey === toolKey);
    if (stored.length > 0) {
      this.print('  보관함:', 'system');
      stored.forEach((p, i) => {
        this.printOption(`s${i + 1}`, `    s${i + 1}. ${p.slot} [${(p.tags&&p.tags.length?p.tags.join(','):'없음')} t${p.tier}] — 재장착 가능`);
      });
      this.printBlank();
    }

    // 게이팅 효과 설명
    if (tool.type === 'gather') {
      const bonus = this.engine.getGatherBonus(tool.gatherZone || '석굴');
      this.print(`  채집 효과: ${tool.gatherZone} 채집량 ×${bonus.toFixed(1)}`, 'dim');
    } else {
      const typeMap = { training_combat:'combat', training_body:'body', training_adult:'adult', training_personality:'personality' };
      const bonus = this.engine.getTrainingBonus(typeMap[tool.type] || 'combat');
      this.print(`  효율 보정: ×${bonus.toFixed(1)}`, 'dim');
    }
    this.printBlank();

    this.printOption('u', '  u. 부품 업그레이드 (솥 — 아이템 투입)');
    this.printOption('r', '  r. 부품 초기화 (현재 부품 → 부품 보관함, t0으로 리셋)');
    this.printOption('0', '  0. 돌아가기');
    this.setActions([{key:'u', label:'업그레이드'}, {key:'r', label:'초기화'}, {key:'0', label:'돌아가기'}]);
  }

  handleToolDetail(cmd) {
    if (cmd === '0') { this.showToolManagement(); return; }
    if (cmd === 'u') { this.showToolUpgrade(); return; }
    if (cmd === 'r') {
      // 부품 초기화 — 현재 부품 보관 + 새 t0 부품 제작 (재료 소모)
      this.printBlank();
      this.print('초기화할 부품 번호 (1~3):', 'system');
      this.print('  (현재 부품은 보관함으로. 새 t0 부품 제작에 재료가 소모됩니다)', 'dim');
      const tool = this.engine.state.tools[this._selectedToolKey];
      const recipes = this.engine.state.partRecipes;
      tool.parts.forEach((p, i) => {
        const recipeKey = `${this._selectedToolKey}_${i}`;
        const mats = recipes[recipeKey] || [];
        const matNames = mats.map(m => this.engine.getMaterialName(m));
        const canCraft = mats.every(m => this.engine.hasMaterial(m));
        if (p.tier > 0) {
          this.printOption(`${i+1}`, `  ${i+1}. ${p.slot} [${(p.tags&&p.tags.length?p.tags.join(','):'없음')} t${p.tier}] → 리셋 (필요: ${matNames.join('+')} ${canCraft ? '' : '[재료 부족]'})`);
        } else {
          this.print(`  ${i+1}. ${p.slot} (이미 t0)`, 'dim');
        }
      });
      this.printOption('0', '  0. 취소');

      const self = this;
      const origHandler = this.handleToolDetail.bind(this);
      this.handleToolDetail = function(c) {
        self.handleToolDetail = origHandler;
        if (c === '0') { self.showToolDetail(); return; }
        const pi = parseInt(c);
        if (pi >= 1 && pi <= 3) {
          const part = tool.parts[pi - 1];
          const recipeKey = `${self._selectedToolKey}_${pi - 1}`;
          const mats = recipes[recipeKey] || [];

          // 재료 체크
          if (!mats.every(m => self.engine.hasMaterial(m))) {
            self.print('재료가 부족합니다.', 'error');
            self.showToolDetail();
            return;
          }

          if (part.tier > 0) {
            // 현재 부품 → 보관함
            self.engine.state.partInventory.push({
              toolKey: self._selectedToolKey,
              slot: part.slot,
              tags: [...(part.tags||[])],
              tier: part.tier
            });
            self.print(`${part.slot} [${(part.tags||[]).join(',')} t${part.tier}]을(를) 보관함에 저장.`, 'success');
          }

          // 재료 소모 + t0 리셋
          for (const m of mats) self.engine.removeMaterial(m, 1);
          self.print(`재료 소모: ${mats.map(m => self.engine.getMaterialName(m)).join(' + ')}`, 'dim');
          part.tags = [];
          part.tier = 0;
          self.print(`새 t0 ${part.slot} 제작 완료!`, 'success');
        }
        self.showToolDetail();
      };
      return;
    }
    // 보관함에서 재장착 (s1, s2, ...)
    if (cmd.startsWith('s')) {
      const si = parseInt(cmd.substring(1));
      const tool = this.engine.state.tools[this._selectedToolKey];
      const stored = this.engine.state.partInventory.filter(p => p.toolKey === this._selectedToolKey);
      if (si >= 1 && si <= stored.length) {
        const storedPart = stored[si - 1];
        // 같은 슬롯의 현재 부품을 보관함으로
        const slotIdx = tool.parts.findIndex(p => p.slot === storedPart.slot);
        if (slotIdx >= 0) {
          const current = tool.parts[slotIdx];
          if (current.tier > 0) {
            this.engine.state.partInventory.push({
              toolKey: this._selectedToolKey,
              slot: current.slot,
              tags: [...(current.tags||[])],
              tier: current.tier
            });
          }
          // 보관함 부품을 장착
          current.tags = [...(storedPart.tags||[])];
          current.tier = storedPart.tier;
          // 보관함에서 제거
          const globalIdx = this.engine.state.partInventory.indexOf(storedPart);
          if (globalIdx >= 0) this.engine.state.partInventory.splice(globalIdx, 1);
          this.print(`${storedPart.slot} [${(storedPart.tags||[]).join(',')} t${storedPart.tier}] 장착!`, 'success');
        }
        this.showToolDetail();
        return;
      }
    }

    // 부품 번호 선택 시 업그레이드
    const idx = parseInt(cmd);
    if (idx >= 1 && idx <= 3) {
      this._selectedPartIdx = idx - 1;
      this.showToolUpgrade();
    }
  }

  showToolUpgrade() {
    this.currentScreen = 'tool_upgrade';
    const toolKey = this._selectedToolKey;
    const tool = this.engine.state.tools[toolKey];
    const partIdx = this._selectedPartIdx || 0;
    const part = tool.parts[partIdx];

    this.clearOutput();
    this.printSeparator();
    this.print(`【 부품 업그레이드: ${tool.name} — ${part.slot} 】`, 'location');
    this.print(`  현재 태그: ${(part.tags&&part.tags.length) ? part.tags.join(',') : '없음'} / tier ${this._partTier(part)}`, 'dim');
    this.printBlank();

    // 재료 선택 (모든 인벤토리 — 원재료, 가공품, 조합품 전부 가능)
    this.print('  투입할 아이템을 선택하세요 (고tier 조합품 = 더 큰 효과):', 'system');
    const inv = this.engine.state.inventory;
    const matIds = Object.keys(inv).filter(id => inv[id] > 0);
    this._upgradeMatList = matIds;

    if (matIds.length === 0) {
      this.print('  투입할 아이템이 없습니다.', 'dim');
    } else {
      matIds.forEach((matId, i) => {
        const mat = this.engine.data.materials.find(m => m.id === matId);
        const name = mat ? mat.name : matId;
        // 태그 밀도 미리보기
        let preview = '';
        if (mat && mat.tags) {
          const tags = mat.tags;
          const funcs = (tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : [])).filter(Boolean);
          const elems = (tags.elements || (tags.element ? (Array.isArray(tags.element) ? tags.element : [tags.element]) : [])).filter(Boolean);
          const allTags = [...funcs, ...elems];
          // tier 미리보기
          if (allTags.length > 0) {
            const counts = {};
            allTags.forEach(t => { counts[t] = (counts[t]||0)+1; });
            const density = Math.floor(Object.values(counts).reduce((s,v)=>s+v,0) / Object.keys(counts).length);
            const tagStr = Object.entries(counts).map(([k,v]) => v>1 ? `${k}×${v}` : k).join(',');
            preview = ` [t${density} ${tagStr}]`;
          }
        }
        this.printOption(`${i + 1}`, `  ${i + 1}. ${name} ×${inv[matId]}${preview}`);
      });
    }
    this.printBlank();

    // 부품 선택 (1~3)
    this.print(`  부품: ${tool.parts.map((p, i) => `${i+1}.${p.slot}(t${p.tier})${i === partIdx ? '◀' : ''}`).join('  ')}`, 'dim');
    this.printOption('0', '  0. 돌아가기');
    this.setActions([{key:'0', label:'돌아가기'}]);
  }

  handleToolUpgrade(cmd) {
    if (cmd === '0') { this.showToolDetail(); return; }

    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || !this._upgradeMatList || idx > this._upgradeMatList.length) {
      this.print('아이템 번호를 입력하세요.', 'error');
      return;
    }

    const matId = this._upgradeMatList[idx - 1];
    const mat = this.engine.data.materials.find(m => m.id === matId);
    if (!mat || !this.engine.hasMaterial(matId)) {
      this.print('아이템이 부족합니다.', 'error');
      return;
    }

    this.engine.removeMaterial(matId, 1);

    const tool = this.engine.state.tools[this._selectedToolKey];
    const partIdx = this._selectedPartIdx || 0;
    const part = tool.parts[partIdx];

    // 투입 아이템의 태그를 부품에 누적
    const tags = mat.tags || {};
    const funcs = (tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : [])).filter(Boolean);
    const elems = (tags.elements || (tags.element ? (Array.isArray(tags.element) ? tags.element : [tags.element]) : [])).filter(Boolean);
    const newTags = [...funcs, ...elems];

    if (!part.tags) part.tags = [];
    const beforeTier = this._partTier(part);
    part.tags.push(...newTags);
    const afterTier = this._partTier(part);

    this.print(`${part.slot}에 태그 추가: [${newTags.join(', ')}]`, 'success');
    this.print(`  현재 태그: ${this._partSummary(part)}`, 'dim');
    if (afterTier > beforeTier) {
      this.print(`  ★ tier 상승! t${beforeTier} → t${afterTier}`, 'success');
    } else {
      this.print(`  tier: ${afterTier} (태그 다양화)`, 'dim');
    }

    this.print(`  투입: ${mat.name} (태그밀도 t${inputTier})`, 'dim');
    this.printBlank();
    this.updateStatus();
    this.showToolUpgrade();
  }

  // ============================================================
  //  SCREEN: Inventory
  // ============================================================
  showInventory(tab = 'raw') {
    this.currentScreen = 'inventory';
    this._invTab = tab;
    this.clearOutput();
    this.printSeparator();
    this.print('【 인벤토리 】', 'location');
    this.printBlank();

    // 탭 표시
    const tabs = [
      { key: 'r', id: 'raw', name: '원재료' },
      { key: 'p', id: 'processed', name: '가공품' },
      { key: 'c', id: 'crafted', name: '제작품' },
      { key: 'e', id: 'equip', name: '장비/도구' }
    ];
    const tabLine = tabs.map(t =>
      t.id === tab ? `【${t.name}】` : `  ${t.name}  `
    ).join('|');
    this.print(`  ${tabLine}`, 'system');
    this.printBlank();

    // 아이템 분류
    const inv = this.engine.state.inventory;
    const allItems = Object.keys(inv).filter(id => inv[id] > 0).map(id => {
      const mat = this.engine.data.materials.find(m => m.id === id);
      return { id, name: (mat && mat.name) || id, qty: inv[id], mat };
    });

    let filtered;
    switch (tab) {
      case 'raw':
        filtered = allItems.filter(i => i.id.startsWith('MAT_') && !i.id.includes('_FIRED') && !i.id.includes('_CRUSHED') && !i.id.includes('_COMPRESSED'));
        break;
      case 'processed':
        filtered = allItems.filter(i => i.id.includes('_FIRED') || i.id.includes('_CRUSHED') || i.id.includes('_COMPRESSED') || i.id.startsWith('CRAFT_'));
        break;
      case 'crafted':
        filtered = allItems.filter(i => i.id.startsWith('ITEM_') && !['equipment_weapon','equipment_armor','equipment_accessory','tool_training','tool_crafting'].includes(i.mat?.category));
        break;
      case 'equip':
        filtered = allItems.filter(i => i.mat && ['equipment_weapon','equipment_armor','equipment_accessory','tool_training','tool_crafting'].includes(i.mat.category));
        break;
      default:
        filtered = allItems;
    }

    this._inventoryItems = filtered;

    if (filtered.length === 0) {
      this.print('  (없음)', 'dim');
    } else {
      filtered.forEach((item, i) => {
        const mat = item.mat;
        let info = '';
        if (mat && mat.effect) {
          const desc = typeof mat.effect === 'string' ? mat.effect : (mat.effect.desc || '');
          if (desc) info = ` — ${desc}`;
        }
        // 태그 요약
        if (!info && mat && mat.tags) {
          const tags = mat.tags;
          const parts = [];
          const funcs = tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : []);
          const elems = tags.elements || (tags.element ? [tags.element] : []);
          parts.push(...funcs.filter(Boolean), ...elems.filter(Boolean));
          if (parts.length) info = ` (${parts.join('/')})`;
        }
        this.printOption(`${i + 1}`, `  ${i + 1}. ${item.name} ×${item.qty}${info}`);
      });
    }

    this.printBlank();

    // 탭 전환 + 돌아가기
    const actions = tabs.map(t => ({ key: t.key, label: t.name }));
    actions.push({ key: '0', label: '돌아가기' });
    this.print(`  탭 전환: ${tabs.map(t => `${t.key}=${t.name}`).join(' | ')}`, 'dim');
    this.printOption('0', '  0. 돌아가기');
    this.setActions(actions);
    this.updateStatus();
  }

  handleInventory(cmd) {
    if (cmd === '0') { this.showTownMenu(); return; }

    // 탭 전환
    const tabMap = { r: 'raw', p: 'processed', c: 'crafted', e: 'equip' };
    if (tabMap[cmd]) { this.showInventory(tabMap[cmd]); return; }

    // 아이템 상세
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || !this._inventoryItems || idx > this._inventoryItems.length) {
      return;
    }

    const item = this._inventoryItems[idx - 1];
    const mat = item.mat;
    this.printBlank();
    this.printSeparator();
    this.print(`【 ${item.name} 】 ×${item.qty}`, 'lore');

    if (mat) {
      if (mat.tier) this.print(`  Tier: ${mat.tier}`, 'dim');
      if (mat.lore) this.print(`  "${mat.lore}"`, 'dim');

      const tags = mat.tags || {};
      const funcs = (tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : [])).filter(Boolean);
      const elements = (tags.elements || (tags.element ? [tags.element] : [])).filter(Boolean);
      const forms = (tags.forms || (tags.form ? [tags.form] : [])).filter(Boolean);

      if (funcs.length) this.print(`  기능: ${funcs.join(', ')}`, 'system');
      if (elements.length) this.print(`  원소: ${elements.join(', ')}`, 'system');
      if (forms.length) this.print(`  형태: ${forms.join(', ')}`, 'system');

      if (mat.effect) {
        const desc = typeof mat.effect === 'string' ? mat.effect : (mat.effect.desc || '');
        if (desc) this.print(`  효과: ${desc}`, 'success');
      }

      const catNames = {
        'consumable_potion':'물약', 'consumable_food':'식량', 'consumable_attack':'공격소비재',
        'consumable_debuff':'디버프', 'equipment_weapon':'무기', 'equipment_armor':'방어구',
        'equipment_accessory':'장신구', 'tool_training':'조교도구', 'tool_crafting':'제작도구',
        'material_refined':'정제소재'
      };
      if (mat.category) this.print(`  분류: ${catNames[mat.category] || mat.category}`, 'dim');
    }
    this.printSeparator();
  }

  // ============================================================
  //  Advance Day
  // ============================================================
  doAdvanceDay() {
    this.currentScreen = 'advance_day';

    const oldMonth = this.engine.state.month;
    const dayReport = this.engine.advanceDay();

    this.clearOutput();
    this.printSeparator();
    this.print(`${this.engine.state.year}년 ${this.engine.state.month}월 ${this.engine.state.day}일이 밝았다.`, 'system');
    this.printBlank();

    this.print(`스태미나 전회복: ${this.engine.state.stamina}/${this.engine.state.maxStamina}`, 'heal');

    // Check recovered units
    const recoveredUnits = this.engine.state.ownedUnits.filter(u =>
      u.recoveryDays === 0 && !u.isKnockedOut
    );
    // Show recently recovered (just a note)
    this.printBlank();

    // Check if month changed
    if (this.engine.state.month !== oldMonth || (oldMonth > 1 && this.engine.state.day === 1)) {
      this.printSeparator();
      const monthReport = this.engine.getMonthReport();
      this.print(`═══ ${this.engine.state.month}월이 시작되었다 ═══`, 'important');
      this.printBlank();

      if (monthReport.maintenanceCost > 0) {
        this.print(`유지비 지출: 영혼력 -${monthReport.maintenanceCost}`, 'error');
      }

      this.print('시설 생산이 완료되었다.', 'system');

      // 가공소 자동 가공 결과
      const workshopResults = this.engine.state._workshopResults;
      if (workshopResults && workshopResults.length > 0) {
        this.print(`가공소 자동 가공 (${workshopResults.length}건):`, 'success');
        for (const r of workshopResults) {
          const equipName = {furnace:'가마', crusher:'분쇄', compressor:'압축'}[r.equipment] || r.equipment;
          this.print(`  ${r.from} →[${equipName}]→ ${r.to}`, 'dim');
        }
        this.engine.state._workshopResults = null;
      }

      this.print(`이번 달 활성 인: ${monthReport.activeSignals.join(', ')}`, 'lore');
      this.printBlank();

      // Bankruptcy check
      const bankCheck = this.economy.checkBankruptcy();
      if (bankCheck.bankrupt) {
        this.print(bankCheck.message, 'danger');
        this.printBlank();
        this.showEndGame(false);
        return;
      }
    }

    this.printOption('1', '  [계속]');
    this.updateStatus();
  }

  handleAdvanceDay(_cmd) {
    this.showTownMenu();
  }

  // ============================================================
  //  SCREEN: Training Facility (조교소)
  // ============================================================
  showTrainingFacility() {
    this.currentScreen = 'training_select';
    this.clearOutput();
    this.printSeparator();
    this.print('【 조교소 】', 'location');
    this.printBlank();
    this.print('유닛을 선택하여 조교를 시작합니다. (스태미나 3 소모)', 'description');
    this.printBlank();

    const units = this.engine.state.ownedUnits.filter(u => !u.isKnockedOut && !u.assignedFacility);
    this._trainingUnitList = units;

    if (units.length === 0) {
      this.print('  조교 가능한 유닛이 없습니다.', 'dim');
    } else {
      units.forEach((u, i) => {
        const traitName = this.training.getAdultTraitName(u);
        const gs = u.globalState;
        this.printOption(`${i + 1}`,
          `  ${i + 1}. ${u.name} Lv.${u.level} | 인:${u.sigilName} | 성인특성: ${traitName} | 음란:${gs.lewdness || 0} 복종:${gs.submission || 0}`,
          'unit'
        );
      });
    }
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.setActions([{key:'0', label:'돌아가기'}]);
    this.updateStatus();
  }

  handleTrainingSelect(cmd) {
    if (cmd === '0') { this.showTownMenu(); return; }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._trainingUnitList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    const unit = this._trainingUnitList[idx - 1];
    const check = this.training.canTrain(unit);
    if (!check.ok) {
      this.print(check.reason, 'error');
      return;
    }

    this._trainingUnit = unit;
    this.showTrainingMenu();
  }

  showTrainingMenu() {
    this.currentScreen = 'training_menu';
    const unit = this._trainingUnit;
    this.clearOutput();
    this.printSeparator();
    this.print(`【 조교소: ${unit.name} 】`, 'location');
    this.printBlank();

    const affStage = this.unit.getAffectionStage(unit.affection);
    this.print(`  Lv.${unit.level} | 인:${unit.sigilName} | 호감:${affStage.name}(${unit.affection})`, 'unit');
    this.print(`  경험치 — 전투:${unit.exp.combat} 신체:${unit.exp.body} 성격:${unit.exp.personality} 성인:${unit.exp.adult}`, 'dim');
    this.printBlank();

    this.printOption('1', '  1. 훈련     — 전투 경험치 (스태미나 2)');
    this.printOption('2', '  2. 교류     — 호감도 상승 (스태미나 1)');
    this.printOption('3', '  3. 조교     — 성인 조교 (스태미나 3)');
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
    this.setActions([{key:'1',label:'훈련'},{key:'2',label:'교류'},{key:'3',label:'조교'},{key:'0',label:'돌아가기'}]);
    this.updateStatus();
  }

  handleTrainingMenu(cmd) {
    switch (cmd) {
      case '1': {
        const result = this.unit.trainUnit(this._trainingUnit.instanceId);
        this.printBlank();
        if (!result.success) { this.print(result.reason, 'error'); return; }
        this.print(result.message, 'success');
        if (result.unlocked) this.print(`  새로운 특성 해금: ${result.unlocked.traitName}!`, 'lore');
        if (result.leveled) this.print(`  ★ 레벨 업! → Lv.${result.leveled.newLevel}`, 'success');
        this.printBlank();
        this.updateStatus();
        this.showTrainingMenu();
        break;
      }
      case '2': {
        const result = this.unit.socialize(this._trainingUnit.instanceId);
        this.printBlank();
        if (!result.success) { this.print(result.reason, 'error'); return; }
        this.print(result.message, 'success');
        if (result.unlocked) this.print(`  새로운 특성 해금: ${result.unlocked.traitName}!`, 'lore');
        if (result.leveled) this.print(`  ★ 레벨 업! → Lv.${result.leveled.newLevel}`, 'success');
        this.printBlank();
        this.updateStatus();
        this.showTrainingMenu();
        break;
      }
      case '3':
        this.showTrainingParts();
        break;
      case '0':
        this.showTrainingFacility();
        break;
      default:
        this.print('올바른 번호를 입력하세요.', 'error');
        break;
    }
  }

  // ERA-style single screen: stats + body parts + actions all visible
  showTrainingScreen() {
    this.currentScreen = 'training_action';
    const unit = this._trainingUnit;

    // 대시보드 모드 전환 (game-output 숨기고 training-dashboard 표시)
    document.getElementById('main-area').style.display = 'none';
    const dashboard = document.getElementById('training-dashboard');
    dashboard.classList.add('active');

    // 대시보드 입력 연결
    const tdInput = document.getElementById('td-input');
    tdInput.value = '';
    tdInput.focus();
    tdInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const cmd = tdInput.value.trim();
        tdInput.value = '';
        if (cmd) this.processCommand(cmd);
      }
    };

    // 닫기 버튼
    document.getElementById('td-close').onclick = () => this._closeTrainingDashboard();

    this._renderTrainingDashboard(unit);
    this.printBlank();

    // ── 세분화 경험치 ──
    const de = unit.detailedExp || {};
    this.print('  경험치', 'system');
    this.print(
      `  애무 ${String(de.caress||0).padStart(4)} | 자극 ${String(de.stimulate||0).padStart(4)} | 핥기 ${String(de.lick||0).padStart(4)} | 키스 ${String(de.kiss||0).padStart(4)}`,
      'dim'
    );
    this.print(
      `  삽입 ${String(de.insert||0).padStart(4)} | 도구 ${String(de.toy||0).padStart(4)} | 조련 ${String(de.discipline||0).padStart(4)} | 봉사 ${String(de.service||0).padStart(4)}`,
      'dim'
    );
    this.print(
      `  절정 ${String(de.orgasm||0).padStart(4)} | 노출 ${String(de.exposure||0).padStart(4)} | 총회 ${String(de.totalSessions||0).padStart(4)}`,
      'dim'
    );
    this.printBlank();

    // ── Player / Stamina ──
    this.print(`  스태미나: ${this.engine.state.stamina}/${this.engine.state.maxStamina}`, 'system');
    this.printSeparator();

    // ── 행위 목록 (번호만 입력) ──
    const actions = this.training.getAvailableActions(unit);
    this._trainingActions = actions;

    this.print('  행위 (번호 입력)', 'system');
    const cols = 3;
    let row = '  ';
    const actionBtns = [];
    actions.forEach((a) => {
      if (a.locked) {
        row += `${String(a.id).padStart(2)}.${a.name}[X]`.padEnd(22);
      } else {
        row += `${String(a.id).padStart(2)}.${a.name}`.padEnd(22);
        actionBtns.push({ key: `${a.id}`, label: a.name });
      }
      if (actionBtns.length % cols === 0 || a.locked) {
        // Check if row is getting long
      }
      if (row.length > 60) { this.print(row, 'dim'); row = '  '; }
    });
    if (row.trim().length > 2) this.print(row, 'dim');

    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    actionBtns.push({key:'0', label:'돌아가기'});
    this.setActions(actionBtns);
    this.updateStatus();
  }

  // ERA식 handler: 번호만 입력
  handleTrainingAction(cmd) {
    if (cmd === '0') { this._closeTrainingDashboard(); return; }

    const unit = this._trainingUnit;
    const actionId = parseInt(cmd);

    // Find action by ID
    const actions = this.training.getAvailableActions(unit);
    const action = actions.find(a => a.id === actionId);
    if (!action) { this._renderTrainingDashboard(unit, '올바른 번호를 입력하세요.'); return; }
    if (action.locked) { this._renderTrainingDashboard(unit, `잠금: ${action.lockReason}`); return; }

    const hasTool = this.training.hasTrainingTool();
    if (action.requiresTool && !hasTool) {
      this._renderTrainingDashboard(unit, '조교 도구가 필요합니다.');
      return;
    }

    if (!this.engine.useStamina(3)) {
      this._renderTrainingDashboard(unit, '⚠ 스태미나가 부족합니다!');
      return;
    }

    // Execute (ERA식: actionId만 전달)
    const result = this.training.execute(unit, actionId, hasTool);

    // 결과 메시지 조립
    const msgs = [];
    msgs.push(`▸ ${action.name}`);
    if (result.partResults && result.partResults.length > 0) {
      msgs.push(`감도: ${result.partResults.map(pr => `${pr.partName}+${pr.gain}`).join(' | ')}`);
    }
    const changes = [];
    if (result.lewdGain) changes.push(`음란+${result.lewdGain}`);
    if (result.submissionGain > 0) changes.push(`복종+${result.submissionGain}`);
    if (result.submissionGain < 0) changes.push(`복종${result.submissionGain}`);
    if (result.fearGain) changes.push(`공포+${result.fearGain}`);
    if (result.resentGain) changes.push(`반감+${result.resentGain}`);
    if (result.loveGain) changes.push(`연모+${result.loveGain}`);
    if (changes.length) msgs.push(changes.join(' | '));
    for (const text of result.extraText) msgs.push(`▸ ${text}`);
    if (result.leveled) msgs.push(`★ 레벨 업! → Lv.${result.leveled.newLevel}`);
    // 대시보드 갱신 (결과 메시지 포함)
    this._renderTrainingDashboard(unit, msgs.join(' | '));
    document.getElementById('td-input').focus();
  }

  // Keep old method names as redirects
  showTrainingParts() { this.showTrainingScreen(); }
  handleTrainingPart(cmd) { this.handleTrainingAction(cmd); }
  PARTS_IDX(parts, p) { return parts.indexOf(p) + 1; }


  // ============================================================
  //  SCREEN: End Game
  // ============================================================
  showEndGame(victory) {
    this.currentScreen = 'end_game';
    this.clearOutput();
    this.printSeparator();

    if (victory) {
      this.print('╔══════════════════════════════════════════╗', 'success');
      this.print('║           게 임  클 리 어               ║', 'success');
      this.print('╚══════════════════════════════════════════╝', 'success');
      this.printBlank();
      this.print('미궁의 최심부에 도달하여 비밀을 밝혀냈다.', 'lore');
      this.print('당신은 전설적인 연금술사로 이름을 남긴다.', 'lore');
    } else {
      this.print('╔══════════════════════════════════════════╗', 'danger');
      this.print('║           게 임  오 버                  ║', 'danger');
      this.print('╚══════════════════════════════════════════╝', 'danger');
      this.printBlank();
      this.print('더 이상 활동을 계속할 수 없게 되었다.', 'description');
      this.print('공방의 문은 다시 닫혔다...', 'description');
    }

    this.printBlank();
    const s = this.engine.state;
    this.print('── 최종 기록 ──', 'system');
    this.print(`  생존 기간: ${s.year}년 ${s.month}월 ${s.day}일`, 'dim');
    this.print(`  최종 영혼력: ${s.soulPower}`, 'dim');
    this.print(`  보유 유닛: ${s.ownedUnits.length}체`, 'dim');
    this.print(`  미궁 최고 도달층: ${s.dungeon.maxFloorReached}층`, 'dim');
    this.print(`  전서 등록 수: ${s.compendium.registered.length}종`, 'dim');
    this.printBlank();
    this.printOption('1', '  1. 타이틀로 돌아가기');
    this.printBlank();
  }

  handleEndGame(cmd) {
    if (cmd === '1') {
      this.showMainMenu();
    }
  }

  // ============================================================
  //  Quick-command handler (from buttons)
  // ============================================================
  _quickCommand(label) {
    switch (label) {
      case '인벤토리':
        if (this.currentScreen === 'town' || this.currentScreen === 'crafting') {
          this.showInventory();
        } else {
          this.print('(현재 화면에서는 인벤토리를 열 수 없습니다)', 'dim');
        }
        break;
      case '유닛':
        if (this.currentScreen === 'town') {
          this.showUnitManagement();
        } else {
          this.print('(현재 화면에서는 유닛 관리를 열 수 없습니다)', 'dim');
        }
        break;
      case '지도':
        if (this.engine.state.dungeon.inDungeon) {
          // Show current dungeon floor map
          const floor = this.engine.state.dungeon.currentFloor;
          const nodes = this.dungeon.getFloorNodes(floor);
          const currentId = this.engine.state.dungeon.currentNode;
          this.printBlank();
          this.print(`── 미궁 ${floor}층 노드 맵 ──`, 'system');
          for (const n of nodes) {
            const marker = n.id === currentId ? ' ◀ 현재 위치' : '';
            const typeNames = {
              entrance: '입구', exit: '출구', combat: '전투',
              collect: '채집', rest: '휴식', chest: '상자',
              event: '이벤트', boss: '보스'
            };
            this.print(`  ${n.name || n.id} [${typeNames[n.type] || n.type}]${marker}`, n.id === currentId ? 'system' : 'dim');
          }
          this.printBlank();
        } else {
          this.print('(미궁 내에서만 지도를 확인할 수 있습니다)', 'dim');
        }
        break;
    }
  }
}

// ============================================================
//  Bootstrap
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
