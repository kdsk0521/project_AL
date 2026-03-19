'use strict';

// Event Queue — 이머전트 이벤트 순차 처리
// ERA 분석 참고: Factory + Queue + Hook 패턴
class EventQueue {
  constructor(engine) {
    this.engine = engine;
    this.queue = [];
    this.hooks = {
      day_end: [],
      month_end: [],
      dungeon_enter: [],
      dungeon_return: [],
      unit_ko: [],
      unit_deliver: [],
      fusion_complete: [],
      affection_stage_up: [],
      training_orgasm: [],
      boss_defeated: [],
      facility_built: [],
      crafting_complete: [],
    };
    this.processed = []; // 처리 완료된 이벤트 로그
  }

  // 이벤트 추가
  push(event) {
    // event: { type, priority, data, message }
    this.queue.push({
      ...event,
      priority: event.priority || 0,
      timestamp: Date.now()
    });
    // 우선순위 정렬 (높을수록 먼저)
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  // 전부 처리하고 결과 반환
  processAll() {
    const results = [];
    while (this.queue.length > 0) {
      const event = this.queue.shift();
      const result = this.execute(event);
      if (result) {
        results.push(result);
        this.processed.push({ ...event, result, processedAt: Date.now() });
      }
    }
    return results;
  }

  // 단일 이벤트 실행
  execute(event) {
    switch (event.type) {
      case 'milestone':
        return this.handleMilestone(event);
      case 'relationship':
        return this.handleRelationship(event);
      case 'emergent':
        return this.handleEmergent(event);
      case 'calendar':
        return this.handleCalendar(event);
      case 'system':
        return this.handleSystem(event);
      default:
        return { type: event.type, message: event.message || '이벤트 발생' };
    }
  }

  // 훅 등록
  on(hookName, handler) {
    if (this.hooks[hookName]) {
      this.hooks[hookName].push(handler);
    }
  }

  // 훅 트리거 — 해당 시점에 등록된 모든 핸들러 실행 + 이벤트 생성
  trigger(hookName, data = {}) {
    const handlers = this.hooks[hookName] || [];
    const results = [];
    for (const handler of handlers) {
      const event = handler(this.engine, data);
      if (event) {
        this.push(event);
        results.push(event);
      }
    }
    return results;
  }

  // === 이벤트 핸들러 ===

  handleMilestone(event) {
    return {
      type: 'milestone',
      message: event.message || `마일스톤 달성: ${event.data?.name || ''}`,
      data: event.data
    };
  }

  handleRelationship(event) {
    return {
      type: 'relationship',
      message: event.message || `관계 변화: ${event.data?.unitName || ''}`,
      data: event.data
    };
  }

  handleEmergent(event) {
    // 이머전트 이벤트: 시스템 상태 조합으로 자동 발생
    const s = this.engine.state;
    const results = [];

    // 예: 영혼력 부족 경고
    if (s.soulPower < 100 && s.milestones.compressorBuilt) {
      results.push({
        type: 'emergent',
        message: '영혼력이 바닥나고 있다. 유닛을 납품해야 할지도 모른다.',
        severity: 'warning'
      });
    }

    // 예: 유닛 호감도 MAX
    if (event.data?.affection >= 90) {
      results.push({
        type: 'emergent',
        message: `${event.data.unitName}의 호감이 최고조에 달했다. 연애 루트 진입 가능.`,
        severity: 'info'
      });
    }

    return results.length > 0 ? results : { type: 'emergent', message: event.message, data: event.data };
  }

  handleCalendar(event) {
    return {
      type: 'calendar',
      message: event.message || `달력 이벤트: ${event.data?.month || ''}월`,
      data: event.data
    };
  }

  handleSystem(event) {
    return {
      type: 'system',
      message: event.message,
      data: event.data
    };
  }

  // === 조건 체크 (시스템 상태 기반 이머전트 이벤트 스캔) ===

  scanForEmergentEvents() {
    const s = this.engine.state;
    const events = [];

    // 경영 위기
    if (s.soulPower <= 0) {
      events.push({ type: 'emergent', priority: 10, message: '영혼력이 0이다! 공방이 위험하다.', data: { crisis: 'bankruptcy' } });
    }

    // 유닛 전원 기절
    const activeUnits = s.ownedUnits.filter(u => !u.isKnockedOut);
    if (activeUnits.length === 0 && s.ownedUnits.length > 0) {
      events.push({ type: 'emergent', priority: 5, message: '모든 유닛이 기절 상태다...', data: { crisis: 'all_ko' } });
    }

    // 호감도 MAX 유닛
    for (const u of s.ownedUnits) {
      if (u.affection >= 90 && !u._maxAffectionNotified) {
        events.push({ type: 'relationship', priority: 3, message: `${u.name}과의 유대가 깊어졌다.`, data: { unitName: u.name, affection: u.affection } });
        u._maxAffectionNotified = true;
      }
    }

    for (const e of events) this.push(e);
    return events;
  }

  // 큐 길이
  get length() { return this.queue.length; }

  // 큐 비우기
  clear() { this.queue = []; }
}

module.exports = EventQueue;
