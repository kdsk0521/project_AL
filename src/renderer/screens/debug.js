'use strict';

// Debug Commands — /help, /soul, /mat, etc.
module.exports = function (App) {

  App.prototype.handleDebug = function (cmd) {
    const parts = cmd.substring(1).split(' ');
    const action = parts[0];
    const arg1 = parts[1];
    const arg2 = parts[2];

    switch (action) {
      case 'help':
        this.print('── 디버그 명령어 ──', 'system');
        this.print('  /soul [양]       — 영혼력 추가 (기본 1000)', 'dim');
        this.print('  /mat [ID] [양]   — 재료 추가 (예: /mat MAT_HERB 10)', 'dim');
        this.print('  /matall [양]     — 기초 재료 7종 전부 추가', 'dim');
        this.print('  /stamina [양]    — 스태미나 추가 (기본 30)', 'dim');
        this.print('  /hp [양]         — 연금술사 HP 전회복', 'dim');
        this.print('  /healall         — 전 유닛 HP 전회복 + 기절 해제', 'dim');
        this.print('  /level [양]      — 선택 유닛 레벨업 (유닛관리에서)', 'dim');
        this.print('  /party [크기]    — 파티 최대 크기 변경', 'dim');
        this.print('  /floor [층]      — 최대 도달 층수 설정', 'dim');
        this.print('  /unit [ID]       — 유닛 즉시 획득', 'dim');
        this.print('  /items           — 전체 재료 목록 표시', 'dim');
        this.print('  /units           — 전체 유닛 ID 목록 표시', 'dim');
        this.print('  /god             — 갓모드 (재료+영혼력+스태미나 대량)', 'dim');
        this.print('  /title           — 타이틀 화면으로 돌아가기', 'dim');
        break;

      case 'soul': {
        const soulAmt = parseInt(arg1) || 1000;
        this.engine.state.soulPower += soulAmt;
        this.print('영혼력 +' + soulAmt + ' (현재: ' + this.engine.state.soulPower + ')', 'success');
        break;
      }

      case 'mat':
        if (!arg1) { this.print('사용법: /mat [재료ID] [수량]', 'error'); break; }
        { const matQty = parseInt(arg2) || 5;
        this.engine.addMaterial(arg1, matQty);
        this.print(this.engine.getMaterialName(arg1) + ' +' + matQty, 'success'); }
        break;

      case 'matall': {
        const qty = parseInt(arg1) || 20;
        const basics = ['MAT_HERB','MAT_CATALYST_HERB','MAT_IRON_ORE','MAT_MAGIC_STONE','MAT_POISON_FISH','MAT_WATER','MAT_SLIME_CORE'];
        for (const m of basics) this.engine.addMaterial(m, qty);
        this.print('기초 재료 7종 각 +' + qty, 'success');
        break;
      }

      case 'stamina': {
        const stamAmt = parseInt(arg1) || 30;
        this.engine.state.stamina = Math.min(this.engine.state.maxStamina, this.engine.state.stamina + stamAmt);
        this.print('스태미나 → ' + this.engine.state.stamina + '/' + this.engine.state.maxStamina, 'success');
        break;
      }

      case 'hp':
        this.engine.state.player.hp = this.engine.state.player.maxHp;
        this.engine.state.player.recoveryDays = 0;
        this.print('연금술사 HP 전회복 (' + this.engine.state.player.hp + '/' + this.engine.state.player.maxHp + ')', 'success');
        break;

      case 'healall':
        for (const u of this.engine.state.ownedUnits) {
          u.hp = u.maxHp;
          u.isKnockedOut = false;
          u.recoveryDays = 0;
        }
        this.print('전 유닛 HP 전회복 + 기절 해제', 'success');
        break;

      case 'level':
        if (this._selectedUnitId) {
          const unit = this.engine.getUnitInstance(this._selectedUnitId);
          if (unit) {
            const times = parseInt(arg1) || 1;
            for (let i = 0; i < times; i++) {
              unit.exp.combat += unit.level * 100;
              const g = {
                '요괴':{hp:5,atk:3,def:2,spd:2},'정령':{hp:5,atk:2,def:2,spd:2},
                '인조':{hp:6,atk:2,def:3,spd:1},'야수':{hp:4,atk:2,def:1,spd:3},
                '환상':{hp:3,atk:2,def:2,spd:2}
              };
              const gr = g[unit.category] || g['정령'];
              unit.level++;
              unit.maxHp += gr.hp; unit.hp = unit.maxHp;
              unit.atk += gr.atk; unit.def += gr.def; unit.spd += gr.spd;
            }
            this.print(unit.name + ' → Lv.' + unit.level + ' (ATK:' + unit.atk + ' DEF:' + unit.def + ' SPD:' + unit.spd + ')', 'success');
          }
        } else {
          this.print('유닛 관리에서 유닛을 선택한 상태에서 사용하세요.', 'error');
        }
        break;

      case 'party': {
        const newSize = parseInt(arg1) || 5;
        this.engine.state.maxPartySize = newSize;
        this.print('파티 최대 크기 → ' + newSize, 'success');
        break;
      }

      case 'floor': {
        const floorNum = parseInt(arg1) || 15;
        this.engine.state.dungeon.maxFloorReached = floorNum;
        this.print('최대 도달 층수 → ' + floorNum, 'success');
        break;
      }

      case 'unit':
        if (!arg1) { this.print('사용법: /unit [유닛ID]  (예: /unit UNIT_THORN_IMP)', 'error'); break; }
        { const unitDef = this.engine.getUnitDef(arg1);
        if (!unitDef) { this.print('유닛 "' + arg1 + '" 을(를) 찾을 수 없습니다.', 'error'); break; }
        const inst = this.engine.createUnitInstance(unitDef);
        this.engine.state.ownedUnits.push(inst);
        if (!this.engine.state.compendium.registered.includes(arg1)) {
          this.engine.state.compendium.registered.push(arg1);
        }
        this.print(unitDef.name + ' Lv.' + unitDef.level + ' 획득!', 'success'); }
        break;

      case 'items':
        this.print('── 전체 재료 ID ──', 'system');
        this.engine.data.materials.forEach(m => this.print('  ' + m.id + ' — ' + m.name, 'dim'));
        break;

      case 'units':
        this.print('── 전체 유닛 ID (일부) ──', 'system');
        this.engine.data.units.slice(0, 20).forEach(u =>
          this.print('  ' + u.id + ' — ' + u.name + ' Lv.' + u.level + ' 인:' + u.sigilName, 'dim')
        );
        this.print('  ... 외 ' + (this.engine.data.units.length - 20) + '체', 'dim');
        break;

      case 'god': {
        this.engine.state.soulPower += 9999;
        this.engine.state.stamina = this.engine.state.maxStamina;
        this.engine.state.player.hp = this.engine.state.player.maxHp;
        this.engine.state.player.recoveryDays = 0;
        const allMats = ['MAT_HERB','MAT_CATALYST_HERB','MAT_IRON_ORE','MAT_MAGIC_STONE','MAT_POISON_FISH','MAT_WATER','MAT_SLIME_CORE','MAT_SPRING'];
        for (const m of allMats) this.engine.addMaterial(m, 99);
        for (const u of this.engine.state.ownedUnits) {
          u.hp = u.maxHp; u.isKnockedOut = false; u.recoveryDays = 0;
        }
        this.engine.state.maxPartySize = 5;
        this.engine.state.dungeon.maxFloorReached = 15;
        this.print('★ GOD MODE ★ 영혼력+9999, 재료 99개, 전회복, 파티5인, 15층 해금', 'success');
        break;
      }

      case 'title':
        this.engine.autoSave();
        this.print('자동 저장 후 타이틀로 돌아갑니다...', 'system');
        setTimeout(() => this.showMainMenu(), 500);
        break;

      default:
        this.print('알 수 없는 디버그 명령: ' + action + '. /help로 목록 확인.', 'error');
        break;
    }
    this.updateStatus();
  };
};
