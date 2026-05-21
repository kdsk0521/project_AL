'use strict';
module.exports = function (App) {
  // ============================================================
  //  SCREEN: City Facilities
  // ============================================================
  App.prototype.showCityFacilities = function () {
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
  };

  App.prototype.handleCityFacilities = function (cmd) {
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
  };

  App.prototype.showFacilityDetail = function () {
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
  };

  App.prototype.handleFacilityDetail = function (cmd) {
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
  };

  App.prototype.doFacilityUpgrade = function () {
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
  };

  App.prototype.showFacilityAssign = function () {
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
  };

  App.prototype.handleFacilityAssign = function (cmd) {
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
  };

  App.prototype.doFacilityUnassign = function () {
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
  };
};
