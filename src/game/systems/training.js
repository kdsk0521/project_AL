'use strict';

const TE = require('./trainingEngine'); // v2 침염/변용 레이어

// Training System (조교소) — Adult content training with per-unit trait mechanics
// Body parts: mouth(입), chest(가슴), v(V), c(C), anal(애널), skin(피부)
// Actions: caress(애무), stimulate(자극), tease(간지럼), press(압박), lick(핥기), tool(도구사용)
// Global states: love(연모), submission(복종), lewdness(음란), fear(공포), resentment(반감)

class TrainingSystem {
  constructor(engine) {
    this.engine = engine;

    this.PARTS = ['mouth', 'chest', 'v', 'c', 'anal', 'skin'];
    this.PART_NAMES = { mouth: '입', chest: '가슴', v: 'V', c: 'C', anal: '애널', skin: '피부' };

    // Part experience milestones
    this.PART_MILESTONES = [
      { exp: 0,   label: '미개발',   senMul: 1.0, desc: '아직 반응이 약하다.' },
      { exp: 20,  label: '민감',     senMul: 1.2, desc: '조금씩 반응하기 시작한다.' },
      { exp: 50,  label: '익숙',     senMul: 1.5, desc: '자극에 익숙해지며 반응이 커졌다.' },
      { exp: 100, label: '개발됨',   senMul: 1.8, desc: '완전히 개발되어 강하게 반응한다.' },
      { exp: 180, label: '과민',     senMul: 2.2, desc: '가벼운 자극에도 크게 반응한다.' },
      { exp: 300, label: '조교완료', senMul: 2.5, desc: '완벽하게 길들여졌다.' }
    ];

    // ERA식 행위 정의 — 번호만 입력, 행위가 부위를 포함
    // targets: [{part, ratio}] — 한 행위가 여러 부위에 동시 영향
    this.ACTIONS = [
      // ── 기본 (항상 가능) ──
      { id: 1,  name: '머리쓰다듬기', intensity: 1, targets: [{part:'skin',ratio:1.0}],
        unlock: null, expKey: 'caress', flavor: '부드럽게 머리를 쓰다듬는다.' },
      { id: 2,  name: '포옹', intensity: 1, targets: [{part:'skin',ratio:1.0},{part:'chest',ratio:0.3}],
        unlock: null, expKey: 'caress', flavor: '따뜻하게 껴안는다.' },
      { id: 3,  name: '손잡기', intensity: 1, targets: [{part:'skin',ratio:0.8}],
        unlock: null, expKey: 'caress', flavor: '손을 부드럽게 잡는다.' },
      { id: 4,  name: '가슴 애무', intensity: 1, targets: [{part:'chest',ratio:1.0},{part:'skin',ratio:0.2}],
        unlock: null, expKey: 'caress', flavor: '가슴을 부드럽게 만진다.' },
      { id: 5,  name: '엉덩이 애무', intensity: 1, targets: [{part:'anal',ratio:0.7},{part:'skin',ratio:0.3}],
        unlock: null, expKey: 'caress', flavor: '엉덩이를 만진다.' },
      { id: 6,  name: '전신 애무', intensity: 1, targets: [{part:'skin',ratio:1.0},{part:'chest',ratio:0.2},{part:'c',ratio:0.1}],
        unlock: null, expKey: 'caress', flavor: '전신을 천천히 어루만진다.' },

      // ── 음란 15+ ──
      { id: 7,  name: '키스', intensity: 2, targets: [{part:'mouth',ratio:1.0},{part:'chest',ratio:0.3}],
        unlock: {lewdness:15}, expKey: 'kiss', flavor: '입술을 겹친다.' },
      { id: 8,  name: '가슴 주무르기', intensity: 2, targets: [{part:'chest',ratio:1.2},{part:'skin',ratio:0.3}],
        unlock: {lewdness:15}, expKey: 'stimulate', flavor: '가슴을 적극적으로 주무른다.' },

      // ── 음란 20+ ──
      { id: 9,  name: '유두 자극', intensity: 2, targets: [{part:'chest',ratio:1.5}],
        unlock: {lewdness:20}, expKey: 'stimulate', flavor: '유두를 손가락으로 집중 자극한다.' },
      { id: 10, name: '클리 자극', intensity: 2, targets: [{part:'c',ratio:1.3},{part:'skin',ratio:0.2}],
        unlock: {lewdness:20}, expKey: 'stimulate', flavor: '클리토리스를 손가락으로 자극한다.' },
      { id: 11, name: '로터(C)', intensity: 3, targets: [{part:'c',ratio:1.5},{part:'v',ratio:0.5}],
        unlock: null, expKey: 'toy', flavor: '클리에 로터를 대고 진동시킨다.' },

      // ── 음란 25+ ──
      { id: 12, name: 'V 손가락', intensity: 2, targets: [{part:'v',ratio:1.2},{part:'c',ratio:0.4}],
        unlock: {lewdness:25}, expKey: 'stimulate', flavor: '질 내부를 손가락으로 자극한다.' },
      { id: 13, name: '로터(V)', intensity: 3, targets: [{part:'v',ratio:1.5},{part:'c',ratio:0.3}],
        unlock: null, expKey: 'toy', flavor: '질 안에 로터를 넣고 진동시킨다.' },

      // ── 음란 30+ ──
      { id: 14, name: '딥키스', intensity: 3, targets: [{part:'mouth',ratio:1.5},{part:'chest',ratio:0.4},{part:'skin',ratio:0.3}],
        unlock: {lewdness:30, affection:2}, expKey: 'kiss', flavor: '혀를 깊이 넣어 입 안을 탐색한다.' },
      { id: 15, name: '유두 핥기', intensity: 3, targets: [{part:'chest',ratio:1.5},{part:'mouth',ratio:0.3}],
        unlock: {lewdness:30}, expKey: 'lick', flavor: '유두를 혀로 핥고 빤다.' },
      { id: 16, name: 'A 손가락', intensity: 2, targets: [{part:'anal',ratio:1.0}],
        unlock: {lewdness:30}, expKey: 'stimulate', flavor: '항문을 손가락으로 자극한다.' },

      // ── 음란 35+ ──
      { id: 17, name: '로터(A)', intensity: 3, targets: [{part:'anal',ratio:1.3}],
        unlock: null, expKey: 'toy', flavor: '항문에 로터를 넣는다.' },

      // ── 음란 40+ ──
      { id: 18, name: '클리 핥기', intensity: 3, targets: [{part:'c',ratio:1.8},{part:'v',ratio:0.5}],
        unlock: {lewdness:40}, expKey: 'lick', flavor: '클리토리스를 혀로 집중적으로 핥는다.' },
      { id: 19, name: 'V 핥기', intensity: 3, targets: [{part:'v',ratio:1.5},{part:'c',ratio:0.5},{part:'skin',ratio:0.2}],
        unlock: {lewdness:40, affection:3}, expKey: 'lick', flavor: '커닐링구스.' },
      { id: 20, name: 'A 핥기', intensity: 3, targets: [{part:'anal',ratio:1.3},{part:'skin',ratio:0.3}],
        unlock: {lewdness:45}, expKey: 'lick', flavor: '항문을 혀로 핥는다.' },

      // ── 음란 55+ (삽입) ──
      { id: 21, name: 'V 삽입', intensity: 4, targets: [{part:'v',ratio:2.0},{part:'c',ratio:0.8},{part:'skin',ratio:0.3}],
        unlock: {lewdness:55, affection:3, partSensitivity:{v:20}}, expKey: 'insert', flavor: '천천히 삽입한다.' },
      { id: 22, name: 'A 삽입', intensity: 4, targets: [{part:'anal',ratio:1.8},{part:'v',ratio:0.3}],
        unlock: {lewdness:55, affection:3, partSensitivity:{anal:20}}, expKey: 'insert', flavor: '항문에 삽입한다.' },

      // ── 음란 75+ (고급) ──
      { id: 23, name: '격렬 삽입', intensity: 5, targets: [{part:'v',ratio:2.5},{part:'c',ratio:1.0},{part:'anal',ratio:0.5},{part:'skin',ratio:0.5}],
        unlock: {lewdness:75, affection:4, partSensitivity:{v:40}}, expKey: 'insert', flavor: '거칠게 몰아붙인다.' },
      { id: 24, name: '조련', intensity: 5, targets: [{part:'v',ratio:1.5},{part:'c',ratio:1.5},{part:'anal',ratio:1.0},{part:'chest',ratio:1.0},{part:'mouth',ratio:0.5},{part:'skin',ratio:0.5}],
        unlock: {lewdness:80, affection:4}, expKey: 'discipline', flavor: '본격적으로 조련한다.' },
    ];
  }

  // Get available actions for a unit (ERA식 — 부위 선택 불필요)
  getAvailableActions(unit) {
    const gs = unit.globalState;
    const affStage = this.getAffectionStage(unit.affection);
    const sen = unit.sensitivity;
    const hasTool = this.hasTrainingTool();
    const lockedParts = new Set(this.getAvailableParts(unit).filter(p => p.locked).map(p => p.id));

    return this.ACTIONS.map(a => {
      let locked = false;
      let lockReason = '';

      // Check tool requirement
      if (!locked && a.requiresTool && !hasTool) {
        locked = true;
        lockReason = '도구 필요';
      }

      // Check unlock conditions
      if (!locked && a.unlock) {
        const req = a.unlock;
        if (req.lewdness && (gs.lewdness || 0) < req.lewdness) {
          locked = true;
          lockReason = `음란 ${req.lewdness} 필요`;
        }
        if (!locked && req.affection && affStage < req.affection) {
          const stageNames = ['경계','인지','친밀','신뢰','유대','헌신'];
          locked = true;
          lockReason = `호감 ${stageNames[req.affection]}↑`;
        }
        // partSensitivity: {v:20} 형태 — 특정 부위 감도 체크
        if (!locked && req.partSensitivity) {
          for (const [part, threshold] of Object.entries(req.partSensitivity)) {
            if ((sen[part] || 0) < threshold) {
              locked = true;
              lockReason = `${this.PART_NAMES[part]}감도 ${threshold}↑`;
              break;
            }
          }
        }
      }

      // Check if all target parts are locked (유닛 트레잇에 의한 부위 잠금)
      if (!locked && a.targets) {
        const allLocked = a.targets.every(t => lockedParts.has(t.part));
        if (allLocked) {
          locked = true;
          lockReason = '대상 부위 잠금';
        }
      }

      return { ...a, locked, lockReason };
    });
  }

  // Check if training is available for this unit
  canTrain(unit) {
    if (!unit) return { ok: false, reason: '유닛을 찾을 수 없습니다.' };
    if (unit.isKnockedOut) return { ok: false, reason: '기절 상태의 유닛은 조교할 수 없습니다.' };

    // Check unit-specific restrictions
    const adultTrait = this.getAdultTrait(unit);

    // 심연의 고독: 호감도 유대 이상에서만
    if (adultTrait === 'AT_ABYSS_LONELINESS') {
      const affStage = this.getAffectionStage(unit.affection);
      if (affStage < 4) return { ok: false, reason: '호감도가 유대 이상이어야 조교할 수 있습니다.' };
    }

    // 역정제: 연모를 먼저 올려야 함 (연모 < 50이면 경고만)
    return { ok: true };
  }

  // Get available body parts for this unit (some may be locked)
  getAvailableParts(unit) {
    const adultTrait = this.getAdultTrait(unit);
    const allParts = [...this.PARTS];
    const locked = [];

    // 신뢰개방: 호감도 단계별 해금
    if (adultTrait === 'AT_TRUST_UNLOCK') {
      const stage = this.getAffectionStage(unit.affection);
      if (stage < 1) { locked.push('chest', 'v', 'c', 'anal'); }
      else if (stage < 2) { locked.push('v', 'c', 'anal'); }
      else if (stage < 3) { locked.push('anal'); }
    }

    // 갑옷 봉인: 가슴/V/C/애널 잠금, 도구 or 호감도 신뢰로 해금
    if (adultTrait === 'AT_ARMOR_SEAL') {
      const stage = this.getAffectionStage(unit.affection);
      const hasTool = this.hasTrainingTool();
      if (stage < 3 && !hasTool) {
        locked.push('chest', 'v', 'c', 'anal');
      }
    }

    // 보호벽 해제: 가슴/V/C 잠금, 호감도 신뢰로 해금
    if (adultTrait === 'AT_GUARD_RELEASE') {
      const stage = this.getAffectionStage(unit.affection);
      if (stage < 3) {
        locked.push('chest', 'v', 'c');
      }
    }

    // 태고의 감각: 전부 잠금, 특수 도구로 1부위씩 해금
    if (adultTrait === 'AT_PRIMORDIAL_SENSE') {
      const unlocked = unit._unlockedParts || [];
      for (const p of allParts) {
        if (!unlocked.includes(p)) locked.push(p);
      }
    }

    // 선별반응: 2부위만 가능
    if (adultTrait === 'AT_SELECTIVE_RESPONSE') {
      if (!unit._selectiveParts) {
        // Randomly select 2 parts on first check
        const shuffled = [...allParts].sort(() => Math.random() - 0.5);
        unit._selectiveParts = shuffled.slice(0, 2);
      }
      for (const p of allParts) {
        if (!unit._selectiveParts.includes(p)) locked.push(p);
      }
    }

    // 감각차단: 피부 고정 잠금, 나머지는 도구 필요
    if (adultTrait === 'AT_SENSORY_BLOCK') {
      locked.push('skin'); // permanently locked
    }

    // 침투감도: 외부→내부 순서 강제
    if (adultTrait === 'AT_INFILTRATION_SENSE') {
      const order = ['skin', 'mouth', 'chest', 'v', 'c', 'anal'];
      const threshold = 30;
      let unlockIdx = 0;
      for (let i = 0; i < order.length; i++) {
        if ((unit.sensitivity[order[i]] || 0) >= threshold) {
          unlockIdx = i + 1;
        } else {
          break;
        }
      }
      for (let i = unlockIdx + 1; i < order.length; i++) {
        if (!locked.includes(order[i])) locked.push(order[i]);
      }
    }

    return allParts.map(p => {
      const exp = (unit._partExp && unit._partExp[p]) || 0;
      const milestone = this.getPartMilestone(exp);
      return {
        id: p,
        name: this.PART_NAMES[p],
        sensitivity: unit.sensitivity[p] || 0,
        exp,
        milestone: milestone.label,
        milestoneMul: milestone.senMul,
        milestoneDesc: milestone.desc,
        locked: locked.includes(p)
      };
    });
  }

  // Execute a training action (ERA식 — actionId는 숫자, 부위는 행위에 내장)
  execute(unit, actionId, hasTool = false) {
    if (!unit) return { success: false, reason: '유닛 없음' };

    const adultTrait = this.getAdultTrait(unit);
    const action = this.ACTIONS.find(a => a.id === actionId);
    if (!action) return { success: false, reason: '행위 없음' };

    if (action.requiresTool && !hasTool) {
      return { success: false, reason: '조교 도구가 필요합니다.' };
    }

    // ═══ 반복 페널티 / 전환 보너스 시스템 ═══
    if (!unit._repeatTracker) unit._repeatTracker = { lastActionId: null, streak: 0, lastCategory: null };
    const rt = unit._repeatTracker;
    let repeatMul = 1.0;
    let repeatMsg = null;

    // 같은 행위 연속 체크
    if (rt.lastActionId === actionId) {
      rt.streak++;
      // 2회째 85%, 3회째 70%, 4회째 55%, 5회이상 40% (최소 40%)
      repeatMul = Math.max(0.4, 1.0 - rt.streak * 0.15);
      repeatMsg = `반복 ${rt.streak + 1}회 (효율 ${Math.round(repeatMul * 100)}%)`;
    } else {
      // 다른 행위로 전환 — 카테고리(expKey) 기반 보너스 체크
      const switched = rt.lastActionId !== null;
      const categoryChanged = rt.lastCategory !== null && rt.lastCategory !== action.expKey;
      rt.streak = 0;

      if (switched && categoryChanged) {
        repeatMul = 1.25; // 다른 카테고리 전환 보너스 125%
        repeatMsg = '전환 보너스! (효율 125%)';
      } else if (switched) {
        repeatMul = 1.1; // 같은 카테고리 내 다른 행위 110%
        repeatMsg = '행위 변경 (효율 110%)';
      }
    }
    rt.lastActionId = actionId;
    rt.lastCategory = action.expKey;

    // 잠긴 부위 체크
    if (!unit._partExp) unit._partExp = {};
    const lockedParts = new Set(this.getAvailableParts(unit).filter(p => p.locked).map(p => p.id));

    // 각 대상 부위에 감도 적용
    let totalSenGain = 0;
    const partResults = [];
    let primaryPart = action.targets[0]?.part || 'skin';
    let extraText = [];

    // Flavor text
    if (action.flavor) extraText.push(action.flavor);
    if (repeatMsg) extraText.push(repeatMsg);

    for (const target of action.targets) {
      if (lockedParts.has(target.part)) continue; // 잠긴 부위 스킵

      const partMilestone = this.getPartMilestone(unit._partExp[target.part] || 0);
      const baseSen = action.intensity * 2 + Math.floor(Math.random() * 3);
      const senGain = Math.floor(baseSen * target.ratio * partMilestone.senMul * repeatMul);

      if (senGain > 0) {
        totalSenGain += senGain;
        partResults.push({ part: target.part, partName: this.PART_NAMES[target.part], gain: senGain });
      }
    }

    // 글로벌 상태 변화 기본값 (반복 페널티 적용)
    let lewdGain = Math.floor(action.intensity * repeatMul);
    let submissionGain = Math.floor(action.intensity * 0.5 * repeatMul);
    let fearGain = 0;
    let resentGain = 0;
    let loveGain = 0;

    // 트레잇 효과 호환용 — senGain은 totalSenGain의 별칭
    let senGain = totalSenGain;

    // === General fear/resentment mechanics (before trait modifiers) ===
    const affStage = this.getAffectionStage(unit.affection);

    // Low affection → fear rises (경계/인지 단계에서 조교하면 무섭다)
    if (affStage <= 1) {
      fearGain += Math.ceil(action.intensity * 0.8);
      resentGain += Math.ceil(action.intensity * 0.5);
    } else if (affStage <= 2) {
      fearGain += Math.ceil(action.intensity * 0.3);
    }

    // High intensity actions raise fear slightly regardless
    if (action.intensity >= 3) {
      fearGain += 1;
    }
    if (action.intensity >= 4) {
      fearGain += 1;
      submissionGain += 1;
    }
    if (action.intensity >= 5) {
      fearGain += 2;
      submissionGain += 2;
    }

    // High affection → love rises instead of fear
    if (affStage >= 3) {
      loveGain += Math.floor(action.intensity * 0.3);
    }
    if (affStage >= 4) {
      loveGain += 1;
    }

    // ===== Apply adult trait modifiers =====
    const sen = unit.sensitivity;
    const gs = unit.globalState;

    switch (adultTrait) {
      case 'AT_INEXPERIENCED': // 미경험: 첫 자극에 큰 변동폭
        if ((sen[primaryPart] || 0) < 5) {
          senGain *= 3;
          lewdGain *= 2;
          extraText.push('첫 자극에 크게 반응했다!');
        }
        break;

      case 'AT_HYPOTHERMIA': // 저체온: 음란 50 미만이면 0.5배, 이상이면 3배
        if (gs.lewdness < 50) {
          senGain = Math.floor(senGain * 0.5);
          extraText.push('차가운 몸이 반응이 느리다...');
        } else {
          senGain *= 3;
          extraText.push('임계점을 넘었다! 감도가 폭발적으로 상승!');
        }
        break;

      case 'AT_SENSORY_BLOCK': // 감각차단: 도구 없으면 음란만 미세 상승
        if (!hasTool && primaryPart !== 'skin') {
          senGain = 0;
          lewdGain = 1;
          extraText.push('도구 없이는 거의 반응하지 않는다.');
        }
        break;

      case 'AT_SHAME_EXCESS': // 수치심 과잉: 반감 2배, 복종>반감이면 음란으로 전환
        if (gs.submission > gs.resentment) {
          lewdGain *= 2;
          extraText.push('복종이 수치심을 넘어 음란으로 전환된다.');
        } else {
          resentGain = action.intensity * 2;
          extraText.push('수치심으로 반감이 크게 상승...');
        }
        break;

      case 'AT_HYPERSENSITIVITY': // 과감도: 음란 1.5배, 70이상이면 공포+반감
        lewdGain = Math.floor(lewdGain * 1.5);
        if (gs.lewdness >= 70) {
          fearGain += 2;
          resentGain += 2;
          extraText.push('폭주 위험! 공포와 반감이 동시에 상승.');
        }
        break;

      case 'AT_SENSORY_CONFUSION': // 감각혼선: 랜덤 부위에 감도 상승
        const otherParts = this.PARTS.filter(p => p !== primaryPart);
        targetPart = otherParts[Math.floor(Math.random() * otherParts.length)];
        extraText.push(`자극한 부위가 아닌 ${this.PART_NAMES[targetPart]}의 감도가 올랐다!`);
        break;

      case 'AT_SADIST': // S기질: 복종 하락, 공포가 높으면 복종 상승
        if (gs.fear >= 30) {
          submissionGain = action.intensity;
          extraText.push('공포에 의해 복종이 상승한다.');
        } else {
          submissionGain = -action.intensity;
          resentGain = Math.floor(action.intensity * 1.5);
          extraText.push('거칠게 저항한다. 복종이 하락.');
        }
        break;

      case 'AT_PLASTICITY': // 가소성: 처음 3부위 2배, 나머지 0.5배
        if (!unit._plasticParts) unit._plasticParts = [];
        if (unit._plasticParts.length < 3 && !unit._plasticParts.includes(primaryPart)) {
          unit._plasticParts.push(primaryPart);
        }
        if (unit._plasticParts.includes(primaryPart)) {
          senGain *= 2;
          extraText.push('각인된 부위. 반응이 강하다.');
        } else {
          senGain = Math.floor(senGain * 0.5);
        }
        break;

      case 'AT_NUMB_CONSTITUTION': // 둔감체질: 0.3배, 임계점마다 음란 +15
        senGain = Math.floor(senGain * 0.3);
        const oldSen = sen[primaryPart] || 0;
        const newSen = oldSen + senGain;
        if (Math.floor(newSen / 30) > Math.floor(oldSen / 30)) {
          lewdGain += 15;
          extraText.push('임계점 돌파! 음란이 크게 상승!');
        }
        break;

      case 'AT_OBSESSIVE_BOND': // 집착결속: 최고 부위 3배, 나머지 동결
        const maxPart = this.PARTS.reduce((max, p) => (sen[p] || 0) > (sen[max] || 0) ? p : max, 'mouth');
        if (primaryPart === maxPart) {
          senGain *= 3;
          loveGain += 2;
          extraText.push('집착 부위. 강렬한 반응과 연모.');
        } else {
          senGain = 0;
          extraText.push('관심 없는 부위... 무반응.');
        }
        break;

      case 'AT_ACCUMULATIVE': // 축적형: 표시 안 됨, 임계점마다 일괄 공개
        extraText.push('반응을 감추고 있다... (???)');
        // Sensitivity still increases internally
        break;

      case 'AT_ARMOR_SEAL': // 갑옷 봉인: 해금 시 중간부터 시작
        // Handled in getAvailableParts. If unlocked, bonus start
        break;

      case 'AT_DISSOLVING_BODY': // 용해체질: 피부도 동시 상승, 음란 1.5배
        if (primaryPart !== 'skin') {
          sen.skin = (sen.skin || 0) + Math.floor(senGain * 0.5);
          extraText.push('피부 감도도 동시에 상승.');
        }
        lewdGain = Math.floor(lewdGain * 1.5);
        break;

      case 'AT_LEARNING_RESPONSE': // 학습형 반응: 같은 부위 연속이면 가속
        if (!unit._lastTrainPart) unit._lastTrainPart = null;
        if (!unit._trainCombo) unit._trainCombo = 0;
        if (unit._lastTrainPart === primaryPart) {
          unit._trainCombo++;
          senGain = Math.floor(senGain * (1 + unit._trainCombo * 0.2));
          extraText.push(`연속 자극 ${unit._trainCombo + 1}회! 반응 가속.`);
        } else {
          unit._trainCombo = 0;
        }
        unit._lastTrainPart = primaryPart;
        break;

      case 'AT_TRUST_UNLOCK': // 신뢰개방: 잠긴 부위 시도 시 반감
        // Handled in getAvailableParts
        break;

      case 'AT_TENTACLE_SENSE': // 촉수감각: 피부 2배, 피부 높으면 음란 1.5배
        if (primaryPart === 'skin') senGain *= 2;
        if ((sen.skin || 0) > Math.max(...this.PARTS.filter(p => p !== 'skin').map(p => sen[p] || 0))) {
          lewdGain = Math.floor(lewdGain * 1.5);
        }
        break;

      case 'AT_GUARD_RELEASE': // 보호벽 해제: 해금 시 연모 대량 상승
        // Check if just unlocked
        break;

      case 'AT_BOUNDARY_DISSOLVE': // 경계용해: 반감 불가, 공포 2배, 음란=연모
        resentGain = 0;
        fearGain = action.intensity * 2;
        loveGain = lewdGain;
        extraText.push('반감 없이 공포와 연모가 상승.');
        break;

      case 'AT_ABYSS_LONELINESS': // 심연의 고독: 전부위 동시 상승, 연모 3배
        for (const p of this.PARTS) {
          if (p !== primaryPart) sen[p] = (sen[p] || 0) + Math.floor(senGain * 0.5);
        }
        senGain *= 2;
        loveGain = action.intensity * 3;
        extraText.push('전 부위가 동시에 반응. 연모가 크게 상승.');
        break;

      case 'AT_SELECTIVE_RESPONSE': // 선별반응: 반응 부위 2배
        if (unit._selectiveParts && unit._selectiveParts.includes(primaryPart)) {
          senGain *= 2;
          extraText.push('반응하는 부위! 감도가 크게 상승.');
        }
        break;

      case 'AT_ANALYSIS_REFUSAL': // 분석거부: 같은 행위 연속 시 반감
        if (!unit._lastTrainAction) unit._lastTrainAction = null;
        if (unit._lastTrainAction === actionId) {
          resentGain += 3;
          lewdGain = 0;
          extraText.push('패턴을 간파했다. 반감 상승!');
        } else {
          lewdGain = Math.floor(lewdGain * 1.3);
          extraText.push('새로운 자극에 반응.');
        }
        unit._lastTrainAction = actionId;
        break;

      case 'AT_REFINED_SENSITIVITY': // 정제감도: 최고 1개만 유지, 나머지 감소
        // After applying, reduce all except highest
        break;

      case 'AT_POISON_SENSITIVITY': // 독감도: 음란 높을수록 스태미나 추가 소모
        const extraCost = Math.floor(gs.lewdness / 30);
        if (extraCost > 0) {
          extraText.push(`독기 역류! 추가 스태미나 -${extraCost}`);
        }
        resentGain = 0; // 본인은 불쾌해하지 않음
        break;

      case 'AT_CLEANLINESS_OBSESSION': // 결벽증: 음란 오르면 반감도 동시 (1:0.5)
        resentGain = Math.floor(lewdGain * 0.5);
        if (gs.submission >= 30) {
          resentGain = Math.floor(lewdGain * 0.2);
          extraText.push('복종으로 반감 비율이 감소.');
        }
        if (gs.resentment > gs.lewdness) {
          extraText.push('반감이 음란을 넘었다. 조교 거부 상태!');
          senGain = 0;
          lewdGain = 0;
        }
        break;

      case 'AT_RECORD_CONSTITUTION': // 기록체질: 같은 행위 반복 시 효율 감소
        if (!unit._trainHistory) unit._trainHistory = {};
        const key = `${primaryPart}_${actionId}`;
        unit._trainHistory[key] = (unit._trainHistory[key] || 0) + 1;
        const repeats = unit._trainHistory[key];
        const efficiency = Math.max(0.3, 1 - (repeats - 1) * 0.1);
        senGain = Math.floor(senGain * efficiency);
        if (repeats === 1) {
          senGain = Math.floor(senGain * 1.2);
          extraText.push('새로운 조합! 보너스 +20%');
        } else if (repeats >= 5) {
          extraText.push(`${repeats}회 반복... 효율 ${Math.floor(efficiency * 100)}%`);
        }
        loveGain = Math.floor(Object.keys(unit._trainHistory).length * 0.3);
        break;

      case 'AT_REVERSE_REFINE': // 역정제: 복종 불가, 음란=반감, 연모 50이상이면 해제
        submissionGain = 0;
        if (gs.love < 50) {
          resentGain = lewdGain;
          extraText.push('플레이어를 분석한다. 반감이 음란과 동시 상승.');
        } else {
          resentGain = 0;
          if (gs.love >= 80) submissionGain = action.intensity;
          extraText.push('연모에 의해 저항이 풀리고 있다.');
        }
        break;

      case 'AT_SINGLE_FOCUS': // 단일집중: 첫 고감도 부위 고정
        if (!unit._focusPart) {
          // Not yet determined — first training sets it
          unit._focusPart = primaryPart;
          extraText.push(`${this.PART_NAMES[primaryPart]}이(가) 집중 부위로 고정되었다!`);
        }
        if (primaryPart === unit._focusPart) {
          senGain *= 3;
          lewdGain = Math.floor(lewdGain * 1.5);
          extraText.push('집중 부위! 강렬한 반응.');
        } else {
          senGain = Math.floor(senGain * 0.3);
          lewdGain = 0;
          extraText.push('집중 부위가 아니라 거의 무반응.');
        }
        break;

      case 'AT_TRACKING_SENSE': // 추적감각: 이전 최다 자극 부위 기억
        if (!unit._trackHistory) unit._trackHistory = {};
        unit._trackHistory[primaryPart] = (unit._trackHistory[primaryPart] || 0) + 1;
        const mostStimulated = Object.entries(unit._trackHistory).reduce((a, b) => b[1] > a[1] ? b : a, ['', 0])[0];
        if (primaryPart === mostStimulated) {
          lewdGain = Math.floor(lewdGain * 1.5);
          loveGain += 1;
          extraText.push('기억하는 부위... 음란과 연모 상승.');
        } else {
          resentGain += 1;
          extraText.push('다른 부위에 소량 반감.');
        }
        break;

      // Remaining traits with simpler mechanics
      case 'AT_EXCESS_ACCUMULATION': // 과잉축적: 경험치 1.5배
        senGain = Math.floor(senGain * 1.0);
        break;

      case 'AT_INFILTRATION_SENSE': // 침투감도: 순서 강제 (handled in getAvailableParts)
        break;

      case 'AT_DISSECTION_PART': // 부위분리
      case 'AT_ANESTHESIA_SENSE': // 마취감도
      case 'AT_ANATOMY_SENSE': // 해부감도
      case 'AT_PERSISTENT_TRACKING': // 집요추적
        // These use default mechanics
        break;

      default:
        // Unknown trait — use defaults
        break;
    }

    // ═══ 다중 부위 감도 적용 ═══
    for (const pr of partResults) {
      sen[pr.part] = (sen[pr.part] || 0) + pr.gain;
    }

    // Apply global state changes
    gs.lewdness = Math.max(0, Math.min(100, (gs.lewdness || 0) + lewdGain));
    gs.submission = Math.max(0, Math.min(100, (gs.submission || 0) + submissionGain));
    gs.fear = Math.max(0, Math.min(100, (gs.fear || 0) + fearGain));
    gs.resentment = Math.max(0, Math.min(100, (gs.resentment || 0) + resentGain));
    gs.love = Math.max(0, Math.min(100, (gs.love || 0) + loveGain));

    // v2: 침염/변용 진행 (v1 위 비파괴 추가 레이어)
    this._applyChimyeomVariation(unit, { 연모: loveGain, 복종: submissionGain, 음란: lewdGain, 공포: fearGain, 반감: resentGain }, totalSenGain * 5); // ×5 = v1 senGain 스케일 보정(잠정)

    // Post-processing for 정제감도
    if (adultTrait === 'AT_REFINED_SENSITIVITY') {
      const maxP = this.PARTS.reduce((a, b) => (sen[a] || 0) >= (sen[b] || 0) ? a : b);
      for (const p of this.PARTS) {
        if (p !== maxP && (sen[p] || 0) > 0) {
          sen[p] = Math.max(0, (sen[p] || 0) - 2);
        }
      }
    }

    // ═══ 다중 부위 경험치 적용 ═══
    let totalPartExpGain = 0;
    for (const target of action.targets) {
      if (lockedParts.has(target.part)) continue;
      const peg = Math.floor((action.intensity * target.ratio * 3 + 2) * repeatMul);
      unit._partExp[target.part] = (unit._partExp[target.part] || 0) + peg;
      totalPartExpGain += peg;

      // 마일스톤 체크
      const oldMs = this.getPartMilestone((unit._partExp[target.part] || 0) - peg);
      const newMs = this.getPartMilestone(unit._partExp[target.part]);
      if (newMs.label !== oldMs.label) {
        extraText.push(`★ ${this.PART_NAMES[target.part]} 개발도 상승! → 【${newMs.label}】 ${newMs.desc}`);
      }
    }

    // Adult experience gain
    const sigilMul = this.getSigilMul(unit.sigil);
    unit.exp.adult = (unit.exp.adult || 0) + Math.floor(15 * sigilMul);
    unit.exp.personality = (unit.exp.personality || 0) + Math.floor(5 * sigilMul);

    // ═══ 세분화 경험치 (ERA식) ═══
    if (!unit.detailedExp) unit.detailedExp = { kiss:0, caress:0, stimulate:0, lick:0, insert:0, toy:0, orgasm:0, service:0, discipline:0, exposure:0, totalSessions:0 };
    const de = unit.detailedExp;
    de.totalSessions++;

    // 행위별 경험치 (expKey 사용)
    if (action.expKey && de[action.expKey] !== undefined) {
      de[action.expKey] += action.intensity;
    }

    // 기존 actionExpMap 호환
    const actionExpMap = {
      caress: 'caress', tease: 'caress',
      stimulate: 'stimulate', press: 'stimulate',
      lick: 'lick', deepkiss: 'kiss',
      insert: 'insert', toy: 'toy',
      discipline: 'discipline', tool: 'toy'
    };
    const expKey = actionExpMap[actionId];
    if (expKey && de[expKey] !== undefined) {
      de[expKey] += action.intensity;
    }

    // 키스경험: 입 부위 행위 시
    if (primaryPart === 'mouth') de.kiss += action.intensity;

    // 봉사경험: 복종 30 이상일 때 조교하면
    if ((gs.submission || 0) >= 30) de.service += action.intensity;

    // 노출경험: 음란 50 이상일 때
    if ((gs.lewdness || 0) >= 50) de.exposure += action.intensity;

    // 절정 판정: 음란 90 이상 + 감도 높은 부위 자극 시 확률적 절정
    if ((gs.lewdness || 0) >= 90 && (sen[primaryPart] || 0) >= 50) {
      if (Math.random() < 0.3) {
        de.orgasm++;
        gs.lewdness = Math.max(0, (gs.lewdness || 0) - 20); // 절정 후 음란 감소
        extraText.push(`★ 절정! (${de.orgasm}회째) 음란이 감소했다.`);
      }
    }

    // Level up check
    const leveled = this.checkUnitLevelUp(unit);

    return {
      success: true,
      action: action.name,
      partResults,        // [{part, partName, gain}, ...]
      totalSenGain,
      totalPartExpGain,
      leveled,
      lewdGain, submissionGain, fearGain, resentGain, loveGain,
      extraText,
      repeatMul,          // 반복 효율 (UI 표시용)
      repeatStreak: rt.streak, // 연속 횟수
      sensitivity: { ...sen },
      globalState: { ...gs }
    };
  }

  // Helper: get adult trait ID from unit
  getAdultTrait(unit) {
    const def = this.engine.getUnitDef(unit.unitId);
    return def && def.adultTrait ? def.adultTrait.id : null;
  }

  getAdultTraitName(unit) {
    const def = this.engine.getUnitDef(unit.unitId);
    return def && def.adultTrait ? def.adultTrait.name : '없음';
  }

  getAdultTraitDesc(unit) {
    const def = this.engine.getUnitDef(unit.unitId);
    return def && def.adultTrait ? def.adultTrait.description : '';
  }

  getAffectionStage(affection) {
    if (affection < 15) return 0;  // 경계
    if (affection < 35) return 1;  // 인지
    if (affection < 55) return 2;  // 친밀
    if (affection < 75) return 3;  // 신뢰
    if (affection < 90) return 4;  // 유대
    return 5;                       // 헌신
  }

  // 조교 도구: 로터가 있으면 true (도구 시스템 v0.1)
  hasTrainingTool() {
    // 로터가 도구 목록에 있고 부품이 하나라도 있으면 사용 가능
    const rotor = this.engine.state.tools?.rotor;
    return rotor != null; // 기본 지급이므로 항상 true
  }

  // 교본 도구 여부
  hasTextbook() {
    const textbook = this.engine.state.tools?.textbook;
    return textbook != null;
  }

  // 도구 게이팅 기반 조교 효율
  getToolEfficiency() {
    return this.engine.getTrainingBonus('adult');
  }

  getSigilMul(sigil) {
    const muls = { 1: 0.8, 2: 0.9, 3: 1.3, 4: 1.0, 5: 0.7, 6: 1.2, 7: 0.9 };
    return muls[sigil] || 1.0;
  }

  checkUnitLevelUp(unit) {
    const totalExp = Object.values(unit.exp).reduce((s, v) => s + v, 0);
    const threshold = unit.level * 100;
    if (totalExp < threshold) return null;
    unit.level++;
    const g = { '요괴':{hp:5,atk:3,def:2,spd:2}, '정령':{hp:5,atk:2,def:2,spd:2}, '인조':{hp:6,atk:2,def:3,spd:1}, '야수':{hp:4,atk:2,def:1,spd:3}, '환상':{hp:3,atk:2,def:2,spd:2} };
    const gr = g[unit.category] || g['정령'];
    unit.maxHp += gr.hp; unit.hp = unit.maxHp; unit.atk += gr.atk; unit.def += gr.def; unit.spd += gr.spd;
    return { newLevel: unit.level };
  }

  // Get milestone for part experience level
  // v2: 침염/변용 진행 — v1 globalState 위에 얹는 추가 레이어 (비파괴).
  _applyChimyeomVariation(unit, gains, pleasureGain) {
    if (!unit.침염) unit.침염 = {};
    if (!unit.변용도) unit.변용도 = {};
    if (!unit._session) unit._session = { pleasure: 0, gain: {} };
    const sess = unit._session;
    sess.pleasure += (pleasureGain || 0);
    for (const k of Object.keys(gains)) {
      if (gains[k] > 0) sess.gain[k] = (sess.gain[k] || 0) + gains[k];
    }
    const result = { 절정: false, 침염: null, 변용: null };
    const 내성 = (unit.역가 && unit.역가.내성) ? Math.max(0, ...Object.values(unit.역가.내성)) : 0;
    const 절정임계 = 100 + 내성 * 20;
    if (sess.pleasure >= 절정임계 && Object.keys(sess.gain).length) {
      result.절정 = true;
      sess.pleasure = 0;
      const type = Object.keys(sess.gain).sort((a, b) => sess.gain[b] - sess.gain[a])[0];
      unit.침염[type] = (unit.침염[type] || 0) + 1;
      result.침염 = type;
      const view = {
        침염: unit.침염, 변용도: unit.변용도, 변용잠금: unit.변용잠금,
        호감도: unit.affection || 0, 감도: unit.sensitivity || {},
        역가: unit.역가 || { 숙련: {} },
      };
      result.변용 = TE.advanceVariation(view, TE.ROUTE_OF[type] || '붕괴');
      unit.변용잠금 = view.변용잠금;
      sess.gain = {};
    }
    unit._lastChimyeom = result;
    return result;
  }

  getPartMilestone(exp) {
    let result = this.PART_MILESTONES[0];
    for (const m of this.PART_MILESTONES) {
      if (exp >= m.exp) result = m;
      else break;
    }
    return result;
  }
}

module.exports = TrainingSystem;
