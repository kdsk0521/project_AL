'use strict';

// Screens: town, advance_day, end_game + helpers
module.exports = function (App) {

  // ── Tutorial Guide ──

  App.prototype._checkTutorialGuide = function (s) {
    var t = s.tutorial;
    if (!t) return;

    if (!t.firstExploration && s.dungeon.maxFloorReached === 0) {
      this.print('💡 전임자의 메모: "미궁에 들어가면 재료를 캘 수 있다. 1번을 눌러 탐사를 시작해보자."', 'lore');
      this.printBlank();
      return;
    }
    if (!t.firstCrafting && s.dungeon.maxFloorReached >= 1 && Object.keys(s.inventory).length > 2) {
      if (!t.firstExploration) t.firstExploration = true;
      this.print('💡 전임자의 메모: "가져온 재료로 뭔가 만들어보자. 2번 가공/연구에서 조합할 수 있다."', 'lore');
      this.print('   "약초와 물을 합치면 회복 물약이 된다. 기초 중의 기초."', 'dim');
      this.printBlank();
      return;
    }
    if (!t.firstRecruitment && t.firstCrafting && s.ownedUnits.length <= 1) {
      this.print('💡 미궁 2층부터는 분기가 나뉜다. 만나는 유닛에게 대화를 시도해보자.', 'lore');
      this.printBlank();
      return;
    }
    if (!t.firstPlacement && s.ownedUnits.length >= 2) {
      if (!t.firstRecruitment) t.firstRecruitment = true;
      var inParty = s.party.length;
      if (s.ownedUnits.length > inParty) {
        this.print('💡 탐사에 안 데려갈 유닛은 도시 시설에 배치할 수 있다. (5번 도시 시설)', 'lore');
        this.printBlank();
        return;
      }
    }
    if (s.milestones.firstBossDefeated && !s.milestones.compressorBuilt) {
      if (!t.firstBoss) t.firstBoss = true;
      if (s.inventory['MAT_SPRING'] > 0) {
        this.print('💡 보스에서 얻은 스프링으로 압축기를 만들 수 있다. 마법강철도 필요하다.', 'lore');
        this.print('   (철광석→분쇄→철가루 + 마력석 = 마법강철)', 'dim');
        this.printBlank();
      }
      return;
    }
    if (s.milestones.compressorBuilt && !t.maintenanceWarned) {
      t.maintenanceWarned = true;
      this.print('⚠ 압축기 설치로 월간 유지비가 발생합니다. 영혼력이 부족해지면 유닛을 납품하세요.', 'error');
      this.printBlank();
      return;
    }
    if (s.milestones.compressorBuilt && !t.firstDelivery && s.soulPower < 100) {
      this.print('💡 영혼력이 부족하다. 유닛을 전서에 납품하면 영혼력을 얻을 수 있다. (3번 유닛 관리 → 납품)', 'lore');
      this.printBlank();
      return;
    }
  };

  // ── Town Hub ──

  App.prototype.showTownMenu = function () {
    this.currentScreen = 'town';
    this.autoSave();
    this.clearOutput();
    this.printSeparator();
    this.print('【 미궁 도시 】', 'location');
    this.printBlank();

    var s = this.engine.state;
    this._checkTutorialGuide(s);

    this.print(s.year + '년 ' + s.month + '월 ' + s.day + '일', 'lore');
    this.print('스태미나: ' + s.stamina + '/' + s.maxStamina + '  |  영혼력: ' + s.soulPower, 'system');
    if (s.dayAction) {
      var actionLabel = s.dayAction === 'dungeon' ? '탐사' : '조교/교류';
      this.print('오늘의 행동: ' + actionLabel + ' (진행됨)', 'dim');
    }
    this.printBlank();
    this.print('도시의 중심 광장. 탐사자들이 분주히 오가고 있다.', 'description');
    this.printBlank();
    var blocked = s.dayAction;
    this.printOption('1', '  1. 탐사 준비    — 미궁에 진입한다' + (blocked === 'training' ? ' [오늘 불가]' : ''));
    this.printOption('2', '  2. 가공/연구    — 공방에서 가공·조합한다');
    this.printOption('3', '  3. 유닛 관리    — 유닛을 확인/육성한다');
    this.printOption('4', '  4. 조교소       — 유닛을 조교한다' + (blocked === 'dungeon' ? ' [오늘 불가]' : ''));
    this.printOption('5', '  5. 도시 시설    — 시설을 관리한다');
    this.printOption('6', '  6. 전서         — 유닛을 구매/등록한다');
    this.printOption('7', '  7. 인벤토리     — 소지품을 확인한다');
    this.printOption('t', '  t. 도구 관리    — 도구를 확인/업그레이드한다');
    this.printOption('8', '  8. 하루 넘기기');
    this.printOption('9', '  9. 저장');
    var p = this.engine.state.player;
    if (p.hp < p.maxHp) {
      this.printOption('0', '  0. 회복 (연금술사 HP: ' + p.hp + '/' + p.maxHp + ')');
    }
    this.printBlank();
    this.setActions([
      { key: '1', label: '탐사' }, { key: '2', label: '가공/연구' }, { key: '3', label: '유닛' },
      { key: '4', label: '조교소' }, { key: '5', label: '시설' }, { key: '6', label: '전서' },
      { key: '7', label: '인벤토리' }, { key: 't', label: '도구' }, { key: '8', label: '넘기기' }, { key: '9', label: '저장' },
      ...(p.hp < p.maxHp ? [{ key: '0', label: '회복' }] : [])
    ]);
    this.updateStatus();
  };

  App.prototype.handleTown = function (cmd) {
    var da = this.engine.state.dayAction;
    switch (cmd) {
      case '1': {
        if (da === 'training') { this.print('오늘은 이미 조교/교류를 진행했습니다. 내일 탐사할 수 있습니다.', 'error'); break; }
        var check = this.engine.canExplore();
        if (!check.ok) { this.print(check.reason, 'error'); break; }
        this.engine.state.dayAction = 'dungeon';
        this.showDungeonPrep();
        break;
      }
      case '2': this.showCrafting();        break;
      case '3': this.showUnitManagement();  break;
      case '4': {
        if (da === 'dungeon') { this.print('오늘은 이미 탐사를 진행했습니다. 내일 조교할 수 있습니다.', 'error'); break; }
        this.engine.state.dayAction = 'training';
        this.showTrainingFacility();
        break;
      }
      case '5': this.showCityFacilities();  break;
      case '6': this.showCompendium();      break;
      case '7': this.showInventory();       break;
      case 't': this.showToolManagement();  break;
      case '8': this.doAdvanceDay();        break;
      case '9': this.doSaveGame();          break;
      case '0': this.doHealPlayer();        break;
      default: this.print('번호를 입력하세요.', 'error'); break;
    }
  };

  // ── Heal Player ──

  App.prototype.doHealPlayer = function () {
    var p = this.engine.state.player;
    if (p.hp >= p.maxHp) { this.print('이미 만전입니다.', 'dim'); return; }

    var inv = this.engine.state.inventory;
    var healItems = [];
    for (var matId of Object.keys(inv)) {
      if (inv[matId] <= 0 || matId.startsWith('MAT_')) continue;
      var mat = this.engine.data.materials.find(function (m) { return m.id === matId; });
      if (!mat) continue;
      var isHeal = (mat.effect && mat.effect.type === 'heal') ||
        (mat.category === 'consumable_potion') || (mat.category === 'consumable_food');
      if (isHeal) {
        healItems.push({ id: matId, name: mat.name, qty: inv[matId], value: (mat.effect && mat.effect.value) || 20 });
      }
    }

    if (healItems.length === 0) {
      this.print('회복 아이템이 없습니다. (물약이나 스프를 만들어보세요)', 'error');
      return;
    }

    this.print('연금술사 HP: ' + p.hp + '/' + p.maxHp, 'system');
    this.printBlank();
    var self = this;
    healItems.forEach(function (item, i) {
      self.printOption('' + (i + 1), '  ' + (i + 1) + '. ' + item.name + ' ×' + item.qty + ' (HP +' + item.value + ')');
    });
    this.printOption('0', '  0. 취소');
    this.setActions([{ key: '0', label: '취소' }]);

    var origHandler = this.handleTown.bind(this);
    this.handleTown = function (c) {
      self.handleTown = origHandler;
      if (c === '0') { self.showTownMenu(); return; }
      var idx = parseInt(c);
      if (isNaN(idx) || idx < 1 || idx > healItems.length) { self.showTownMenu(); return; }
      var selected = healItems[idx - 1];
      self.engine.removeMaterial(selected.id, 1);
      var result = self.engine.healPlayer(selected.value);
      self.print(selected.name + ' 사용! HP +' + result.healed + ' (' + result.hp + '/' + result.maxHp + ')', 'success');
      self.printBlank();
      self.updateStatus();
      self.showTownMenu();
    };
  };

  // ── Save Game ──

  App.prototype.doSaveGame = function () {
    this.printBlank();
    this.print('── 저장할 슬롯 선택 ──', 'system');
    var slots = this.engine.getSaveSlots();
    var self = this;
    slots.forEach(function (s) {
      if (s.empty) {
        self.printOption('' + (s.slot + 1), '  슬롯 ' + (s.slot + 1) + ': [비어있음]');
      } else {
        self.printOption('' + (s.slot + 1), '  슬롯 ' + (s.slot + 1) + ': ' + s.date + ' | ' + s.realTime);
      }
    });
    this.printOption('0', '  0. 취소');
    this.setActions([{ key: '1', label: '슬롯1' }, { key: '2', label: '슬롯2' }, { key: '3', label: '슬롯3' }, { key: '0', label: '취소' }]);

    var origHandler = this.handleTown.bind(this);
    this.handleTown = function (c) {
      self.handleTown = origHandler;
      if (c === '0') { self.showTownMenu(); return; }
      if (['1', '2', '3'].includes(c)) {
        var s = parseInt(c) - 1;
        self._currentSaveSlot = s;
        if (self.engine.saveGame(s)) {
          self.print('슬롯 ' + c + '에 저장 완료!', 'success');
        } else {
          self.print('저장 실패.', 'error');
        }
      }
      self.showTownMenu();
    };
  };

  App.prototype.autoSave = function () {
    if (this._currentSaveSlot != null) {
      this.engine.saveGame(this._currentSaveSlot);
    }
  };

  // ── Advance Day ──

  App.prototype.doAdvanceDay = function () {
    this.currentScreen = 'advance_day';

    var oldMonth = this.engine.state.month;
    this.engine.advanceDay();

    this.clearOutput();
    this.printSeparator();
    this.print(this.engine.state.year + '년 ' + this.engine.state.month + '월 ' + this.engine.state.day + '일이 밝았다.', 'system');
    this.printBlank();
    this.print('스태미나 전회복: ' + this.engine.state.stamina + '/' + this.engine.state.maxStamina, 'heal');
    this.printBlank();

    if (this.engine.state.month !== oldMonth || (oldMonth > 1 && this.engine.state.day === 1)) {
      this.printSeparator();
      var monthReport = this.engine.getMonthReport();
      this.print('═══ ' + this.engine.state.month + '월이 시작되었다 ═══', 'important');
      this.printBlank();

      if (monthReport.maintenanceCost > 0) {
        this.print('유지비 지출: 영혼력 -' + monthReport.maintenanceCost, 'error');
      }
      this.print('시설 생산이 완료되었다.', 'system');

      var workshopResults = this.engine.state._workshopResults;
      if (workshopResults && workshopResults.length > 0) {
        this.print('가공소 자동 가공 (' + workshopResults.length + '건):', 'success');
        for (var _i = 0; _i < workshopResults.length; _i++) {
          var r = workshopResults[_i];
          var equipName = { furnace: '가마', crusher: '분쇄', compressor: '압축' }[r.equipment] || r.equipment;
          this.print('  ' + r.from + ' →[' + equipName + ']→ ' + r.to, 'dim');
        }
        this.engine.state._workshopResults = null;
      }

      this.print('이번 달 활성 인: ' + monthReport.activeSignals.join(', '), 'lore');
      this.printBlank();

      var bankCheck = this.economy.checkBankruptcy();
      if (bankCheck.bankrupt) {
        this.print(bankCheck.message, 'danger');
        this.printBlank();
        this.showEndGame(false);
        return;
      }
    }

    this.printOption('1', '  [계속]');
    this.updateStatus();
  };

  App.prototype.handleAdvanceDay = function (_cmd) {
    this.showTownMenu();
  };

  // ── End Game ──

  App.prototype.showEndGame = function (victory) {
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
    var s = this.engine.state;
    this.print('── 최종 기록 ──', 'system');
    this.print('  생존 기간: ' + s.year + '년 ' + s.month + '월 ' + s.day + '일', 'dim');
    this.print('  최종 영혼력: ' + s.soulPower, 'dim');
    this.print('  보유 유닛: ' + s.ownedUnits.length + '체', 'dim');
    this.print('  미궁 최고 도달층: ' + s.dungeon.maxFloorReached + '층', 'dim');
    this.print('  전서 등록 수: ' + s.compendium.registered.length + '종', 'dim');
    this.printBlank();
    this.printOption('1', '  1. 타이틀로 돌아가기');
    this.printBlank();
  };

  App.prototype.handleEndGame = function (cmd) {
    if (cmd === '1') this.showMainMenu();
  };
};
