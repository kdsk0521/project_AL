'use strict';

// Screens: main_menu, new_game_slot, intro
module.exports = function (App) {

  // ── Main Menu ──

  App.prototype.showMainMenu = function () {
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

    var slots = this.engine.getSaveSlots();
    this.print('── 세이브 슬롯 ──', 'system');
    var self = this;
    slots.forEach(function (s) {
      if (s.empty) {
        self.print('  슬롯 ' + (s.slot + 1) + ': [비어있음]', 'dim');
      } else {
        self.printOption('' + (s.slot + 1),
          '  슬롯 ' + (s.slot + 1) + ': ' + s.date + ' | 영혼력:' + s.soulPower + ' | 유닛:' + s.units + '체 | ' + s.floor + '층 | ' + s.realTime
        );
      }
    });
    this.printBlank();
    this.printOption('n', '  n. 새 게임');
    this.printBlank();
    this.setActions([
      ...slots.filter(function (s) { return !s.empty; }).map(function (s) { return { key: '' + (s.slot + 1), label: '슬롯' + (s.slot + 1) + ' 불러오기' }; }),
      { key: 'n', label: '새 게임' }
    ]);
  };

  App.prototype.handleMainMenu = function (cmd) {
    if (['1', '2', '3'].includes(cmd)) {
      var slot = parseInt(cmd) - 1;
      if (this.engine.loadGame(slot)) {
        this.print('슬롯 ' + cmd + ' 불러오기 완료!', 'success');
        this.updateStatus();
        this.showTownMenu();
      } else {
        this.print('슬롯 ' + cmd + '에 저장 데이터가 없습니다.', 'error');
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
  };

  // ── New Game Slot ──

  App.prototype.showNewGameSlotSelect = function () {
    this.currentScreen = 'new_game_slot';
    this.printBlank();
    this.print('새 게임을 저장할 슬롯을 선택하세요:', 'system');
    var slots = this.engine.getSaveSlots();
    var self = this;
    slots.forEach(function (s) {
      if (s.empty) {
        self.printOption('' + (s.slot + 1), '  슬롯 ' + (s.slot + 1) + ': [비어있음]');
      } else {
        self.printOption('' + (s.slot + 1), '  슬롯 ' + (s.slot + 1) + ': ' + s.date + ' | ' + s.realTime + ' [덮어쓰기]', 'error');
      }
    });
    this.printBlank();
    this.printOption('0', '  0. 취소');
    this.setActions([{ key: '1', label: '슬롯1' }, { key: '2', label: '슬롯2' }, { key: '3', label: '슬롯3' }, { key: '0', label: '취소' }]);
  };

  App.prototype.handleNewGameSlot = function (cmd) {
    if (cmd === '0') { this.showMainMenu(); return; }
    if (['1', '2', '3'].includes(cmd)) {
      this._currentSaveSlot = parseInt(cmd) - 1;
      this.engine.newGame();
      this.engine.saveGame(this._currentSaveSlot);
      this.showIntro();
    } else {
      this.print('1~3 또는 0을 입력하세요.', 'error');
    }
  };

  // ── Intro ──

  App.prototype.showIntro = function () {
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

    var starter = this.engine.state.ownedUnits[0];
    var starterName = starter ? starter.name : '거품 슬라임';
    this.print(starterName + '이(가) 천천히 다가온다.', 'unit');
    this.print('"...부글부글..."', 'unit');
    this.printBlank();
    this.print('  [초기 유닛 "' + starterName + '" 획득]', 'success');
    if (starter) {
      this.print('  인(' + starter.sigilName + ') | ' + starter.category + ' | Lv.' + starter.level, 'dim');
    }
    this.printBlank();
    this.printOption('1', '  [계속]');
    this.setActions([{ key: '1', label: '계속' }]);
  };

  App.prototype.handleIntro = function (_cmd) {
    this.updateStatus();
    this.showTownMenu();
  };
};
