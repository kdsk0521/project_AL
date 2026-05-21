'use strict';

// ============================================================
//  UI Helpers — App.prototype extensions for display/output
// ============================================================
module.exports = function (App) {

  // ── Output ──

  App.prototype.print = function (text, className) {
    const line = document.createElement('div');
    line.className = `output-line ${className || ''}`.trim();
    line.innerHTML = text;
    this.outputEl.appendChild(line);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  };

  App.prototype.printProgress = function (label, value, max, color, width) {
    color = color || '#4a9eff';
    width = width || 140;
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    const el = document.createElement('div');
    el.className = 'output-line';
    el.innerHTML = `<div class="progress-bar">
      <span class="bar-label">${label}</span>
      <div class="bar-bg" style="width:${width}px">
        <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
        <span class="bar-text">${value}/${max}</span>
      </div>
    </div>`;
    this.outputEl.appendChild(el);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  };

  App.prototype.printColumns = function (cols) {
    const el = document.createElement('div');
    el.className = 'output-columns';
    el.style.gridTemplateColumns = cols.map(function (c) {
      return ((c.width || 12) / 24 * 100).toFixed(1) + '%';
    }).join(' ');
    for (const col of cols) {
      const cell = document.createElement('div');
      cell.className = col.className || '';
      cell.style.textAlign = col.align || 'left';
      if (col.color) cell.style.color = col.color;
      cell.innerHTML = col.content || '';
      el.appendChild(cell);
    }
    this.outputEl.appendChild(el);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  };

  App.prototype.printOption = function (cmd, text, className) {
    const self = this;
    const line = document.createElement('div');
    line.className = `output-line ${className || 'menu'} clickable`;
    line.innerHTML = text;
    line.dataset.cmd = cmd;
    line.addEventListener('click', function () {
      self.print('> ' + cmd, 'command');
      self.processCommand(cmd);
    });
    this.outputEl.appendChild(line);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  };

  // ── Action Bar ──

  App.prototype.setActions = function (actions) {
    const bar = document.getElementById('action-bar');
    if (!bar) return;
    bar.innerHTML = '';
    const self = this;
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.innerHTML = '<span class="key">[' + a.key + ']</span>' + a.label;
      btn.addEventListener('click', function () {
        self.print('> ' + a.key, 'command');
        self.processCommand(a.key);
      });
      bar.appendChild(btn);
    }
  };

  App.prototype.clearActions = function () {
    const bar = document.getElementById('action-bar');
    if (bar) bar.innerHTML = '';
  };

  // ── Convenience ──

  App.prototype.printSeparator = function () {
    this.print('\u2500'.repeat(60), 'dim');
  };

  App.prototype.printBlank = function () {
    this.print('&nbsp;');
  };

  App.prototype.clearOutput = function () {
    this.outputEl.innerHTML = '';
  };

  // ── Tag / Part helpers ──

  App.prototype._printTagSummary = function (item) {
    if (!item) return;
    const tags = item.tags || {};
    const funcs = (tags.functions || (tags.function ? (Array.isArray(tags.function) ? tags.function : [tags.function]) : [])).filter(Boolean);
    const elems = (tags.elements || (tags.element ? (Array.isArray(tags.element) ? tags.element : [tags.element]) : [])).filter(Boolean);
    const forms = (tags.forms || (tags.form ? (Array.isArray(tags.form) ? tags.form : [tags.form]) : [])).filter(Boolean);

    var countMap = function (arr) {
      var m = {};
      arr.forEach(function (t) { m[t] = (m[t] || 0) + 1; });
      return Object.entries(m).map(function (e) { return e[1] > 1 ? e[0] + '\u00d7' + e[1] : e[0]; }).join(', ');
    };

    var parts = [];
    if (funcs.length) parts.push('\uae30\ub2a5[' + countMap(funcs) + ']');
    if (elems.length) parts.push('\uc6d0\uc18c[' + countMap(elems) + ']');
    if (forms.length) parts.push('\ud615\ud0dc[' + countMap(forms) + ']');

    var tier = item.tier || 1;
    if (parts.length) {
      this.print('  Tier ' + tier + ' | ' + parts.join(' '), 'dim');
    }
  };

  App.prototype._partSummary = function (part) {
    if (!part.tags || part.tags.length === 0) return '\uae30\ubcf8';
    var counts = {};
    part.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    return Object.entries(counts).map(function (e) { return e[1] > 1 ? e[0] + '\u00d7' + e[1] : e[0]; }).join(',');
  };

  App.prototype._partTier = function (part) {
    if (!part.tags || part.tags.length === 0) return 0;
    var counts = {};
    part.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    var total = Object.values(counts).reduce(function (s, v) { return s + v; }, 0);
    var unique = Object.keys(counts).length;
    return Math.floor(total / unique);
  };

  // ── Status Panel Updater ──

  App.prototype.updateStatus = function () {
    var s = this.engine.state;
    if (!s) return;

    var safe = function (id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    var safeStyle = function (id, prop, val) {
      var el = document.getElementById(id);
      if (el) el.style[prop] = val;
    };

    // Location
    var loc = s.dungeon && s.dungeon.inDungeon
      ? '\ubbf8\uada5 ' + s.dungeon.currentFloor + '\uce35'
      : '\ubbf8\uada5 \ub3c4\uc2dc';
    safe('location-display', loc);

    // Date
    safe('date-display', s.year + '\ub144 ' + s.month + '\uc6d4 ' + s.day + '\uc77c');

    // Player stats
    safe('hp-display', s.player.hp + '/' + s.player.maxHp);
    safe('stamina-display', s.stamina + '/' + s.maxStamina);
    safe('soulpower-display', s.soulPower);

    // Materials
    var matEl = document.getElementById('materials-display');
    if (matEl) {
      var inv = s.inventory || {};
      var keyMats = [
        ['MAT_HERB', '\uc57d\ucd08'], ['MAT_CATALYST_HERB', '\ucd09\ub9e4\ucd08'],
        ['MAT_IRON_ORE', '\ucca0\uad11\uc11d'], ['MAT_MAGIC_STONE', '\ub9c8\ub825\uc11d'],
        ['MAT_POISON_FISH', '\ub3c5\ubb3c\uace0\uae30'], ['MAT_WATER', '\ubb3c'],
        ['MAT_SLIME_CORE', '\uc2ac\ub77c\uc784\ud575'], ['MAT_SPRING', '\uc2a4\ud504\ub9c1']
      ];
      var lines = keyMats
        .filter(function (e) { return (inv[e[0]] || 0) > 0; })
        .map(function (e) { return e[1] + ':' + inv[e[0]]; });
      var craftedCount = Object.keys(inv).filter(function (id) {
        return !id.startsWith('MAT_') && (inv[id] || 0) > 0;
      }).length;
      if (craftedCount > 0) lines.push('\uc81c\uc791\ud488:' + craftedCount + '\uc885');
      matEl.innerHTML = lines.join(' | ') || '\uc5c6\uc74c';
    }

    // Bars
    safeStyle('hp-bar', 'width', (s.player.hp / s.player.maxHp) * 100 + '%');
    safeStyle('stamina-bar', 'width', (s.stamina / s.maxStamina) * 100 + '%');
    var soulMax = Math.max(1, s.soulPower + 200);
    safeStyle('soul-bar', 'width', Math.min(100, (s.soulPower / soulMax) * 100) + '%');

    // Party list
    var partyEl = document.getElementById('party-display');
    if (!partyEl) return;
    var partyUnits = this.engine.getPartyUnits();
    if (partyUnits.length > 0) {
      partyEl.innerHTML = partyUnits.map(function (u) {
        return '<div class="party-member">' +
          '<span class="name">' + u.name + '</span> ' +
          '<span class="info">Lv.' + u.level + ' HP:' + u.hp + '/' + u.maxHp +
          (u.isKnockedOut ? ' [\uae30\uc808]' : '') + '</span>' +
          '</div>';
      }).join('');
    } else {
      partyEl.innerHTML = '<span class="empty-text">\ud3b8\uc131\ub41c \uc720\ub2db \uc5c6\uc74c</span>';
    }
  };

  // ── Quick-command handler (from buttons) ──

  App.prototype._quickCommand = function (label) {
    switch (label) {
      case '\uc778\ubca4\ud1a0\ub9ac':
        if (this.currentScreen === 'town' || this.currentScreen === 'crafting') {
          this.showInventory();
        } else {
          this.print('(\ud604\uc7ac \ud654\uba74\uc5d0\uc11c\ub294 \uc778\ubca4\ud1a0\ub9ac\ub97c \uc5f4 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4)', 'dim');
        }
        break;
      case '\uc720\ub2db':
        if (this.currentScreen === 'town') {
          this.showUnitManagement();
        } else {
          this.print('(\ud604\uc7ac \ud654\uba74\uc5d0\uc11c\ub294 \uc720\ub2db \uad00\ub9ac\ub97c \uc5f4 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4)', 'dim');
        }
        break;
      case '\uc9c0\ub3c4':
        if (this.engine.state.dungeon.inDungeon) {
          var floor = this.engine.state.dungeon.currentFloor;
          var nodes = this.dungeon.getFloorNodes(floor);
          var currentId = this.engine.state.dungeon.currentNode;
          this.printBlank();
          this.print('\u2500\u2500 \ubbf8\uada5 ' + floor + '\uce35 \ub178\ub4dc \ub9f5 \u2500\u2500', 'system');
          var typeNames = {
            entrance: '\uc785\uad6c', exit: '\ucd9c\uad6c', combat: '\uc804\ud22c',
            collect: '\ucc44\uc9d1', rest: '\ud734\uc2dd', chest: '\uc0c1\uc790',
            event: '\uc774\ubca4\ud2b8', boss: '\ubcf4\uc2a4'
          };
          for (var _i = 0; _i < nodes.length; _i++) {
            var n = nodes[_i];
            var marker = n.id === currentId ? ' \u25c0 \ud604\uc7ac \uc704\uce58' : '';
            this.print('  ' + (n.name || n.id) + ' [' + (typeNames[n.type] || n.type) + ']' + marker, n.id === currentId ? 'system' : 'dim');
          }
          this.printBlank();
        } else {
          this.print('(\ubbf8\uada5 \ub0b4\uc5d0\uc11c\ub9cc \uc9c0\ub3c4\ub97c \ud655\uc778\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4)', 'dim');
        }
        break;
    }
  };
};
