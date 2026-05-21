'use strict';
module.exports = function (App) {

  // ═══ Training Dashboard Renderer ═══

  App.prototype._renderTrainingDashboard = function (unit, resultMsg = null) {
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

    // Description (result message or default) — 가변 높이 대사창
    const descEl = document.getElementById('td-desc');
    descEl.textContent = resultMsg || `${unit.name}이(가) 당신을 바라보고 있다.`;
    descEl.scrollTop = descEl.scrollHeight; // 자동 스크롤

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
  };

  App.prototype._closeTrainingDashboard = function () {
    document.getElementById('training-dashboard').classList.remove('active');
    document.getElementById('main-area').style.display = '';
    this.showTrainingMenu();
  };

  // ============================================================
  //  SCREEN: Training Facility (조교소)
  // ============================================================

  App.prototype.showTrainingFacility = function () {
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
  };

  App.prototype.handleTrainingSelect = function (cmd) {
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
  };

  App.prototype.showTrainingMenu = function () {
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
  };

  App.prototype.handleTrainingMenu = function (cmd) {
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
  };

  // ERA-style single screen: stats + body parts + actions all visible
  App.prototype.showTrainingScreen = function () {
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
  };

  // ERA식 handler: 번호만 입력
  App.prototype.handleTrainingAction = function (cmd) {
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

    if (!this.engine.useStamina(1)) {
      this._renderTrainingDashboard(unit, '⚠ 스태미나가 부족합니다!');
      return;
    }

    // Execute (ERA식: actionId만 전달)
    const result = this.training.execute(unit, actionId, hasTool);

    // 결과 메시지 조립 (줄바꿈 형식 — 대사창 가변 높이 활용)
    const lines = [];
    lines.push(`▸ ${action.name}`);
    if (result.partResults && result.partResults.length > 0) {
      lines.push(`  감도: ${result.partResults.map(pr => `${pr.partName}+${pr.gain}`).join('  ')}`);
    }
    const changes = [];
    if (result.lewdGain) changes.push(`음란+${result.lewdGain}`);
    if (result.submissionGain > 0) changes.push(`복종+${result.submissionGain}`);
    if (result.submissionGain < 0) changes.push(`복종${result.submissionGain}`);
    if (result.fearGain) changes.push(`공포+${result.fearGain}`);
    if (result.resentGain) changes.push(`반감+${result.resentGain}`);
    if (result.loveGain) changes.push(`연모+${result.loveGain}`);
    if (changes.length) lines.push(`  ${changes.join('  ')}`);
    // 반복 페널티/전환 보너스 표시
    if (result.repeatMul !== 1.0) {
      const mulPct = Math.round(result.repeatMul * 100);
      const mulColor = result.repeatMul > 1.0 ? '전환↑' : '반복↓';
      lines.push(`  [${mulColor} 효율 ${mulPct}%]`);
    }
    for (const text of result.extraText) lines.push(`▸ ${text}`);
    if (result.leveled) lines.push(`★ 레벨 업! → Lv.${result.leveled.newLevel}`);
    // 대시보드 갱신 (여러 줄 결과 메시지)
    this._renderTrainingDashboard(unit, lines.join('\n'));
    document.getElementById('td-input').focus();
  };

  // Keep old method names as redirects
  App.prototype.showTrainingParts = function () { this.showTrainingScreen(); };
  App.prototype.handleTrainingPart = function (cmd) { this.handleTrainingAction(cmd); };
  App.prototype.PARTS_IDX = function (parts, p) { return parts.indexOf(p) + 1; };

};
