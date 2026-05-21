'use strict';
module.exports = function (App) {

  // ============================================================
  //  SCREEN: Tool Management (도구 관리)
  // ============================================================
  App.prototype.showToolManagement = function () {
    this.currentScreen = 'tool_manage';
    this.clearOutput();
    this.printSeparator();
    this.print('【 도구 관리 】', 'location');
    this.printBlank();

    var tools = this.engine.state.tools;
    var categories = {
      gather: { label: '채집 도구', keys: ['pickaxe', 'rod', 'staff'] },
      training: { label: '육성 도구', keys: ['dummy', 'treadmill'] },
      adult: { label: '조교 도구', keys: ['rotor', 'textbook'] }
    };

    var idx = 1;
    this._toolList = [];
    var self = this;
    Object.entries(categories).forEach(function (entry) {
      var catKey = entry[0];
      var cat = entry[1];
      self.print('  [' + cat.label + ']', 'system');
      cat.keys.forEach(function (key) {
        var tool = tools[key];
        if (!tool) return;
        var gating = self.engine.getToolGating(key);
        var partsStr = tool.parts.map(function (p) {
          var suffix = self._partSummary(p);
          return p.slot + '(' + suffix + ' t' + p.tier + ')';
        }).join(' | ');
        self._toolList.push(key);
        self.printOption('' + idx, '  ' + idx + '. ' + tool.name + ' [게이팅:' + gating + '] — ' + partsStr);
        idx++;
      });
      self.printBlank();
    });

    this.printOption('0', '  0. 돌아가기');
    this.setActions([{key:'0', label:'돌아가기'}]);
    this.updateStatus();
  };

  App.prototype.handleToolManagement = function (cmd) {
    if (cmd === '0') { this.showTownMenu(); return; }
    var idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._toolList.length) {
      this.print('번호를 입력하세요.', 'error');
      return;
    }
    this._selectedToolKey = this._toolList[idx - 1];
    this.showToolDetail();
  };

  App.prototype.showToolDetail = function () {
    this.currentScreen = 'tool_detail';
    var toolKey = this._selectedToolKey;
    var tool = this.engine.state.tools[toolKey];
    if (!tool) { this.showToolManagement(); return; }

    this.clearOutput();
    this.printSeparator();
    var gating = this.engine.getToolGating(toolKey);
    this.print('【 ' + tool.name + ' 】 게이팅: ' + gating, 'location');
    this.printBlank();

    // 부품 상세
    var self = this;
    this.print('  부품 구성:', 'system');
    tool.parts.forEach(function (p, i) {
      var suffix = self._partSummary(p);
      var bar = '█'.repeat(Math.min(10, p.tier)) + '·'.repeat(Math.max(0, 10 - p.tier));
      self.printOption('' + (i + 1), '  ' + (i + 1) + '. [' + p.slot + '] 접미사: ' + suffix + ' | tier: ' + p.tier + ' [' + bar + ']');
    });
    this.printBlank();

    // 보관함 (이 도구의 보관된 부품)
    var stored = this.engine.state.partInventory.filter(function (p) { return p.toolKey === toolKey; });
    if (stored.length > 0) {
      this.print('  보관함:', 'system');
      stored.forEach(function (p, i) {
        self.printOption('s' + (i + 1), '    s' + (i + 1) + '. ' + p.slot + ' [' + ((p.tags && p.tags.length) ? p.tags.join(',') : '없음') + ' t' + p.tier + '] — 재장착 가능');
      });
      this.printBlank();
    }

    // 게이팅 효과 설명
    if (tool.type === 'gather') {
      var bonus = this.engine.getGatherBonus(tool.gatherZone || '석굴');
      this.print('  채집 효과: ' + tool.gatherZone + ' 채집량 ×' + bonus.toFixed(1), 'dim');
    } else {
      var typeMap = { training_combat:'combat', training_body:'body', training_adult:'adult', training_personality:'personality' };
      var bonus = this.engine.getTrainingBonus(typeMap[tool.type] || 'combat');
      this.print('  효율 보정: ×' + bonus.toFixed(1), 'dim');
    }
    this.printBlank();

    this.printOption('u', '  u. 부품 업그레이드 (솥 — 아이템 투입)');
    this.printOption('r', '  r. 부품 초기화 (현재 부품 → 부품 보관함, t0으로 리셋)');
    this.printOption('0', '  0. 돌아가기');
    this.setActions([{key:'u', label:'업그레이드'}, {key:'r', label:'초기화'}, {key:'0', label:'돌아가기'}]);
  };

  App.prototype.handleToolDetail = function (cmd) {
    if (cmd === '0') { this.showToolManagement(); return; }
    if (cmd === 'u') { this.showToolUpgrade(); return; }
    if (cmd === 'r') {
      // 부품 초기화 — 현재 부품 보관 + 새 t0 부품 제작 (재료 소모)
      this.printBlank();
      this.print('초기화할 부품 번호 (1~3):', 'system');
      this.print('  (현재 부품은 보관함으로. 새 t0 부품 제작에 재료가 소모됩니다)', 'dim');
      var tool = this.engine.state.tools[this._selectedToolKey];
      var recipes = this.engine.state.partRecipes;
      var self = this;
      tool.parts.forEach(function (p, i) {
        var recipeKey = self._selectedToolKey + '_' + i;
        var mats = recipes[recipeKey] || [];
        var matNames = mats.map(function (m) { return self.engine.getMaterialName(m); });
        var canCraft = mats.every(function (m) { return self.engine.hasMaterial(m); });
        if (p.tier > 0) {
          self.printOption('' + (i+1), '  ' + (i+1) + '. ' + p.slot + ' [' + ((p.tags && p.tags.length) ? p.tags.join(',') : '없음') + ' t' + p.tier + '] → 리셋 (필요: ' + matNames.join('+') + ' ' + (canCraft ? '' : '[재료 부족]') + ')');
        } else {
          self.print('  ' + (i+1) + '. ' + p.slot + ' (이미 t0)', 'dim');
        }
      });
      this.printOption('0', '  0. 취소');

      var origHandler = this.handleToolDetail.bind(this);
      this.handleToolDetail = function(c) {
        self.handleToolDetail = origHandler;
        if (c === '0') { self.showToolDetail(); return; }
        var pi = parseInt(c);
        if (pi >= 1 && pi <= 3) {
          var part = tool.parts[pi - 1];
          var recipeKey = self._selectedToolKey + '_' + (pi - 1);
          var mats = recipes[recipeKey] || [];

          // 재료 체크
          if (!mats.every(function (m) { return self.engine.hasMaterial(m); })) {
            self.print('재료가 부족합니다.', 'error');
            self.showToolDetail();
            return;
          }

          if (part.tier > 0) {
            // 현재 부품 → 보관함
            self.engine.state.partInventory.push({
              toolKey: self._selectedToolKey,
              slot: part.slot,
              tags: [].concat(part.tags || []),
              tier: part.tier
            });
            self.print(part.slot + ' [' + (part.tags || []).join(',') + ' t' + part.tier + ']을(를) 보관함에 저장.', 'success');
          }

          // 재료 소모 + t0 리셋
          for (var mi = 0; mi < mats.length; mi++) self.engine.removeMaterial(mats[mi], 1);
          self.print('재료 소모: ' + mats.map(function (m) { return self.engine.getMaterialName(m); }).join(' + '), 'dim');
          part.tags = [];
          part.tier = 0;
          self.print('새 t0 ' + part.slot + ' 제작 완료!', 'success');
        }
        self.showToolDetail();
      };
      return;
    }
    // 보관함에서 재장착 (s1, s2, ...)
    if (cmd.startsWith('s')) {
      var si = parseInt(cmd.substring(1));
      var tool = this.engine.state.tools[this._selectedToolKey];
      var stored = this.engine.state.partInventory.filter(function (p) { return p.toolKey === this._selectedToolKey; }.bind(this));
      if (si >= 1 && si <= stored.length) {
        var storedPart = stored[si - 1];
        // 같은 슬롯의 현재 부품을 보관함으로
        var slotIdx = tool.parts.findIndex(function (p) { return p.slot === storedPart.slot; });
        if (slotIdx >= 0) {
          var current = tool.parts[slotIdx];
          if (current.tier > 0) {
            this.engine.state.partInventory.push({
              toolKey: this._selectedToolKey,
              slot: current.slot,
              tags: [].concat(current.tags || []),
              tier: current.tier
            });
          }
          // 보관함 부품을 장착
          current.tags = [].concat(storedPart.tags || []);
          current.tier = storedPart.tier;
          // 보관함에서 제거
          var globalIdx = this.engine.state.partInventory.indexOf(storedPart);
          if (globalIdx >= 0) this.engine.state.partInventory.splice(globalIdx, 1);
          this.print(storedPart.slot + ' [' + (storedPart.tags || []).join(',') + ' t' + storedPart.tier + '] 장착!', 'success');
        }
        this.showToolDetail();
        return;
      }
    }

    // 부품 번호 선택 시 업그레이드
    var idx = parseInt(cmd);
    if (idx >= 1 && idx <= 3) {
      this._selectedPartIdx = idx - 1;
      this.showToolUpgrade();
    }
  };

  App.prototype.showToolUpgrade = function () {
    this.currentScreen = 'tool_upgrade';
    var toolKey = this._selectedToolKey;
    var tool = this.engine.state.tools[toolKey];
    var partIdx = this._selectedPartIdx || 0;
    var part = tool.parts[partIdx];

    this.clearOutput();
    this.printSeparator();
    this.print('【 부품 업그레이드: ' + tool.name + ' — ' + part.slot + ' 】', 'location');
    this.print('  현재 태그: ' + ((part.tags && part.tags.length) ? part.tags.join(',') : '없음') + ' / tier ' + this._partTier(part), 'dim');
    this.printBlank();

    // 재료 선택 (모든 인벤토리 — 원재료, 가공품, 조합품 전부 가능)
    this.print('  투입할 아이템을 선택하세요 (고tier 조합품 = 더 큰 효과):', 'system');
    var inv = this.engine.state.inventory;
    var matIds = Object.keys(inv).filter(function (id) { return inv[id] > 0; });
    this._upgradeMatList = matIds;

    var self = this;
    if (matIds.length === 0) {
      this.print('  투입할 아이템이 없습니다.', 'dim');
    } else {
      matIds.forEach(function (matId, i) {
        var mat = self.engine.data.materials.find(function (m) { return m.id === matId; });
        var name = mat ? mat.name : matId;
        // 태그 밀도 미리보기
        var preview = '';
        if (mat && mat.tags) {
          var tags = mat.tags;
          var funcs = (tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : [])).filter(Boolean);
          var elems = (tags.elements || (tags.element ? (Array.isArray(tags.element) ? tags.element : [tags.element]) : [])).filter(Boolean);
          var allTags = [].concat(funcs, elems);
          // tier 미리보기
          if (allTags.length > 0) {
            var counts = {};
            allTags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
            var density = Math.floor(Object.values(counts).reduce(function (s, v) { return s + v; }, 0) / Object.keys(counts).length);
            var tagStr = Object.entries(counts).map(function (entry) { return entry[1] > 1 ? entry[0] + '×' + entry[1] : entry[0]; }).join(',');
            preview = ' [t' + density + ' ' + tagStr + ']';
          }
        }
        self.printOption('' + (i + 1), '  ' + (i + 1) + '. ' + name + ' ×' + inv[matId] + preview);
      });
    }
    this.printBlank();

    // 부품 선택 (1~3)
    this.print('  부품: ' + tool.parts.map(function (p, i) { return (i+1) + '.' + p.slot + '(t' + p.tier + ')' + (i === partIdx ? '◀' : ''); }).join('  '), 'dim');
    this.printOption('0', '  0. 돌아가기');
    this.setActions([{key:'0', label:'돌아가기'}]);
  };

  App.prototype.handleToolUpgrade = function (cmd) {
    if (cmd === '0') { this.showToolDetail(); return; }

    var idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || !this._upgradeMatList || idx > this._upgradeMatList.length) {
      this.print('아이템 번호를 입력하세요.', 'error');
      return;
    }

    var matId = this._upgradeMatList[idx - 1];
    var mat = this.engine.data.materials.find(function (m) { return m.id === matId; });
    if (!mat || !this.engine.hasMaterial(matId)) {
      this.print('아이템이 부족합니다.', 'error');
      return;
    }

    this.engine.removeMaterial(matId, 1);

    var tool = this.engine.state.tools[this._selectedToolKey];
    var partIdx = this._selectedPartIdx || 0;
    var part = tool.parts[partIdx];

    // 투입 아이템의 태그를 부품에 누적
    var tags = mat.tags || {};
    var funcs = (tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : [])).filter(Boolean);
    var elems = (tags.elements || (tags.element ? (Array.isArray(tags.element) ? tags.element : [tags.element]) : [])).filter(Boolean);
    var newTags = [].concat(funcs, elems);

    if (!part.tags) part.tags = [];
    var beforeTier = this._partTier(part);
    part.tags.push.apply(part.tags, newTags);
    var afterTier = this._partTier(part);

    this.print(part.slot + '에 태그 추가: [' + newTags.join(', ') + ']', 'success');
    this.print('  현재 태그: ' + this._partSummary(part), 'dim');
    if (afterTier > beforeTier) {
      this.print('  ★ tier 상승! t' + beforeTier + ' → t' + afterTier, 'success');
    } else {
      this.print('  tier: ' + afterTier + ' (태그 다양화)', 'dim');
    }

    // BUG FIX: compute inputTier from newTags before using it
    var inputCounts = {};
    newTags.forEach(function(t) { inputCounts[t] = (inputCounts[t]||0)+1; });
    var inputTier = Object.keys(inputCounts).length > 0
      ? Math.floor(Object.values(inputCounts).reduce(function(s,v){return s+v;},0) / Object.keys(inputCounts).length)
      : 0;

    this.print('  투입: ' + mat.name + ' (태그밀도 t' + inputTier + ')', 'dim');
    this.printBlank();
    this.updateStatus();
    this.showToolUpgrade();
  };

};
