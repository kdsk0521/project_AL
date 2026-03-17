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
    this.engine   = new GameEngine();
    this.combat   = new CombatSystem(this.engine);
    this.dungeon  = new DungeonSystem(this.engine);
    this.crafting = new CraftingSystem(this.engine);
    this.unit     = new UnitSystem(this.engine);
    this.economy  = new EconomySystem(this.engine);

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
    safe('gold-display', s.soulPower); // 영혼력 alias for the "금화" slot in HTML
    safe('materials-display', Object.keys(s.inventory || {}).length + '종');

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

    switch (this.currentScreen) {
      case 'main_menu':          this.handleMainMenu(cmd);          break;
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
      case 'advance_day':        this.handleAdvanceDay(cmd);        break;
      case 'end_game':           this.handleEndGame(cmd);           break;
      default:
        this.print('알 수 없는 상태입니다. 마을로 돌아갑니다.', 'error');
        this.showTownMenu();
        break;
    }
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
    this.printOption('1', '  1. 새 게임');
    this.printOption('2', '  2. 계속하기');
    this.printBlank();
    this.setActions([{key:'1', label:'새 게임'}, {key:'2', label:'계속하기'}]);
  }

  handleMainMenu(cmd) {
    switch (cmd) {
      case '1':
        this.engine.newGame();
        this.showIntro();
        break;
      case '2':
        if (this.engine.loadGame()) {
          this.print('저장된 게임을 불러왔습니다.', 'success');
          this.updateStatus();
          this.showTownMenu();
        } else {
          this.print('저장된 게임이 없습니다.', 'error');
        }
        break;
      default:
        this.print('1 또는 2를 입력하세요.', 'error');
        break;
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
    this.clearOutput();
    this.printSeparator();
    this.print('【 미궁 도시 】', 'location');
    this.printBlank();

    const s = this.engine.state;
    this.print(`${s.year}년 ${s.month}월 ${s.day}일`, 'lore');
    this.print(`스태미나: ${s.stamina}/${s.maxStamina}  |  영혼력: ${s.soulPower}`, 'system');
    this.printBlank();
    this.print('도시의 중심 광장. 탐사자들이 분주히 오가고 있다.', 'description');
    this.printBlank();
    this.printOption('1', '  1. 탐사 준비    — 미궁에 진입한다');
    this.printOption('2', '  2. 조합/가공    — 공방에서 제작한다');
    this.printOption('3', '  3. 유닛 관리    — 유닛을 확인/육성한다');
    this.printOption('4', '  4. 도시 시설    — 시설을 관리한다');
    this.printOption('5', '  5. 전서         — 유닛을 구매/등록한다');
    this.printOption('6', '  6. 인벤토리     — 소지품을 확인한다');
    this.printOption('7', '  7. 하루 넘기기');
    this.printOption('8', '  8. 저장');
    this.printBlank();
    this.setActions([
      {key:'1', label:'탐사'}, {key:'2', label:'조합'}, {key:'3', label:'유닛'},
      {key:'4', label:'시설'}, {key:'5', label:'전서'}, {key:'6', label:'인벤토리'},
      {key:'7', label:'넘기기'}, {key:'8', label:'저장'}
    ]);
    this.updateStatus();
  }

  handleTown(cmd) {
    switch (cmd) {
      case '1': this.showDungeonPrep();    break;
      case '2': this.showCrafting();       break;
      case '3': this.showUnitManagement(); break;
      case '4': this.showCityFacilities(); break;
      case '5': this.showCompendium();     break;
      case '6': this.showInventory();      break;
      case '7': this.doAdvanceDay();       break;
      case '8': this.doSaveGame();         break;
      default:
        this.print('1~8 사이의 번호를 입력하세요.', 'error');
        break;
    }
  }

  doSaveGame() {
    if (this.engine.saveGame()) {
      this.print('게임이 저장되었습니다.', 'success');
    } else {
      this.print('저장에 실패했습니다.', 'error');
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

    // Floor selection info
    const maxFloor = this.engine.state.dungeon.maxFloorReached;
    const maxAvailable = Math.min(15, maxFloor + 1);
    this.print(`진입 가능 층: 1층 ~ ${maxAvailable}층`, 'system');
    this.print(`스태미나: ${this.engine.state.stamina}/${this.engine.state.maxStamina}`, 'system');
    this.printBlank();
    this.print('진입할 층 번호를 입력하세요. (0 = 돌아가기)', 'dim');
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
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

    // Open chest
    if (lowerCmd === 'o') {
      const currentNode = this.dungeon.getCurrentNode();
      if (!currentNode || currentNode.type !== 'chest') {
        this.print('여기에 상자가 없습니다.', 'error');
        return;
      }
      const chest = this.dungeon.openChest(currentNode);
      this.print(chest.message, chest.empty ? 'dim' : 'success');
      if (!chest.empty && chest.loot) {
        for (const item of chest.loot) {
          this.print(`  ${item.name} x${item.qty}`, 'lore');
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
      this.print(`  성향: ${ud.personalityTraits.join(', ')}`, 'dim');
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

    // Build player party (player + party units)
    const playerUnit = {
      instanceId: 0,
      name: this.engine.state.player.name,
      hp: this.engine.state.player.hp,
      maxHp: this.engine.state.player.maxHp,
      atk: this.engine.state.player.atk,
      def: this.engine.state.player.def,
      spd: this.engine.state.player.spd,
      traits: this.engine.state.player.traits,
      personalityTraits: [],
      primaryElement: null,
      category: '인조',
      defenseProfile: { physical: 10, '열': 10, '위': 10, '동': 10, '광': 10, '식': 10 }
    };

    const partyInstances = this.engine.getPartyUnits().filter(u => !u.isKnockedOut);
    const allyParty = [playerUnit, ...partyInstances];

    this.combat.startBattle(allyParty, enc.enemies);
    this.showCombatScreen();
  }

  showCombatScreen() {
    this.currentScreen = 'combat';
    this.clearOutput();
    this.printSeparator();
    this.print('【 전투 】', 'combat');
    this.printBlank();

    const bs = this.combat.battleState;

    // Show ally/enemy HP
    this.print('— 아군 —', 'system');
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
    // List usable items from inventory
    const inv = this.engine.state.inventory;
    const usableItems = [];
    for (const [matId, qty] of Object.entries(inv)) {
      const mat = this.engine.data.materials.find(m => m.id === matId);
      if (mat && mat.effect && (mat.effect.type === 'heal' || mat.effect.type === 'damage')) {
        usableItems.push({ id: matId, name: mat.name, qty, effect: mat.effect });
      }
    }

    if (usableItems.length === 0) {
      this.print('사용 가능한 아이템이 없습니다.', 'dim');
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
      this.print('전멸...', 'danger');
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
    this.print('【 공방 — 조합/가공 】', 'location');
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
    this.print(`  ${result.input} → ${result.result.name || result.result.resultName || '가공물'}`, 'lore');
    if (result.result.tags) {
      const t = result.result.tags || result.result.resultTags || {};
      const tagStr = Object.entries(t).filter(([,v]) => v).map(([k,v]) => `${k}:${v}`).join(', ');
      if (tagStr) this.print(`  태그: ${tagStr}`, 'dim');
    }
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
    this.updateStatus();

    // Return to crafting process select
    this.showCraftingProcess();
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
    if (result.result.effect && result.result.effect.desc) {
      this.print(`  효과: ${result.result.effect.desc}`, 'dim');
    }
    if (result.contradictions !== undefined) {
      this.print(`  모순 수: ${result.contradictions}`, 'dim');
    }
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
    this.updateStatus();

    // Return to crafting menu
    this.currentScreen = 'crafting';
    this.printOption('0', '  0. 돌아가기 / 번호 입력으로 계속');
  }

  showRecipeList() {
    this.printBlank();
    const recipes = this.crafting.getKnownRecipes();
    this._recipeList = recipes;

    this.print('── 알려진 레시피 ──', 'lore');
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
    this.setActions([{key:'0', label:'돌아가기'}]);
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
        this.print(
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
    const eqNames = [];
    for (const [slot, itemId] of Object.entries(u.equipment)) {
      if (itemId) {
        const mat = this.engine.data.materials.find(m => m.id === itemId);
        eqNames.push(`${slot}: ${mat ? mat.name : itemId}`);
      }
    }
    if (eqNames.length > 0) {
      this.print(`  장비: ${eqNames.join(' | ')}`, 'dim');
    }

    const inParty = this.engine.state.party.includes(u.instanceId);
    this.printBlank();
    this.printOption('1', '  1. 훈련 (전투 경험치)');
    this.printOption('2', '  2. 교류 (호감도)');
    this.printOption('3', '  3. 조교');
    this.printOption('4', '  4. 장비 변경');
    this.printOption('5', `  5. 파티 편성 (현재: ${inParty ? '편성됨' : '미편성'})`);
    this.printOption('6', '  6. 납품 (영혼력 획득)');
    this.printOption('7', '  7. 합체 (유닛 합성)');
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
    this.setActions([{key:'1',label:'훈련'},{key:'2',label:'교류'},{key:'3',label:'조교'},{key:'5',label:'파티'},{key:'6',label:'납품'},{key:'7',label:'합체'},{key:'0',label:'돌아가기'}]);
    this.updateStatus();
  }

  handleUnitDetail(cmd) {
    switch (cmd) {
      case '1': this.doTrain();            break;
      case '2': this.doSocialize();        break;
      case '3': this.doTrainAdult();       break;
      case '4': this.doEquipChange();      break;
      case '5': this.doPartyToggle();      break;
      case '6': this.doDeliver();          break;
      case '7': this.showFusionSelectA();  break;
      case '0': this.showUnitManagement(); break;
      default:
        this.print('0~7 사이의 번호를 입력하세요.', 'error');
        break;
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
    this.printBlank();
    this.updateStatus();
    this.showUnitDetail();
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
      const effectDesc = item.effect ? item.effect.desc : '';
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
    this.print('정말 납품하시겠습니까? (y/n)', 'important');

    const self = this;
    const origHandler = this.handleUnitDetail.bind(this);
    this.handleUnitDetail = function(c) {
      self.handleUnitDetail = origHandler;
      if (c.toLowerCase() === 'y') {
        const result = self.unit.deliverUnit(self._selectedUnitId);
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
    this.print('합체를 실행하시겠습니까? 원본 유닛은 사라집니다. (y/n)', 'important');
    this.printBlank();
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

    this.printOption('1', '  1. 업그레이드 (건설)');
    this.printOption('2', '  2. 유닛 배치');
    this.printOption('3', '  3. 유닛 해제');
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
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
        this.print(
          `  ${i + 1}. ${ud.name} Lv.${ud.level} | 인:${ud.sigilName} | 가격: ${price} 영혼력 ${canBuy ? '' : '[부족]'}`,
          canBuy ? 'menu' : 'dim'
        );
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
  //  SCREEN: Inventory
  // ============================================================
  showInventory() {
    this.currentScreen = 'inventory';
    this.clearOutput();
    this.printSeparator();
    this.print('【 인벤토리 】', 'location');
    this.printBlank();

    const inv = this.engine.state.inventory;
    const matIds = Object.keys(inv).filter(id => inv[id] > 0);

    if (matIds.length === 0) {
      this.print('  소지품이 없습니다.', 'dim');
    } else {
      // Group by source/type
      const groups = {};
      for (const matId of matIds) {
        const mat = this.engine.data.materials.find(m => m.id === matId);
        const source = (mat && mat.source) ? mat.source : '기본 재료';
        if (!groups[source]) groups[source] = [];
        groups[source].push({ id: matId, name: mat ? mat.name : matId, qty: inv[matId], mat });
      }

      for (const [source, items] of Object.entries(groups)) {
        this.print(`  [${source}]`, 'system');
        for (const item of items) {
          let tagStr = '';
          if (item.mat && item.mat.tags) {
            const tags = item.mat.tags;
            const parts = [];
            if (tags.function) parts.push(tags.function);
            if (tags.element) parts.push(tags.element);
            if (tags.form) parts.push(tags.form);
            if (parts.length > 0) tagStr = ` (${parts.join('/')})`;
          }
          this.print(`    ${item.name} x${item.qty}${tagStr}`, 'dim');
        }
      }
    }

    // Also show crafted items
    if (this.engine.state.craftedItems && this.engine.state.craftedItems.length > 0) {
      this.printBlank();
      this.print('  [제작 아이템]', 'system');
      for (const item of this.engine.state.craftedItems) {
        this.print(`    ${item.name}`, 'lore');
      }
    }

    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
    this.updateStatus();
  }

  handleInventory(cmd) {
    if (cmd === '0') {
      this.showTownMenu();
    } else {
      this.print('0을 입력하여 돌아갈 수 있습니다.', 'dim');
    }
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
