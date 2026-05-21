'use strict';
module.exports = function (App) {

  // ============================================================
  //  SCREEN: Dungeon Preparation
  // ============================================================
  App.prototype.showDungeonPrep = function () {
    this.currentScreen = 'dungeon_prep';
    this.clearOutput();
    this.printSeparator();
    this.print('【 탐사 준비 】', 'location');
    this.printBlank();

    // Party display
    var partyUnits = this.engine.getPartyUnits();
    this.print('현재 파티:', 'system');
    if (partyUnits.length > 0) {
      partyUnits.forEach(function (u, i) {
        var koText = u.isKnockedOut ? ' [기절]' : '';
        this.print('  ' + (i + 1) + '. ' + u.name + ' (Lv.' + u.level + ' HP:' + u.hp + '/' + u.maxHp + koText + ')', 'unit');
      }.bind(this));
    } else {
      this.print('  파티에 편성된 유닛이 없습니다!', 'error');
    }
    this.printBlank();

    // Floor selection
    var maxFloor = this.engine.state.dungeon.maxFloorReached;
    var maxAvailable = Math.min(15, maxFloor + 1);
    this.print('스태미나: ' + this.engine.state.stamina + '/' + this.engine.state.maxStamina, 'system');
    this.printBlank();

    // ASCII dungeon map
    this.print('── 미궁 구조도 ──', 'lore');
    var bossFloors = [5, 10, 15];
    var zones = { 1:'석굴',2:'석굴/수계',3:'수계/독림',4:'석굴/독림/결빙',5:'석굴심부★',
      6:'석굴심부/수계',7:'기관부/독림',8:'기관부/수계/결빙',9:'독림심부/수계심부',10:'경계★',
      11:'위험/기관부',12:'경계/결빙',13:'기관부/수계심부',14:'위험/기관부',15:'위험★' };
    for (var f = maxAvailable; f >= 1; f--) {
      var isBoss = bossFloors.includes(f);
      var reached = f <= maxFloor;
      var zone = zones[f] || '???';
      var marker = isBoss ? '◆' : '│';
      var status = reached ? '  ' : '新';
      var line = '  ' + marker + ' ' + String(f).padStart(2) + 'F ' + status + ' [' + zone + ']';
      if (f <= maxAvailable) {
        this.printOption('' + f, line);
      }
    }
    this.printBlank();
    this.printOption('0', '  0. 돌아가기');
    this.printBlank();

    // Action bar with floor buttons
    var floorActions = [];
    for (var fa = 1; fa <= maxAvailable; fa++) {
      floorActions.push({ key: '' + fa, label: fa + 'F' + (bossFloors.includes(fa) ? '★' : '') });
    }
    floorActions.push({ key: '0', label: '돌아가기' });
    this.setActions(floorActions);
    this.updateStatus();
  };

  App.prototype.handleDungeonPrep = function (cmd) {
    if (cmd === '0') {
      this.showTownMenu();
      return;
    }
    var floor = parseInt(cmd);
    var maxFloor = this.engine.state.dungeon.maxFloorReached;
    var maxAvailable = Math.min(15, maxFloor + 1);

    if (isNaN(floor) || floor < 1 || floor > maxAvailable) {
      this.print('1~' + maxAvailable + ' 사이의 층 번호를 입력하세요. (0 = 돌아가기)', 'error');
      return;
    }

    var result = this.dungeon.enterDungeon(floor);
    if (!result.success) {
      this.print(result.reason, 'error');
      return;
    }

    this.print(result.message, 'success');
    this.updateStatus();
    this.showDungeonNode();
  };

  // ============================================================
  //  SCREEN: Dungeon Node
  // ============================================================
  App.prototype.showDungeonNode = function () {
    this.currentScreen = 'dungeon_node';
    this.clearOutput();
    this.printSeparator();

    var node = this.dungeon.getCurrentNode();
    var floor = this.engine.state.dungeon.currentFloor;

    if (!node) {
      this.print('노드 정보를 찾을 수 없습니다. 귀환합니다.', 'error');
      this.doRetreat();
      return;
    }

    this.print('【 미궁 ' + floor + '층 — ' + (node.zone || '구역') + ' 】', 'location');
    this.printBlank();

    // Zone description
    var desc = this.dungeon.getFloorDescription(floor);
    this.print(desc, 'description');
    this.printBlank();

    // Node info
    var typeNames = {
      entrance: '입구', exit: '출구', combat: '전투 구역',
      collect: '채집 구역', rest: '휴식처', chest: '보물 상자',
      event: '이벤트', boss: '보스 구역'
    };
    this.print('현재 노드: ' + (node.name || node.id) + ' (' + (typeNames[node.type] || node.type) + ')', 'system');
    this.printBlank();

    // ASCII mini-map of current floor
    var floorNodes = this.dungeon.getFloorNodes(floor);
    if (floorNodes.length > 0) {
      var typeIcons = { entrance:'입', exit:'출', combat:'⚔', collect:'♦', rest:'♥', chest:'★', event:'?', boss:'◆' };
      var typeNamesMap = { entrance:'입구', exit:'출구', combat:'전투', collect:'채집', rest:'휴식', chest:'상자', event:'이벤트', boss:'보스' };

      // BFS from entrance to build order
      var visited = new Set();
      var queue = [floorNodes.find(function (n) { return n.type === 'entrance'; })].filter(Boolean);
      var displayed = [];
      while (queue.length > 0) {
        var n = queue.shift();
        if (!n || visited.has(n.id)) continue;
        visited.add(n.id);
        displayed.push(n);
        var connections = n.connections || [];
        for (var ci = 0; ci < connections.length; ci++) {
          var connId = connections[ci];
          var conn = floorNodes.find(function (fn) { return fn.id === connId; });
          if (conn && !visited.has(conn.id)) queue.push(conn);
        }
      }

      // Render each node as a line (vertical map)
      this.print('  ┌─ 층 구조도 ─┐', 'dim');
      for (var di = 0; di < displayed.length; di++) {
        var dn = displayed[di];
        var icon = typeIcons[dn.type] || '○';
        var isCurrent = dn.id === node.id;
        var zoneLabel = dn.zone ? '' + dn.zone : '';
        var typeName = typeNamesMap[dn.type] || dn.type;
        var label = zoneLabel ? typeName + '/' + zoneLabel : typeName;

        // Connections indicator
        var connCount = (dn.connections || []).length;
        var branch = connCount > 2 ? '╠' : '│';

        if (isCurrent) {
          this.print('  ' + branch + ' ▶ [' + icon + ' ' + label + '] ◀ 현재', 'system');
        } else {
          this.print('  ' + branch + '   ' + icon + ' ' + label, 'dim');
        }

        // Draw connector to next
        if (di < displayed.length - 1) {
          var nextConn = (dn.connections || []).filter(function (c) {
            var idx = displayed.findIndex(function (d) { return d.id === c; });
            return idx > di;
          });
          if (nextConn.length > 1) {
            this.print('  ├───┬───┤', 'dim');
          } else {
            this.print('  │', 'dim');
          }
        }
      }
      this.print('  └───────────┘', 'dim');
      this.printBlank();
    }

    // Connected nodes
    var connected = this.dungeon.getConnectedNodes();
    if (connected.length > 0) {
      this.print('이동 가능한 노드:', 'system');
      connected.forEach(function (n, i) {
        var nType = typeNames[n.type] || n.type;
        this.printOption('' + (i + 1), '  ' + (i + 1) + '. ' + (n.name || n.id) + ' [' + nType + ']');
      }.bind(this));
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
    var actions = [];
    connected.forEach(function (n, i) {
      var nType = typeNames[n.type] || n.type;
      actions.push({key: '' + (i + 1), label: n.id + ' [' + nType + ']'});
    });
    if (node.type === 'exit') actions.push({key:'d', label:'다음 층'});
    if (node.type === 'collect') actions.push({key:'c', label:'채집'});
    if (node.type === 'rest') actions.push({key:'h', label:'휴식'});
    if (node.type === 'chest') actions.push({key:'o', label:'상자'});
    actions.push({key:'r', label:'귀환'});
    this.setActions(actions);

    this.updateStatus();
  };

  App.prototype.handleDungeonNode = function (cmd) {
    var lowerCmd = cmd.toLowerCase();

    // Retreat
    if (lowerCmd === 'r') {
      this.doRetreat();
      return;
    }

    // Descend (exit node only)
    if (lowerCmd === 'd') {
      var currentNode = this.dungeon.getCurrentNode();
      if (!currentNode || currentNode.type !== 'exit') {
        this.print('여기서는 내려갈 수 없습니다.', 'error');
        return;
      }
      var result = this.dungeon.moveToNextFloor();
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
      var currentNodeC = this.dungeon.getCurrentNode();
      if (!currentNodeC || currentNodeC.type !== 'collect') {
        this.print('여기서는 채집할 수 없습니다.', 'error');
        return;
      }
      var collectibles = this.dungeon.getCollectibles(currentNodeC);
      if (collectibles.length === 0) {
        this.print('채집할 수 있는 것이 없다.', 'dim');
        return;
      }
      var collectResult = this.dungeon.collectMaterials(collectibles);
      if (!collectResult.success) {
        this.print(collectResult.reason, 'error');
        return;
      }
      this.print('【 채집 】 (스태미나 -1)', 'system');
      for (var ci = 0; ci < collectResult.items.length; ci++) {
        var item = collectResult.items[ci];
        this.print('  ▸ ' + item.name + ' ×' + item.qty, 'success');
      }
      this.printBlank();
      this.updateStatus();
      return;
    }

    // Rest / Heal
    if (lowerCmd === 'h') {
      var currentNodeH = this.dungeon.getCurrentNode();
      if (!currentNodeH || currentNodeH.type !== 'rest') {
        this.print('여기서는 휴식할 수 없습니다.', 'error');
        return;
      }
      var healed = this.dungeon.restAtNode();
      if (healed.length > 0) {
        this.print('휴식을 취했다.', 'success');
        for (var hi = 0; hi < healed.length; hi++) {
          var h = healed[hi];
          this.print('  ' + h.name + ': HP +' + h.healed, 'heal');
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
      var currentNodeO = this.dungeon.getCurrentNode();
      if (!currentNodeO || currentNodeO.type !== 'chest') {
        this.print('여기에 상자가 없습니다.', 'error');
        return;
      }
      if (!this.engine.useStamina(1)) {
        this.print('스태미나가 부족합니다.', 'error');
        return;
      }
      var chest = this.dungeon.openChest(currentNodeO);
      this.print('【 상자 】 (스태미나 -1)', 'system');
      if (chest.loot) {
        for (var li = 0; li < chest.loot.length; li++) {
          var lootItem = chest.loot[li];
          this.print('  ▸ ' + lootItem.name + ' ×' + lootItem.qty, 'success');
        }
      }
      this.printBlank();
      this.updateStatus();
      return;
    }

    // Move to connected node (number input)
    var idx = parseInt(cmd);
    var connected = this.dungeon.getConnectedNodes();
    if (isNaN(idx) || idx < 1 || idx > connected.length) {
      this.print('올바른 번호 또는 명령어를 입력하세요.', 'error');
      return;
    }

    var targetNode = connected[idx - 1];
    var moveResult = this.dungeon.moveToNode(targetNode.id);

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
      var self = this;
      var origHandler = this.handleDungeonNode.bind(this);
      this.handleDungeonNode = function (_c) {
        self.handleDungeonNode = origHandler;
        self.showDungeonNode();
      };
      return;
    }

    // Normal move — show the new node
    this.showDungeonNode();
  };

  App.prototype.doRetreat = function () {
    var result = this.dungeon.retreat();
    this.clearOutput();
    this.printSeparator();
    this.print(result.message, 'success');
    this.printBlank();
    if (result.collected && result.collected.length > 0) {
      this.print('이번 탐사에서 수집한 재료:', 'system');
      for (var i = 0; i < result.collected.length; i++) {
        var item = result.collected[i];
        this.print('  ' + item.name + ' x' + item.qty, 'dim');
      }
      this.printBlank();
    }
    this.printOption('1', '  [마을로 돌아가기]');
    this.currentScreen = 'advance_day';
    var self = this;
    this.handleAdvanceDay = function (_c) {
      self.handleAdvanceDay = App.prototype.handleAdvanceDay.bind(self);
      self.updateStatus();
      self.showTownMenu();
    };
  };

  // ============================================================
  //  SCREEN: Encounter (unit meeting in dungeon)
  // ============================================================
  App.prototype.showEncounter = function () {
    this.currentScreen = 'encounter';
    this.clearOutput();
    this.printSeparator();
    this.print('【 조우 】', 'location');
    this.printBlank();

    var enc = this._encounter;
    if (!enc || !enc.unitDef) {
      this.print('알 수 없는 조우입니다.', 'error');
      this.showDungeonNode();
      return;
    }

    var ud = enc.unitDef;
    this.print(ud.name + '이(가) 나타났다!', 'unit');
    this.print('  Lv.' + ud.level + '  인: ' + ud.sigilName + '  원소: ' + (ud.primaryElement || '없음') + '  분류: ' + ud.category, 'dim');
    if (ud.personalityTraits && ud.personalityTraits.length > 0) {
      var names = ud.personalityTraits.map(function (t) { return typeof t === 'object' ? t.name : t; }).filter(Boolean);
      if (names.length > 0) this.print('  성향: ' + names.join(', '), 'dim');
    }
    this.printBlank();
    this.printOption('1', '  1. 대화 (교섭)');
    this.printOption('2', '  2. 전투');
    this.printOption('3', '  3. 도주');
    this.printBlank();
    this.setActions([
      {key:'1', label:'대화(교섭)'}, {key:'2', label:'전투'}, {key:'3', label:'도주'}
    ]);
  };

  App.prototype.handleEncounter = function (cmd) {
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
  };

  App.prototype.doNegotiation = function () {
    var enc = this._encounter;
    if (!enc || !enc.unitDef) return;

    this._negotiationAttempt++;
    var result = this.dungeon.attemptNegotiation(enc.unitDef, null);

    this.printBlank();
    this.print('교섭 시도... (성공률: ' + result.chance + '%)', 'system');
    this.printBlank();

    if (result.success) {
      // Recruit!
      var instance = this.dungeon.recruitUnit(enc.unitDef);
      if (this.engine.state.tutorial) this.engine.state.tutorial.firstRecruitment = true;
      this.print(enc.unitDef.name + '이(가) 동료가 되었다!', 'success');
      this.print('  인: ' + instance.sigilName + ' | Lv.' + instance.level + ' | ' + instance.category, 'unit');
      this.printBlank();

      // Check if party has room
      var partySize = this.engine.state.party.length;
      var maxParty = this.engine.state.maxPartySize;
      if (partySize < maxParty) {
        this.print('파티에 빈 자리가 있다. (' + partySize + '/' + maxParty + ')', 'system');
        this.printOption('1', '  1. 파티에 편입');
        this.printOption('2', '  2. 공방으로 송환');
        this.printBlank();
        this._recruitedInstance = instance;
        this.currentScreen = 'recruit_choice';
      } else {
        this.print('파티가 가득 차 있어 공방으로 송환된다. (' + partySize + '/' + maxParty + ')', 'dim');
        this.printBlank();
        this.printOption('1', '  [계속]');
        this.currentScreen = 'dungeon_node';
        var self = this;
        var origHandler = this.handleDungeonNode.bind(this);
        this.handleDungeonNode = function (_c) {
          self.handleDungeonNode = origHandler;
          self.updateStatus();
          self.showDungeonNode();
        };
      }
    } else {
      // Failure
      var failResult = this.dungeon.handleNegotiationFailure(enc.unitDef, this._negotiationAttempt);
      this.print(failResult.message, 'error');
      this.printBlank();

      if (failResult.result === 'fight') {
        this.print('전투가 시작된다!', 'combat');
        this.printBlank();
        this.printOption('1', '  [전투 시작]');
        this.currentScreen = 'encounter';
        var self2 = this;
        var origEncHandler = this.handleEncounter.bind(this);
        this.handleEncounter = function (_c) {
          self2.handleEncounter = origEncHandler;
          self2.startCombatFromEncounter();
        };
      } else if (failResult.result === 'flee') {
        this.printOption('1', '  [계속]');
        this.currentScreen = 'dungeon_node';
        var self3 = this;
        var origHandler2 = this.handleDungeonNode.bind(this);
        this.handleDungeonNode = function (_c) {
          self3.handleDungeonNode = origHandler2;
          self3.showDungeonNode();
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
        var self4 = this;
        var origHandler3 = this.handleDungeonNode.bind(this);
        this.handleDungeonNode = function (_c) {
          self4.handleDungeonNode = origHandler3;
          self4.showDungeonNode();
        };
      }
    }
  };

  App.prototype.doEncounterFlee = function () {
    this.printBlank();
    if (Math.random() < 0.7) {
      this.print('빠르게 뒤로 물러선다. 도주 성공!', 'success');
      this.printBlank();
      this.printOption('1', '  [계속]');
      this.currentScreen = 'dungeon_node';
      var self = this;
      var origHandler = this.handleDungeonNode.bind(this);
      this.handleDungeonNode = function (_c) {
        self.handleDungeonNode = origHandler;
        self.showDungeonNode();
      };
    } else {
      this.print('도주에 실패했다! 전투가 시작된다!', 'combat');
      this.printBlank();
      this.printOption('1', '  [전투 시작]');
      this.currentScreen = 'encounter';
      var self2 = this;
      var origEncHandler = this.handleEncounter.bind(this);
      this.handleEncounter = function (_c) {
        self2.handleEncounter = origEncHandler;
        self2.startCombatFromEncounter();
      };
    }
  };

  // ============================================================
  //  SCREEN: Combat
  // ============================================================
  App.prototype.handleRecruitChoice = function (cmd) {
    var n = parseInt(cmd);
    var instance = this._recruitedInstance;
    if (!instance) { this.showDungeonNode(); return; }

    if (n === 1) {
      // 파티 편입
      this.engine.state.party.push(instance.instanceId);
      this.print(instance.name + '이(가) 파티에 합류했다!', 'success');
    } else {
      this.print(instance.name + '은(는) 공방으로 보내졌다.', 'dim');
    }
    this._recruitedInstance = null;
    this.printBlank();
    this.updateStatus();
    this.showDungeonNode();
  };

  App.prototype.startCombatFromEncounter = function () {
    var enc = this._encounter;
    if (!enc) {
      this.print('조우 정보가 없습니다.', 'error');
      this.showDungeonNode();
      return;
    }

    // Commander system: only units fight. Player commands.
    var partyInstances = this.engine.getPartyUnits().filter(function (u) { return !u.isKnockedOut; });
    if (partyInstances.length === 0) {
      this.print('전투 가능한 유닛이 없다! 귀환해야 한다.', 'error');
      this.dungeon.retreat();
      this.showTownMenu();
      return;
    }

    this.combat.startBattle(partyInstances, enc.enemies);
    this.showCombatScreen();
  };

  App.prototype.showCombatScreen = function () {
    this.currentScreen = 'combat';
    this.clearOutput();
    this.printSeparator();
    this.print('【 전투 】', 'combat');
    this.printBlank();

    var bs = this.combat.battleState;

    // Commander status
    this.print('☆ ' + this.engine.state.player.name + ' [지휘 중]', 'system');
    this.printBlank();
    // Show ally/enemy HP
    this.print('— 아군 유닛 —', 'system');
    for (var ai = 0; ai < bs.allies.length; ai++) {
      var u = bs.allies[ai];
      var koText = u.isKO ? ' [기절]' : '';
      this.print('  ' + u.name + ' HP:' + Math.max(0, u.hp) + '/' + u.maxHp + koText, 'unit');
    }
    this.printBlank();
    this.print('— 적 —', 'system');
    for (var ei = 0; ei < bs.enemies.length; ei++) {
      var e = bs.enemies[ei];
      var eKoText = e.isKO ? ' [기절]' : '';
      this.print('  ' + e.name + ' HP:' + Math.max(0, e.hp) + '/' + e.maxHp + eKoText, 'danger');
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
  };

  App.prototype.handleCombat = function (cmd) {
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
  };

  App.prototype.executeCombatRound = function () {
    var roundResult = this.combat.executeRound();

    this.printBlank();
    for (var li = 0; li < roundResult.log.length; li++) {
      var entry = roundResult.log[li];
      var cls = 'dim';
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
      var bs = this.combat.battleState;
      this.print('— 아군 —', 'system');
      for (var ai = 0; ai < bs.allies.length; ai++) {
        var u = bs.allies[ai];
        if (!u.isKO) this.print('  ' + u.name + ' HP:' + u.hp + '/' + u.maxHp, 'unit');
      }
      this.print('— 적 —', 'system');
      for (var ei = 0; ei < bs.enemies.length; ei++) {
        var e = bs.enemies[ei];
        if (!e.isKO) this.print('  ' + e.name + ' HP:' + e.hp + '/' + e.maxHp, 'danger');
      }
      this.printBlank();
      this.printOption('1', '  1. 다음 라운드 (계속)');
      this.printOption('2', '  2. 아이템 사용');
      this.printOption('3', '  3. 도주');
      this.printBlank();
    }
    this.updateStatus();
  };

  App.prototype.doCombatItem = function () {
    // List usable items (전투 중: 물약만. 식량은 전투 중 사용 불가)
    var inv = this.engine.state.inventory;
    var usableItems = [];
    var matEntries = Object.entries(inv);
    for (var mi = 0; mi < matEntries.length; mi++) {
      var matId = matEntries[mi][0];
      var qty = matEntries[mi][1];
      if (qty <= 0) continue;
      if (matId.startsWith('MAT_')) continue;
      var mat = this.engine.data.materials.find(function (m) { return m.id === matId; });
      if (!mat) continue;
      if (mat.category === 'consumable_food') continue; // 식량은 전투 중 사용 불가
      if (mat.effect && (mat.effect.type === 'heal' || mat.effect.type === 'damage' || mat.effect.type === 'debuff')) {
        usableItems.push({ id: matId, name: mat.name, qty: qty, effect: mat.effect });
      }
    }

    if (usableItems.length === 0) {
      this.print('사용 가능한 아이템이 없습니다. (물약/독물약을 만들어오세요. 식량은 전투 밖에서만 사용 가능)', 'dim');
      return;
    }

    this.print('사용 가능한 아이템:', 'system');
    for (var ui = 0; ui < usableItems.length; ui++) {
      var uItem = usableItems[ui];
      this.printOption('' + (ui + 1), '  ' + (ui + 1) + '. ' + uItem.name + ' x' + uItem.qty + ' — ' + uItem.effect.desc);
    }
    this.printOption('0', '  0. 취소');
    this.printBlank();

    // Temporarily override handler for item selection
    this._combatItems = usableItems;
    var self = this;
    var origHandler = this.handleCombat.bind(this);
    this.handleCombat = function (c) {
      self.handleCombat = origHandler;
      if (c === '0') {
        self.print('취소했습니다.', 'dim');
        return;
      }
      var idx = parseInt(c);
      if (isNaN(idx) || idx < 1 || idx > self._combatItems.length) {
        self.print('올바른 번호를 입력하세요.', 'error');
        return;
      }
      var selected = self._combatItems[idx - 1];
      self.engine.removeMaterial(selected.id, 1);

      if (selected.effect.type === 'heal') {
        // Heal lowest HP ally
        var allies = self.combat.battleState.allies.filter(function (u) { return !u.isKO; });
        var target = allies.reduce(function (min, u) { return u.hp < min.hp ? u : min; }, allies[0]);
        if (target) {
          target.hp = Math.min(target.maxHp, target.hp + selected.effect.value);
          self.print(target.name + '의 HP가 ' + selected.effect.value + ' 회복되었다!', 'heal');
        }
      } else if (selected.effect.type === 'damage') {
        // Damage first alive enemy
        var enemies = self.combat.battleState.enemies.filter(function (u) { return !u.isKO; });
        if (enemies.length > 0) {
          var target2 = enemies[0];
          target2.hp = Math.max(0, target2.hp - selected.effect.value);
          self.print(target2.name + '에게 ' + selected.effect.value + ' 데미지!', 'combat');
          if (target2.hp <= 0) {
            target2.isKO = true;
            self.print(target2.name + '이(가) 쓰러졌다!', 'combat');
          }
        }
      }
      self.updateStatus();
    };
  };

  App.prototype.doCombatFlee = function () {
    var partyUnits = this.engine.getPartyUnits().filter(function (u) { return !u.isKnockedOut; });
    var partySpeed = partyUnits.reduce(function (sum, u) { return sum + u.spd; }, this.engine.state.player.spd) /
      (partyUnits.length + 1);

    var success = this.combat.attemptFlee(partySpeed);

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
  };

  App.prototype.showCombatEnd = function () {
    this.currentScreen = 'combat_result';
    var bs = this.combat.battleState;
    var won = bs.result === 'win';
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
    var results = this.combat.applyBattleResults();
    if (results) {
      if (results.won) {
        if (results.drops.length > 0) {
          this.print('획득 아이템:', 'system');
          for (var di = 0; di < results.drops.length; di++) {
            var drop = results.drops[di];
            this.print('  ▸ ' + drop.name + ' ×' + drop.qty, 'lore');
          }
        }
        if (results.expGained > 0) {
          this.print('전투 경험치: +' + Math.floor(results.expGained), 'success');
        }
        if (results.levelUps && results.levelUps.length > 0) {
          for (var lui = 0; lui < results.levelUps.length; lui++) {
            var lu = results.levelUps[lui];
            this.print('  ★ ' + lu.name + ' 레벨 업! → Lv.' + lu.newLevel, 'success');
          }
        }

        // Boss milestone check
        var enemies = bs.enemies || [];
        var defeatedBoss = enemies.find(function (e) { return e.isBoss; });
        if (defeatedBoss) {
          var floor = this.engine.state.dungeon.currentFloor;
          this.printBlank();
          this.print('★ 보스 격파! (' + floor + '층)', 'lore');

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
          var rewards = this.engine.checkMilestones();
          for (var ri = 0; ri < rewards.length; ri++) {
            this.print('  ★ ' + rewards[ri], 'success');
          }
        }
      }
    }

    // Show player injury on loss
    if (results && results.playerInjury) {
      this.printBlank();
      var p = this.engine.state.player;
      this.print('연금술사 부상: HP -' + results.playerInjury + ' (잔여 HP: ' + p.hp + '/' + p.maxHp + ')', 'error');
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
  };

  App.prototype.handleCombatResult = function (_cmd) {
    var bs = this.combat.battleState;
    if (bs && bs.result === 'lose') {
      // Wipe
      var wipeResult = this.dungeon.handleWipe();
      this.clearOutput();
      this.printSeparator();
      this.print('의식을 잃고 도시로 강제 귀환되었다...', 'danger');
      this.printBlank();
      this.print(wipeResult.message, 'system');
      if (wipeResult.lost && wipeResult.lost.length > 0) {
        this.print('잃어버린 재료:', 'error');
        for (var li = 0; li < wipeResult.lost.length; li++) {
          var item = wipeResult.lost[li];
          this.print('  ' + item.name + ' x' + item.qty, 'dim');
        }
      }
      this.printBlank();
      this.updateStatus();

      // Check bankruptcy
      var bankCheck = this.economy.checkBankruptcy();
      if (bankCheck.bankrupt) {
        this.showEndGame(false);
        return;
      }

      this.showTownMenu();
    } else {
      // Won or fled — return to dungeon
      this.showDungeonNode();
    }
  };

};
