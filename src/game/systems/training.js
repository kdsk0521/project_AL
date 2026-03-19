'use strict';

// Training System (조교소) — Adult content training with per-unit trait mechanics
// Body parts: mouth(입), chest(가슴), v(V), c(C), anal(애널), skin(피부)
// Actions: caress(애무), stimulate(자극), tease(간지럼), press(압박), lick(핥기), tool(도구사용)
// Global states: love(연모), submission(복종), lewdness(음란), fear(공포), resentment(반감)

class TrainingSystem {
  constructor(engine) {
    this.engine = engine;

    this.PARTS = ['mouth', 'chest', 'v', 'c', 'anal', 'skin'];
    this.PART_NAMES = { mouth: '입', chest: '가슴', v: 'V', c: 'C', anal: '애널', skin: '피부' };

    // Part experience milestones: exp → bonus description
    this.PART_MILESTONES = [
      { exp: 0,   label: '미개발',   senMul: 1.0, desc: '아직 반응이 약하다.' },
      { exp: 20,  label: '민감',     senMul: 1.2, desc: '조금씩 반응하기 시작한다.' },
      { exp: 50,  label: '익숙',     senMul: 1.5, desc: '자극에 익숙해지며 반응이 커졌다.' },
      { exp: 100, label: '개발됨',   senMul: 1.8, desc: '완전히 개발되어 강하게 반응한다.' },
      { exp: 180, label: '과민',     senMul: 2.2, desc: '가벼운 자극에도 크게 반응한다.' },
      { exp: 300, label: '조교완료', senMul: 2.5, desc: '완벽하게 길들여졌다.' }
    ];

    // Action × Part effectiveness matrix
    // Values: 효과 배율 (1.0 = 기본, >1 = 효과적, <1 = 비효과적)
    // Row = action, Col = part (mouth, chest, v, c, anal, skin)
    this.ACTION_PART_MATRIX = {
      caress:     { mouth: 0.8, chest: 1.2, v: 0.9, c: 1.0, anal: 0.7, skin: 1.5 },
      tease:      { mouth: 0.7, chest: 1.3, v: 0.8, c: 1.4, anal: 0.6, skin: 1.3 },
      stimulate:  { mouth: 1.0, chest: 1.2, v: 1.3, c: 1.5, anal: 1.0, skin: 0.8 },
      lick:       { mouth: 1.5, chest: 1.3, v: 1.4, c: 1.6, anal: 1.2, skin: 0.9 },
      press:      { mouth: 0.6, chest: 1.4, v: 1.2, c: 0.8, anal: 1.3, skin: 1.1 },
      toy:        { mouth: 1.0, chest: 1.1, v: 1.5, c: 1.3, anal: 1.5, skin: 0.7 },
      insert:     { mouth: 0.5, chest: 0.3, v: 2.0, c: 0.5, anal: 1.8, skin: 0.2 },
      deepkiss:   { mouth: 2.0, chest: 0.5, v: 0.3, c: 0.3, anal: 0.2, skin: 0.5 },
      discipline: { mouth: 1.2, chest: 1.3, v: 1.5, c: 1.5, anal: 1.4, skin: 1.0 },
      tool:       { mouth: 0.8, chest: 1.2, v: 1.4, c: 1.3, anal: 1.3, skin: 1.0 }
    };

    // Action × Part special flavor text
    this.ACTION_PART_FLAVOR = {
      'caress_skin':    '전신을 부드럽게 어루만진다.',
      'caress_chest':   '가슴을 부드럽게 주무른다.',
      'caress_mouth':   '입술을 손가락으로 어루만진다.',
      'lick_mouth':     '입술을 혀로 훑는다.',
      'lick_chest':     '가슴을 혀로 핥는다.',
      'lick_v':         '예민한 곳을 혀로 자극한다.',
      'lick_c':         '가장 민감한 곳을 집중적으로 핥는다.',
      'stimulate_c':    '작은 돌기를 손가락으로 집중 자극한다.',
      'stimulate_v':    '내부를 손가락으로 자극한다.',
      'press_chest':    '가슴을 강하게 움켜쥔다.',
      'press_anal':     '뒤쪽을 강하게 압박한다.',
      'insert_v':       '천천히 삽입한다.',
      'insert_anal':    '뒤쪽으로 삽입한다.',
      'deepkiss_mouth': '혀를 깊이 넣어 입 안을 탐색한다.',
      'tease_c':        '살짝살짝 건드려 간지럽힌다.',
      'tease_skin':     '피부를 손끝으로 가볍게 훑는다.',
      'discipline_v':   '거칠게 몰아붙인다.',
      'discipline_c':   '민감한 곳을 집요하게 조련한다.',
      'toy_v':          '장난감을 삽입하여 진동시킨다.',
      'toy_anal':       '뒤쪽에 장난감을 넣는다.',
    };

    // Actions with unlock conditions (tier-based progression)
    // unlock: { lewdness, affection, partSensitivity } — all conditions must be met
    this.ACTIONS = [
      // Tier 1: 기본 (always available)
      { id: 'caress',    name: '애무',     intensity: 1, desc: '부드럽게 어루만진다', tier: 1, unlock: null },
      { id: 'tease',     name: '간지럼',   intensity: 1, desc: '가볍게 간지럽힌다',  tier: 1, unlock: null },
      // Tier 2: 음란 15+ or 친밀
      { id: 'stimulate', name: '자극',     intensity: 2, desc: '적극적으로 자극한다', tier: 2, unlock: { lewdness: 15, affection: 2 } },
      { id: 'lick',      name: '핥기',     intensity: 2, desc: '혀로 핥는다',        tier: 2, unlock: { lewdness: 15, affection: 2 } },
      // Tier 3: 음란 35+ and 신뢰
      { id: 'press',     name: '압박',     intensity: 3, desc: '강하게 압박한다',    tier: 3, unlock: { lewdness: 35, affection: 3 } },
      { id: 'toy',       name: '장난감',   intensity: 3, desc: '장난감을 사용한다',  tier: 2, unlock: { lewdness: 20 }, requiresTool: true },
      // Tier 4: 음란 55+ and 신뢰, 해당 부위 감도 20+
      { id: 'insert',    name: '삽입',     intensity: 4, desc: '직접 삽입한다',      tier: 4, unlock: { lewdness: 55, affection: 3, partSensitivity: 20 }, partsOnly: ['v', 'anal'] },
      { id: 'deepkiss',  name: '딥키스',   intensity: 3, desc: '깊은 키스를 한다',   tier: 4, unlock: { lewdness: 55, affection: 3, partSensitivity: 20 }, partsOnly: ['mouth'] },
      // Tier 5: 음란 75+ and 유대, 해당 부위 감도 40+
      { id: 'discipline',name: '조련',     intensity: 5, desc: '본격적으로 조련한다', tier: 5, unlock: { lewdness: 75, affection: 4, partSensitivity: 40 } },
      // Tool: 도구 필요
      { id: 'tool',      name: '도구 사용', intensity: 3, desc: '조교 도구를 사용한다', tier: 1, unlock: null, requiresTool: true }
    ];
  }

  // Get available actions for a unit + specific body part
  getAvailableActions(unit, partId) {
    const gs = unit.globalState;
    const affStage = this.getAffectionStage(unit.affection);
    const partSen = unit.sensitivity[partId] || 0;
    const hasTool = this.hasTrainingTool();

    return this.ACTIONS.map(a => {
      let locked = false;
      let lockReason = '';

      // Check part restriction
      if (a.partsOnly && !a.partsOnly.includes(partId)) {
        locked = true;
        lockReason = `${a.partsOnly.map(p => this.PART_NAMES[p]).join('/')} 전용`;
      }

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
          lockReason = `음란 ${req.lewdness} 필요 (현재: ${gs.lewdness || 0})`;
        }
        if (!locked && req.affection && affStage < req.affection) {
          const stageNames = ['경계','인지','친밀','신뢰','유대','헌신'];
          locked = true;
          lockReason = `호감도 ${stageNames[req.affection]} 이상 필요`;
        }
        if (!locked && req.partSensitivity && partSen < req.partSensitivity) {
          locked = true;
          lockReason = `${this.PART_NAMES[partId]} 감도 ${req.partSensitivity} 필요 (현재: ${partSen})`;
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

  // Execute a training action
  execute(unit, partId, actionId, hasTool = false) {
    if (!unit) return { success: false, reason: '유닛 없음' };

    const adultTrait = this.getAdultTrait(unit);
    const action = this.ACTIONS.find(a => a.id === actionId);
    if (!action) return { success: false, reason: '행위 없음' };

    if (action.requiresTool && !hasTool) {
      return { success: false, reason: '조교 도구가 필요합니다.' };
    }

    // === Action × Part matrix multiplier ===
    const matrixMul = (this.ACTION_PART_MATRIX[actionId] && this.ACTION_PART_MATRIX[actionId][partId]) || 1.0;

    // === Part experience multiplier ===
    if (!unit._partExp) unit._partExp = {};
    const partExp = unit._partExp[partId] || 0;
    const partMilestone = this.getPartMilestone(partExp);

    // Base sensitivity gain (action intensity × matrix × part experience)
    let senGain = Math.floor((action.intensity * 2 + Math.floor(Math.random() * 3)) * matrixMul * partMilestone.senMul);
    // Base global state changes (also scaled by matrix)
    let lewdGain = Math.floor(action.intensity * Math.max(0.5, matrixMul));
    let submissionGain = Math.floor(action.intensity * 0.5);
    let fearGain = 0;
    let resentGain = 0;
    let loveGain = 0;
    let targetPart = partId;
    let extraText = [];

    // Flavor text from matrix
    const flavorKey = `${actionId}_${partId}`;
    if (this.ACTION_PART_FLAVOR[flavorKey]) {
      extraText.push(this.ACTION_PART_FLAVOR[flavorKey]);
    }

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
        if ((sen[partId] || 0) < 5) {
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
        if (!hasTool && partId !== 'skin') {
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
        const otherParts = this.PARTS.filter(p => p !== partId);
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
        if (unit._plasticParts.length < 3 && !unit._plasticParts.includes(partId)) {
          unit._plasticParts.push(partId);
        }
        if (unit._plasticParts.includes(partId)) {
          senGain *= 2;
          extraText.push('각인된 부위. 반응이 강하다.');
        } else {
          senGain = Math.floor(senGain * 0.5);
        }
        break;

      case 'AT_NUMB_CONSTITUTION': // 둔감체질: 0.3배, 임계점마다 음란 +15
        senGain = Math.floor(senGain * 0.3);
        const oldSen = sen[partId] || 0;
        const newSen = oldSen + senGain;
        if (Math.floor(newSen / 30) > Math.floor(oldSen / 30)) {
          lewdGain += 15;
          extraText.push('임계점 돌파! 음란이 크게 상승!');
        }
        break;

      case 'AT_OBSESSIVE_BOND': // 집착결속: 최고 부위 3배, 나머지 동결
        const maxPart = this.PARTS.reduce((max, p) => (sen[p] || 0) > (sen[max] || 0) ? p : max, 'mouth');
        if (partId === maxPart) {
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
        if (partId !== 'skin') {
          sen.skin = (sen.skin || 0) + Math.floor(senGain * 0.5);
          extraText.push('피부 감도도 동시에 상승.');
        }
        lewdGain = Math.floor(lewdGain * 1.5);
        break;

      case 'AT_LEARNING_RESPONSE': // 학습형 반응: 같은 부위 연속이면 가속
        if (!unit._lastTrainPart) unit._lastTrainPart = null;
        if (!unit._trainCombo) unit._trainCombo = 0;
        if (unit._lastTrainPart === partId) {
          unit._trainCombo++;
          senGain = Math.floor(senGain * (1 + unit._trainCombo * 0.2));
          extraText.push(`연속 자극 ${unit._trainCombo + 1}회! 반응 가속.`);
        } else {
          unit._trainCombo = 0;
        }
        unit._lastTrainPart = partId;
        break;

      case 'AT_TRUST_UNLOCK': // 신뢰개방: 잠긴 부위 시도 시 반감
        // Handled in getAvailableParts
        break;

      case 'AT_TENTACLE_SENSE': // 촉수감각: 피부 2배, 피부 높으면 음란 1.5배
        if (partId === 'skin') senGain *= 2;
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
          if (p !== partId) sen[p] = (sen[p] || 0) + Math.floor(senGain * 0.5);
        }
        senGain *= 2;
        loveGain = action.intensity * 3;
        extraText.push('전 부위가 동시에 반응. 연모가 크게 상승.');
        break;

      case 'AT_SELECTIVE_RESPONSE': // 선별반응: 반응 부위 2배
        if (unit._selectiveParts && unit._selectiveParts.includes(partId)) {
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
        const key = `${partId}_${actionId}`;
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
          unit._focusPart = partId;
          extraText.push(`${this.PART_NAMES[partId]}이(가) 집중 부위로 고정되었다!`);
        }
        if (partId === unit._focusPart) {
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
        unit._trackHistory[partId] = (unit._trackHistory[partId] || 0) + 1;
        const mostStimulated = Object.entries(unit._trackHistory).reduce((a, b) => b[1] > a[1] ? b : a, ['', 0])[0];
        if (partId === mostStimulated) {
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

    // Apply sensitivity change
    sen[targetPart] = (sen[targetPart] || 0) + senGain;

    // Apply global state changes
    gs.lewdness = Math.max(0, Math.min(100, (gs.lewdness || 0) + lewdGain));
    gs.submission = Math.max(0, Math.min(100, (gs.submission || 0) + submissionGain));
    gs.fear = Math.max(0, Math.min(100, (gs.fear || 0) + fearGain));
    gs.resentment = Math.max(0, Math.min(100, (gs.resentment || 0) + resentGain));
    gs.love = Math.max(0, Math.min(100, (gs.love || 0) + loveGain));

    // Post-processing for 정제감도
    if (adultTrait === 'AT_REFINED_SENSITIVITY') {
      const maxP = this.PARTS.reduce((a, b) => (sen[a] || 0) >= (sen[b] || 0) ? a : b);
      for (const p of this.PARTS) {
        if (p !== maxP && (sen[p] || 0) > 0) {
          sen[p] = Math.max(0, (sen[p] || 0) - 2);
        }
      }
    }

    // Part experience gain (based on action intensity × matrix effectiveness)
    const partExpGain = Math.floor(action.intensity * matrixMul * 3 + 2);
    unit._partExp[targetPart] = (unit._partExp[targetPart] || 0) + partExpGain;

    // Check for part milestone upgrade
    const newMilestone = this.getPartMilestone(unit._partExp[targetPart]);
    if (newMilestone.label !== partMilestone.label) {
      extraText.push(`★ ${this.PART_NAMES[targetPart]} 개발도 상승! → 【${newMilestone.label}】 ${newMilestone.desc}`);
    }

    // Adult experience gain
    const sigilMul = this.getSigilMul(unit.sigil);
    unit.exp.adult = (unit.exp.adult || 0) + Math.floor(15 * sigilMul);
    unit.exp.personality = (unit.exp.personality || 0) + Math.floor(5 * sigilMul);

    // ═══ 세분화 경험치 (ERA식) ═══
    if (!unit.detailedExp) unit.detailedExp = { kiss:0, caress:0, stimulate:0, lick:0, insert:0, toy:0, orgasm:0, service:0, discipline:0, exposure:0, totalSessions:0 };
    const de = unit.detailedExp;
    de.totalSessions++;

    // 행위별 경험치
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
    if (targetPart === 'mouth') de.kiss += action.intensity;

    // 봉사경험: 복종 30 이상일 때 조교하면
    if ((gs.submission || 0) >= 30) de.service += action.intensity;

    // 노출경험: 음란 50 이상일 때
    if ((gs.lewdness || 0) >= 50) de.exposure += action.intensity;

    // 절정 판정: 음란 90 이상 + 감도 높은 부위 자극 시 확률적 절정
    if ((gs.lewdness || 0) >= 90 && (sen[targetPart] || 0) >= 50) {
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
      part: this.PART_NAMES[targetPart],
      action: action.name,
      senGain,
      partExpGain,
      partMilestone: newMilestone.label,
      matrixMul,
      leveled,
      lewdGain, submissionGain, fearGain, resentGain, loveGain,
      extraText,
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

  hasTrainingTool() {
    const inv = this.engine.state.inventory;
    for (const [matId, qty] of Object.entries(inv)) {
      if (qty <= 0) continue;
      // Check by ID pattern
      if (matId.includes('ROTOR') || matId.includes('TOOL_TRAIN') || matId.includes('조교')) return true;
      const mat = this.engine.data.materials.find(m => m.id === matId);
      if (mat && mat.category === 'tool_training') return true;
      if (mat && (mat.name || '').includes('로터')) return true;
      if (mat && (mat.name || '').includes('조교')) return true;
      if (mat && mat.tags) {
        const funcs = mat.tags.functions || (mat.tags.function ? [mat.tags.function] : []);
        if (funcs.includes('조련')) return true;
      }
    }
    return false;
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
