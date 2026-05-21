'use strict';
module.exports = function (App) {
  // ============================================================
  //  SCREEN: Compendium (전서)
  // ============================================================
  App.prototype.showCompendium = function () {
    this.currentScreen = 'compendium';
    this.clearOutput();
    this.printSeparator();
    this.print('【 전서 — 유닛 등록소 】', 'location');
    this.printBlank();
    this.print('전서를 통해 영혼력으로 유닛을 소환할 수 있다.', 'description');
    this.print(`현재 영혼력: ${this.engine.state.soulPower}`, 'system');
    this.printBlank();

    // Build compendium pool
    const pool = [
      ...this.engine.state.compendium.basicPool,
      ...this.engine.state.compendium.registered
    ];
    const uniquePool = [...new Set(pool)];
    this._compendiumList = [];

    this.print('  등록된 유닛:', 'system');
    uniquePool.forEach((unitId, i) => {
      const ud = this.engine.getUnitDef(unitId);
      if (ud) {
        const price = ud.level * 15;
        const canBuy = this.engine.state.soulPower >= price;
        this._compendiumList.push(unitId);
        if (canBuy) {
          this.printOption(`${i + 1}`,
            `  ${i + 1}. ${ud.name} Lv.${ud.level} | 인:${ud.sigilName} | 가격: ${price} 영혼력`
          );
        } else {
          this.print(
            `  ${i + 1}. ${ud.name} Lv.${ud.level} | 인:${ud.sigilName} | 가격: ${price} 영혼력 [부족]`,
            'dim'
          );
        }
      }
    });

    this.printBlank();
    this.print('소환할 유닛 번호를 입력하세요. (0 = 돌아가기)', 'dim');
    this.printBlank();
    this.setActions([{key:'0', label:'돌아가기'}]);
    this.updateStatus();
  };

  App.prototype.handleCompendium = function (cmd) {
    if (cmd === '0') {
      this.showTownMenu();
      return;
    }
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || idx > this._compendiumList.length) {
      this.print('올바른 번호를 입력하세요.', 'error');
      return;
    }

    const unitId = this._compendiumList[idx - 1];
    const result = this.unit.buyFromCompendium(unitId);
    this.printBlank();

    if (result.success) {
      this.print(result.message, 'success');
      this.print(`  ${result.unit.name} Lv.${result.unit.level} | 인:${result.unit.sigilName}`, 'unit');
    } else {
      this.print(result.reason, 'error');
    }
    this.printBlank();
    this.updateStatus();

    // Refresh compendium
    this.showCompendium();
  };

  // ============================================================
  //  SCREEN: Inventory
  // ============================================================
  App.prototype.showInventory = function (tab) {
    if (tab === undefined) tab = 'raw';
    this.currentScreen = 'inventory';
    this._invTab = tab;
    this.clearOutput();
    this.printSeparator();
    this.print('【 인벤토리 】', 'location');
    this.printBlank();

    // 탭 표시
    const tabs = [
      { key: 'r', id: 'raw', name: '원재료' },
      { key: 'p', id: 'processed', name: '가공품' },
      { key: 'c', id: 'crafted', name: '제작품' },
      { key: 'e', id: 'equip', name: '장비/도구' }
    ];
    const tabLine = tabs.map(t =>
      t.id === tab ? `【${t.name}】` : `  ${t.name}  `
    ).join('|');
    this.print(`  ${tabLine}`, 'system');
    this.printBlank();

    // 아이템 분류
    const inv = this.engine.state.inventory;
    const allItems = Object.keys(inv).filter(id => inv[id] > 0).map(id => {
      const mat = this.engine.data.materials.find(m => m.id === id);
      return { id, name: (mat && mat.name) || id, qty: inv[id], mat };
    });

    let filtered;
    switch (tab) {
      case 'raw':
        filtered = allItems.filter(i => i.id.startsWith('MAT_') && !i.id.includes('_FIRED') && !i.id.includes('_CRUSHED') && !i.id.includes('_COMPRESSED'));
        break;
      case 'processed':
        filtered = allItems.filter(i => i.id.includes('_FIRED') || i.id.includes('_CRUSHED') || i.id.includes('_COMPRESSED') || i.id.startsWith('CRAFT_'));
        break;
      case 'crafted':
        filtered = allItems.filter(i => i.id.startsWith('ITEM_') && !['equipment_weapon','equipment_armor','equipment_accessory','tool_training','tool_crafting'].includes(i.mat?.category));
        break;
      case 'equip':
        filtered = allItems.filter(i => i.mat && ['equipment_weapon','equipment_armor','equipment_accessory','tool_training','tool_crafting'].includes(i.mat.category));
        break;
      default:
        filtered = allItems;
    }

    this._inventoryItems = filtered;

    if (filtered.length === 0) {
      this.print('  (없음)', 'dim');
    } else {
      filtered.forEach((item, i) => {
        const mat = item.mat;
        let info = '';
        if (mat && mat.effect) {
          const desc = typeof mat.effect === 'string' ? mat.effect : (mat.effect.desc || '');
          if (desc) info = ` — ${desc}`;
        }
        // 태그 요약
        if (!info && mat && mat.tags) {
          const tags = mat.tags;
          const parts = [];
          const funcs = tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : []);
          const elems = tags.elements || (tags.element ? [tags.element] : []);
          parts.push(...funcs.filter(Boolean), ...elems.filter(Boolean));
          if (parts.length) info = ` (${parts.join('/')})`;
        }
        this.printOption(`${i + 1}`, `  ${i + 1}. ${item.name} ×${item.qty}${info}`);
      });
    }

    this.printBlank();

    // 탭 전환 + 돌아가기
    const actions = tabs.map(t => ({ key: t.key, label: t.name }));
    actions.push({ key: '0', label: '돌아가기' });
    this.print(`  탭 전환: ${tabs.map(t => `${t.key}=${t.name}`).join(' | ')}`, 'dim');
    this.printOption('0', '  0. 돌아가기');
    this.setActions(actions);
    this.updateStatus();
  };

  App.prototype.handleInventory = function (cmd) {
    if (cmd === '0') { this.showTownMenu(); return; }

    // 탭 전환
    const tabMap = { r: 'raw', p: 'processed', c: 'crafted', e: 'equip' };
    if (tabMap[cmd]) { this.showInventory(tabMap[cmd]); return; }

    // 아이템 상세
    const idx = parseInt(cmd);
    if (isNaN(idx) || idx < 1 || !this._inventoryItems || idx > this._inventoryItems.length) {
      return;
    }

    const item = this._inventoryItems[idx - 1];
    const mat = item.mat;
    this.printBlank();
    this.printSeparator();
    this.print(`【 ${item.name} 】 ×${item.qty}`, 'lore');

    if (mat) {
      if (mat.tier) this.print(`  Tier: ${mat.tier}`, 'dim');
      if (mat.lore) this.print(`  "${mat.lore}"`, 'dim');

      const tags = mat.tags || {};
      const funcs = (tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : [])).filter(Boolean);
      const elements = (tags.elements || (tags.element ? [tags.element] : [])).filter(Boolean);
      const forms = (tags.forms || (tags.form ? [tags.form] : [])).filter(Boolean);

      if (funcs.length) this.print(`  기능: ${funcs.join(', ')}`, 'system');
      if (elements.length) this.print(`  원소: ${elements.join(', ')}`, 'system');
      if (forms.length) this.print(`  형태: ${forms.join(', ')}`, 'system');

      if (mat.effect) {
        const desc = typeof mat.effect === 'string' ? mat.effect : (mat.effect.desc || '');
        if (desc) this.print(`  효과: ${desc}`, 'success');
      }

      const catNames = {
        'consumable_potion':'물약', 'consumable_food':'식량', 'consumable_attack':'공격소비재',
        'consumable_debuff':'디버프', 'equipment_weapon':'무기', 'equipment_armor':'방어구',
        'equipment_accessory':'장신구', 'tool_training':'조교도구', 'tool_crafting':'제작도구',
        'material_refined':'정제소재'
      };
      if (mat.category) this.print(`  분류: ${catNames[mat.category] || mat.category}`, 'dim');
    }
    this.printSeparator();
  };
};
