'use strict';
module.exports = function (App) {
  // ============================================================
  //  SCREEN: Unit Management
  // ============================================================
  App.prototype.showUnitManagement = function () {
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
  };

  App.prototype.handleUnitManagement = function (cmd) {
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
  };

  App.prototype.showUnitDetail = function () {
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
  };

  App.prototype.handleUnitDetail = function (cmd) {
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
  };

  App.prototype.doTrain = function () {
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
  };

  App.prototype.doSocialize = function () {
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
  };

  App.prototype.doHealUnit = function () {
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
  };

  App.prototype.doTrainAdult = function () {
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
  };

  App.prototype.doEquipChange = function () {
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
  };

  App.prototype.doPartyToggle = function () {
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
  };

  App.prototype.doDeliver = function () {
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
  };

  // ============================================================
  //  Fusion Sub-screens
  // ============================================================
  App.prototype.showFusionSelectA = function () {
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
  };

  App.prototype.handleFusionSelectA = function (cmd) {
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
  };

  App.prototype.handleFusionSelectB = function (_cmd) {
    // Not used — handled in flow above
  };

  App.prototype.handleFusionConfirm = function (cmd) {
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
  };
};
