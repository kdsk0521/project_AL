'use strict';
module.exports = function (App) {
  // ============================================================
  //  SCREEN: Crafting
  // ============================================================
  App.prototype.showCrafting = function () {
    this.currentScreen = 'crafting';
    this.clearOutput();
    this.printSeparator();
    this.print('【 공방 — 가공/연구 】', 'location');
    this.printBlank();
    this.print('작업대 위에 도구들이 정리되어 있다.', 'description');

    // Show available equipment
    var eq = this.engine.state.equipment;
    this.print('  장비: 가마' + (eq.furnace ? '(O)' : '(X)') + ' | 분쇄기' + (eq.crusher ? '(O)' : '(X)') + ' | 압축기' + (eq.compressor ? '(O)' : '(X)'), 'dim');
    this.printBlank();
    this.printOption('1', '  1. 가공 (재료에 장비 사용)');
    this.printOption('2', '  2. 조합 (재료 2개 합성)');
    this.printOption('3', '  3. 레시피 확인');
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
    this.setActions([{key:'1', label:'가공'}, {key:'2', label:'조합'}, {key:'3', label:'레시피'}, {key:'0', label:'돌아가기'}]);
    this.updateStatus();
  };

  App.prototype.handleCrafting = function (cmd) {
    switch (cmd) {
      case '1': this.showCraftingProcess(); break;
      case '2': this.showCraftingCombine(); break;
      case '3': this.showRecipeList();      break;
      case '0': this.showTownMenu();        break;
      default:
        this.print('0~3 사이의 번호를 입력하세요.', 'error');
        break;
    }
  };

  App.prototype.showCraftingProcess = function () {
    this.currentScreen = 'crafting_process';
    this.printBlank();
    this.print('── 가공할 재료 선택 ──', 'system');

    var inv = this.engine.state.inventory;
    var matIds = Object.keys(inv).filter(function (id) { return inv[id] > 0; });
    this._inventoryList = matIds;

    if (matIds.length === 0) {
      this.print('  가공 가능한 재료가 없습니다.', 'dim');
      this.printBlank();
      this.printOption('0', '  0. 돌아가기');
      return;
    }

    var self = this;
    matIds.forEach(function (matId, i) {
      var name = self.engine.getMaterialName(matId);
      self.printOption('' + (i + 1), '  ' + (i + 1) + '. ' + name + ' x' + inv[matId]);
    });
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
  };

  App.prototype.handleCraftingProcess = function (cmd) {
    if (cmd === '0') {
      this.showCrafting();
      return;
    }
    var idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._inventoryList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    var matId = this._inventoryList[idx - 1];
    this._processingMatId = matId;

    // Show processing options for this material
    var options = this.crafting.getProcessingOptions(matId);
    this._processingOptions = options;

    if (options.length === 0) {
      this.print('이 재료에 사용 가능한 가공 장비가 없습니다.', 'dim');
      return;
    }

    this.currentScreen = 'crafting_process_eq';
    var matName = this.engine.getMaterialName(matId);
    this.printBlank();
    this.print('── ' + matName + ' 가공 장비 선택 ──', 'system');
    options.forEach(function (opt, i) {
      this.printOption('' + (i + 1), '  ' + (i + 1) + '. ' + opt.name);
    }.bind(this));
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
  };

  App.prototype.handleCraftingProcessEq = function (cmd) {
    if (cmd === '0') {
      this.showCraftingProcess();
      return;
    }
    var idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._processingOptions.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    var equipId = this._processingOptions[idx - 1].id;
    var result = this.crafting.processMaterial(this._processingMatId, equipId);

    if (!result.success) {
      this.print(result.reason, 'error');
      return;
    }

    this.printBlank();
    this.print('가공 완료!', 'success');
    this.print('  ' + result.input + ' → ' + (result.result.name || '가공물'), 'lore');
    this._printTagSummary(result.result);
    this.printBlank();
    this.printOption('1', '  [공방으로]');
    this.currentScreen = 'craft_result';
    this.setActions([{key:'1', label:'공방으로'}]);
    this.updateStatus();

    var self = this;
    this._craftResultHandler = function (_c) {
      delete self._craftResultHandler;
      self.showCrafting();
    };
  };

  App.prototype.showCraftingCombine = function () {
    this.currentScreen = 'crafting_combine';
    this._combineStep = 1;
    this.printBlank();
    this.print('── 조합: 첫 번째 재료 선택 ──', 'system');

    var inv = this.engine.state.inventory;
    var matIds = Object.keys(inv).filter(function (id) { return inv[id] > 0; });
    this._inventoryList = matIds;

    if (matIds.length < 2) {
      this.print('  조합하려면 재료가 2종류 이상 필요합니다.', 'dim');
      this.printBlank();
      this.printOption('0', '  0. 돌아가기');
      this.setActions([{key:'0', label:'돌아가기'}]);
      return;
    }

    var self = this;
    matIds.forEach(function (matId, i) {
      var name = self.engine.getMaterialName(matId);
      self.printOption('' + (i + 1), '  ' + (i + 1) + '. ' + name + ' x' + inv[matId]);
    });
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
  };

  App.prototype.handleCraftingCombine = function (cmd) {
    if (cmd === '0') {
      this.showCrafting();
      return;
    }
    var idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._inventoryList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    this._combineMatA = this._inventoryList[idx - 1];
    var nameA = this.engine.getMaterialName(this._combineMatA);
    this.print('  첫 번째 재료: ' + nameA, 'system');
    this.printBlank();

    // Show second material list
    this.currentScreen = 'crafting_combine_b';
    this.print('── 두 번째 재료 선택 ──', 'system');

    var inv = this.engine.state.inventory;
    var combineMatA = this._combineMatA;
    var matIds = Object.keys(inv).filter(function (id) {
      if (id === combineMatA && inv[id] < 2) return false;
      return inv[id] > 0;
    });
    this._inventoryList = matIds;

    var self = this;
    matIds.forEach(function (matId, i) {
      var name = self.engine.getMaterialName(matId);
      self.printOption('' + (i + 1), '  ' + (i + 1) + '. ' + name + ' x' + inv[matId]);
    });
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
  };

  App.prototype.handleCraftingCombineB = function (cmd) {
    if (cmd === '0') {
      this.showCraftingCombine();
      return;
    }
    var idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._inventoryList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    this._combineMatB = this._inventoryList[idx - 1];
    var nameA = this.engine.getMaterialName(this._combineMatA);
    var nameB = this.engine.getMaterialName(this._combineMatB);

    this.printBlank();
    this.print('조합: ' + nameA + ' + ' + nameB, 'system');

    var result = this.crafting.combine(this._combineMatA, this._combineMatB);

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

    this.print('결과: ' + result.result.name, 'success');
    if (this.engine.state.tutorial) this.engine.state.tutorial.firstCrafting = true;
    this._printTagSummary(result.result);
    if (result.result.effect && result.result.effect.desc) {
      this.print('  효과: ' + result.result.effect.desc, 'dim');
    }
    if (result.contradictions !== undefined && result.contradictions > 0) {
      this.print('  모순: ' + result.contradictions + '쌍', 'dim');
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
    var toolUpgrades = {
      'TOOL_PICKAXE_2': { key: 'pickaxe', tier: 2, name: '단단한 곡괭이' },
      'TOOL_SICKLE_2':  { key: 'sickle',  tier: 2, name: '날카로운 낫' },
      'TOOL_FISHING_ROD_2': { key: 'rod', tier: 2, name: '튼튼한 낚시대' },
    };
    var upgrade = toolUpgrades[result.result.id];
    if (upgrade) {
      this.engine.removeMaterial(result.result.id, 1);
      var tool = this.engine.state.gatherTools[upgrade.key];
      tool.id = result.result.id;
      tool.tier = upgrade.tier;
      tool.name = upgrade.name;
      this.printBlank();
      this.print('★ ' + upgrade.name + ' 장착! 채집량 ×' + (1 + (upgrade.tier - 1) * 0.5), 'success');
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

    var self = this;
    this._craftResultHandler = function (_c) {
      delete self._craftResultHandler;
      self.showCrafting();
    };
  };

  App.prototype.showRecipeList = function () {
    this.currentScreen = 'recipe_list';
    this.clearOutput();
    this.printSeparator();
    this.print('【 레시피 목록 】', 'location');
    this.printBlank();

    var recipes = this.crafting.getKnownRecipes();
    this._recipeList = recipes;

    if (recipes.length === 0) {
      this.print('  아직 발견한 레시피가 없습니다.', 'dim');
    } else {
      var self = this;
      recipes.forEach(function (r, i) {
        var matNames = (r.materials || []).map(function (mid) { return self.engine.getMaterialName(mid); });
        var canCraft = self.crafting.canCraftRecipe(r);
        var craftTag = canCraft ? '[제작 가능]' : '[재료 부족]';
        if (canCraft) {
          self.printOption('' + (i + 1), '  ' + (i + 1) + '. ' + r.name + ' ← ' + matNames.join(' + ') + ' ' + craftTag);
        } else {
          self.print('  ' + (i + 1) + '. ' + r.name + ' ← ' + matNames.join(' + ') + ' ' + craftTag, 'dim');
        }
      });
    }
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
  };

  App.prototype.handleRecipeList = function (cmd) {
    if (cmd === '0') { this.showCrafting(); return; }
    var idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || !this._recipeList || idx > this._recipeList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }
    var recipe = this._recipeList[idx - 1];
    var result = this.crafting.craftRecipe(recipe.id);
    this.printBlank();
    if (!result.success) {
      this.print(result.reason, 'error');
      return;
    }
    this.print('제작 완료: ' + result.result.name, 'success');
    this._printTagSummary(result.result);
    if (result.result.effect) {
      this.print('  효과: ' + result.result.effect, 'dim');
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
    var toolUp = { 'TOOL_PICKAXE_2':{key:'pickaxe',tier:2}, 'TOOL_SICKLE_2':{key:'sickle',tier:2}, 'TOOL_FISHING_ROD_2':{key:'rod',tier:2} };
    var tu = toolUp[result.result.id];
    if (tu) {
      this.engine.removeMaterial(result.result.id, 1);
      var tool = this.engine.state.gatherTools[tu.key];
      tool.id = result.result.id;
      tool.tier = tu.tier;
      tool.name = result.result.name;
      this.print('★ ' + result.result.name + ' 장착!', 'success');
    }

    this.printBlank();
    this.updateStatus();
    this.showRecipeList();
  };
};
