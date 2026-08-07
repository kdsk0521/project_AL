// ============================================================
//  미궁 연금술사 알파 — App (Renderer Entry Point)
// ============================================================
//  Slim entry point: creates App, loads systems, wires input.
//  Screen logic is split into src/renderer/screens/*.js modules.
//  UI helpers live in src/renderer/ui.js.
// ============================================================
'use strict';

const GameEngine     = require('../game/engine');
const DungeonSystem  = require('../game/systems/dungeon');
const CombatSystem   = require('../game/systems/combat');
const CraftingSystem = require('../game/systems/crafting');
const UnitSystem     = require('../game/systems/unit');
const EconomySystem  = require('../game/systems/economy');
const TrainingSystem = require('../game/systems/training');
const ExtractionSystem = require('../game/systems/extraction');

// ============================================================
//  App Class
// ============================================================
class App {
  constructor() {
    // DOM refs
    this.outputEl = document.getElementById('game-output');
    this.inputEl  = document.getElementById('command-input');

    // Engine + Systems
    this.engine   = new GameEngine();
    this.combat   = new CombatSystem(this.engine);
    this.dungeon  = new DungeonSystem(this.engine);
    this.crafting = new CraftingSystem(this.engine);
    this.unit     = new UnitSystem(this.engine);
    this.economy  = new EconomySystem(this.engine);
    this.training = new TrainingSystem(this.engine);
    this.extraction = new ExtractionSystem(this.engine);

    // Dungeon needs a combat reference
    this.dungeon.combat = this.combat;

    // Screen FSM
    this.currentScreen = 'main_menu';

    // Transient state for multi-step flows
    this._encounter = null;
    this._selectedUnitId = null;
    this._processingMatId = null;
    this._combineStep = 0;
    this._combineMatA = null;
    this._combineMatB = null;
    this._negotiationAttempt = 0;
    this._facilityKey = null;
    this._fusionStep = 0;
    this._fusionUnitA = null;
    this._fusionUnitB = null;
    this._inventoryList = [];
    this._compendiumList = [];
    this._unitList = [];
    this._facilityList = [];
    this._processingOptions = [];
    this._recipeList = [];

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
      case 'hub':                this.handleHub(cmd);               break;
      case 'unit_roster':
      case 'extraction':
      case 'fusion2':
      case 'combat2':
      case 'residence':          break; // v2 패널 — 패널 내 키/마우스 입력 사용
      case 'end_game':           this.handleEndGame(cmd);           break;
      default:
        this.print('알 수 없는 상태입니다. 마을로 돌아갑니다.', 'error');
        this.showTownMenu();
        break;
    }
  }
}

// ============================================================
//  Load UI helpers + Screen modules
//  Each module receives App and extends App.prototype.
// ============================================================
require('./ui')(App);

require('./screens/debug')(App);
require('./screens/menu')(App);
require('./screens/town')(App);
require('./screens/dungeon')(App);
require('./screens/crafting')(App);
require('./screens/unit')(App);
require('./screens/facility')(App);
require('./screens/misc')(App);
require('./screens/tool')(App);
require('./screens/training')(App);

// v2 패널 화면 (목업 이식) — hub는 town 허브를 대체하므로 마지막에 로드
require('./screens/panels')(App);
require('./screens/combat2')(App);
require('./screens/unitlist2')(App);
require('./screens/extraction2')(App);
require('./screens/fusion2')(App);
require('./screens/hub')(App);

// ============================================================
//  Bootstrap
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
