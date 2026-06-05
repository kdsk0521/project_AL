'use strict';

const fs = require('fs');
const path = require('path');
const traitEffects = require('./traitEffects');

// CSV 로더 — 밸런스 수치를 코드 밖에서 관리
class BalanceLoader {
  constructor(balanceDir) {
    this.dir = balanceDir || path.join(__dirname);
    this.cache = {};
  }

  parseCSV(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith(';'));
    const sections = {};
    let currentSection = '_default';
    let headers = null;
    for (const line of lines) {
      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1);
        headers = null;
        if (!sections[currentSection]) sections[currentSection] = [];
        continue;
      }
      const values = line.split(',').map(v => v.trim());
      if (!headers && values.length === 2 && isNaN(values[0])) {
        if (!sections[currentSection]) sections[currentSection] = [];
        if (!sections[currentSection]._kv) sections[currentSection]._kv = {};
        const val = isNaN(values[1]) ? values[1] : Number(values[1]);
        sections[currentSection]._kv[values[0]] = val;
        continue;
      }
      if (!headers) {
        headers = values;
        if (!sections[currentSection]) sections[currentSection] = [];
        sections[currentSection]._headers = headers;
        continue;
      }
      const obj = {};
      const hdrs = sections[currentSection]._headers || headers;
      if (hdrs) {
        hdrs.forEach((h, i) => {
          const v = values[i] || '';
          obj[h] = (v === '' || v === 'null') ? null : (v === 'true') ? true : (v === 'false') ? false : isNaN(v) ? v : Number(v);
        });
        sections[currentSection].push(obj);
      }
    }
    return sections;
  }

  load(filename) {
    if (this.cache[filename]) return this.cache[filename];
    const filePath = path.join(this.dir, filename);
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      const data = this.parseCSV(text);
      this.cache[filename] = data;
      return data;
    } catch (e) {
      console.warn('Balance CSV not found: ' + filename);
      return {};
    }
  }

  getKV(filename, section) {
    const data = this.load(filename);
    const sec = data[section];
    if (!sec) return {};
    if (sec._kv) return sec._kv;
    const result = {};
    for (const row of sec) {
      const keys = Object.keys(row);
      if (keys.length >= 2) result[row[keys[0]]] = row[keys[1]];
    }
    return result;
  }

  getRows(filename, section) {
    const data = this.load(filename);
    return (data[section] || []).filter(r => typeof r === 'object' && !r._headers);
  }

  // 트레잇 CSV 로드 + effects/bridges 정규화 (섹션=카테고리)
  loadTraits(filename) {
    const data = this.load(filename);
    const out = {};
    for (const sec of Object.keys(data)) {
      const rows = (data[sec] || []).filter(r => r && typeof r === 'object' && !r._headers && !r._kv);
      out[sec] = rows.map(traitEffects.normalizeTrait);
    }
    return out;
  }

  getTable(filename) {
    const data = this.load(filename);
    return data._default || data[Object.keys(data)[0]] || [];
  }

  clearCache() { this.cache = {}; }
}

module.exports = BalanceLoader;
