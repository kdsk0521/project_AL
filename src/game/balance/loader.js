'use strict';

const fs = require('fs');
const path = require('path');

// CSV 로더 — 밸런스 수치를 코드 밖에서 관리
class BalanceLoader {
  constructor(balanceDir) {
    this.dir = balanceDir || path.join(__dirname);
    this.cache = {};
  }

  // 단순 CSV 파싱 (;로 시작하는 줄 = 주석, 빈 줄 무시)
  parseCSV(text) {
    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith(';'));

    // 섹션 지원: [section_name]
    const sections = {};
    let currentSection = '_default';
    let headers = null;

    for (const line of lines) {
      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1);
        headers = null; // 섹션마다 헤더 리셋
        if (!sections[currentSection]) sections[currentSection] = [];
        continue;
      }

      const values = line.split(',').map(v => v.trim());

      // 키=값 형태 (2열이면서 아직 헤더가 없고 첫 열이 숫자가 아님)
      if (!headers && values.length === 2 && isNaN(values[0])) {
        if (!sections[currentSection]) sections[currentSection] = [];
        if (!sections[currentSection]._kv) sections[currentSection]._kv = {};
        const val = isNaN(values[1]) ? values[1] : Number(values[1]);
        sections[currentSection]._kv[values[0]] = val;
        continue;
      }

      // 첫 데이터 줄 = 헤더
      if (!headers) {
        headers = values;
        if (!sections[currentSection]) sections[currentSection] = [];
        sections[currentSection]._headers = headers;
        continue;
      }

      // 헤더 기반 객체 배열
      const obj = {};
      const hdrs = sections[currentSection]._headers || headers;
      if (hdrs) {
        hdrs.forEach((h, i) => {
          const v = values[i] || '';
          obj[h] = (v === '' || v === 'null') ? null :
                   (v === 'true') ? true :
                   (v === 'false') ? false :
                   isNaN(v) ? v : Number(v);
        });
        sections[currentSection].push(obj);
      }
    }

    return sections;
  }

  // 파일 로드 (캐싱)
  load(filename) {
    if (this.cache[filename]) return this.cache[filename];

    const filePath = path.join(this.dir, filename);
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      const data = this.parseCSV(text);
      this.cache[filename] = data;
      return data;
    } catch (e) {
      console.warn(`Balance CSV not found: ${filename}`);
      return {};
    }
  }

  // 편의 메서드: 특정 섹션의 키-값 맵
  getKV(filename, section) {
    const data = this.load(filename);
    const sec = data[section];
    if (!sec) return {};
    if (sec._kv) return sec._kv;
    // 배열이면 첫 번째 열을 키, 두 번째를 값으로
    const result = {};
    for (const row of sec) {
      const keys = Object.keys(row);
      if (keys.length >= 2) {
        result[row[keys[0]]] = row[keys[1]];
      }
    }
    return result;
  }

  // 편의 메서드: 특정 섹션의 행 배열
  getRows(filename, section) {
    const data = this.load(filename);
    return (data[section] || []).filter(r => typeof r === 'object' && !r._headers);
  }

  // 편의 메서드: 섹션 없는 단일 테이블
  getTable(filename) {
    const data = this.load(filename);
    return data._default || data[Object.keys(data)[0]] || [];
  }

  // 캐시 클리어 (핫 리로드용)
  clearCache() {
    this.cache = {};
  }
}

module.exports = BalanceLoader;
