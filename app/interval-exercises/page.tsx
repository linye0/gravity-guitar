'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ROOT_NOTES, INTERVAL_DATA } from '@/lib/notes';
import { getAudioContext, playToneSequence, clearOscillators, type ToneSpec } from '@/lib/audio';
import styles from './page.module.css';

type Mode = 'fixed' | 'dynamic';
type Register = 'high' | 'low' | 'random';
type CtxState = 'IDLE' | 'REACTION' | 'SINGING' | 'TRANSITION';

export default function IntervalExercisesPage() {
  const [mode, setMode] = useState<Mode>('fixed');
  const [fixedRoot, setFixedRoot] = useState(0);
  const [droneOctave, setDroneOctave] = useState(1);
  const [register, setRegister] = useState<Register>('high');
  const [useReferenceDo, setUseReferenceDo] = useState(true);
  const [reactionMs, setReactionMs] = useState(1200);
  const [singingMs, setSingingMs] = useState(2000);
  const [activeNoteIds, setActiveNoteIds] = useState([0, 2, 4, 5, 7, 9, 11]);
  const [switchInterval, setSwitchInterval] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [ctxState, setCtxState] = useState<CtxState>('IDLE');
  const [currentTargetId, setCurrentTargetId] = useState<number | null>(null);
  const [rootIndex, setRootIndex] = useState(0);
  const [roundsCounter, setRoundsCounter] = useState(0);
  const [statusText, setStatusText] = useState('就绪，请点击上方绿色按钮开始');
  const [feedbackText, setFeedbackText] = useState('');
  const [regBadgeText, setRegBadgeText] = useState('--');
  const [progressWidth, setProgressWidth] = useState(0);
  const [progressClass, setProgressClass] = useState('');
  const [flashMap, setFlashMap] = useState<Record<number, 'correct' | 'wrong' | null>>({});
  const [keyBadgeHighlight, setKeyBadgeHighlight] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const droneOscRef = useRef<OscillatorNode | null>(null);
  const droneGainRef = useRef<GainNode | null>(null);
  const activeOscsRef = useRef<OscillatorNode[]>([]);
  const stateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const progressStartRef = useRef(0);
  const progressDurationRef = useRef(0);
  const lastTargetIdRef = useRef<number | null>(null);
  const lastTargetCountRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const forceRootNextRef = useRef(false);
  const isPausedRef = useRef(false);
  const currentTargetOctaveMulRef = useRef(2);
  const currentTargetFreqRef = useRef(0);
  const currentTargetIdRef = useRef<number | null>(null);
  const handleTimeoutExceededRef = useRef<() => void>(() => {});

  isPausedRef.current = isPaused;

  const clearTimers = useCallback(() => {
    if (stateTimeoutRef.current) {
      clearTimeout(stateTimeoutRef.current);
      stateTimeoutRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const clearActiveOscs = useCallback(() => {
    clearOscillators({ current: activeOscsRef.current });
  }, []);

  const setButtonsDisabled = useCallback(
    (disabled: boolean) => {
      setFlashMap({});
    },
    []
  );

  const updateRootNote = useCallback(
    (newIndex: number) => {
      setRootIndex(newIndex);
      const droneOctaveMul = droneOctave;
      const newRootFreq = ROOT_NOTES[newIndex].freq * droneOctaveMul;
      if (droneOscRef.current && audioCtxRef.current) {
        droneOscRef.current.frequency.setTargetAtTime(newRootFreq, audioCtxRef.current.currentTime, 0.05);
      }
      setKeyBadgeHighlight(true);
      setTimeout(() => setKeyBadgeHighlight(false), 500);
    },
    [droneOctave]
  );

  const startProgressBar = useCallback(
    (type: string, duration: number) => {
      progressStartRef.current = performance.now();
      progressDurationRef.current = duration;
      let cls = '';
      if (type === 'reaction') cls = styles.barReaction;
      else if (type === 'singing') cls = styles.barSinging;
      else if (type === 'transition') cls = styles.barTransition;
      setProgressClass(cls);
      setProgressWidth(type === 'reaction' || type === 'transition' ? 100 : 0);

      const updateBar = (now: number) => {
        if (isPausedRef.current) return;
        const elapsed = now - progressStartRef.current;
        let pct = (elapsed / progressDurationRef.current) * 100;
        if (type === 'reaction' || type === 'transition') {
          pct = 100 - pct;
          if (pct < 0) pct = 0;
        } else {
          if (pct > 100) pct = 100;
        }
        setProgressWidth(pct);
        if (elapsed < progressDurationRef.current) {
          animFrameRef.current = requestAnimationFrame(updateBar);
        }
      };
      animFrameRef.current = requestAnimationFrame(updateBar);
    },
    []
  );

  const triggerNextCycle = useCallback(() => {
    if (isPausedRef.current) return;

    setFlashMap({});
    setButtonsDisabled(false);

    setRoundsCounter((prev) => {
      const next = prev + 1;

      if (mode === 'dynamic' && !isTransitioningRef.current) {
        if (next > switchInterval) {
          initiateKeyTransition();
          return next;
        }
      }
      return next;
    });

    let targetId: number;

    if (forceRootNextRef.current && activeNoteIds.includes(0)) {
      targetId = 0;
      forceRootNextRef.current = false;
      setFeedbackText('标定原点: 强制锚定新调根音 1');
    } else {
      forceRootNextRef.current = false;
      if (activeNoteIds.length > 1) {
        let candidateId: number;
        do {
          const ri = Math.floor(Math.random() * activeNoteIds.length);
          candidateId = activeNoteIds[ri];
        } while (candidateId === lastTargetIdRef.current && lastTargetCountRef.current >= 2);
        targetId = candidateId;
      } else {
        targetId = activeNoteIds[0];
      }
      setFeedbackText('用直觉锁定色彩，切勿算音程');
    }

    if (targetId === lastTargetIdRef.current) {
      lastTargetCountRef.current++;
    } else {
      lastTargetIdRef.current = targetId;
      lastTargetCountRef.current = 1;
    }

    setCurrentTargetId(targetId);
    currentTargetIdRef.current = targetId;
    setCtxState('REACTION');
    setStatusText('听音预测中...');

    let octaveMul: number;
    if (register === 'low') octaveMul = 1;
    else if (register === 'random') octaveMul = Math.random() < 0.5 ? 1 : 2;
    else octaveMul = 2;
    currentTargetOctaveMulRef.current = octaveMul;

    setRegBadgeText(octaveMul === 2 ? '靶区: 上行空间 (高)' : '靶区: 下行空间 (低)');

    const targetInterval = INTERVAL_DATA.find((n) => n.id === targetId)!;
    const rootFreq = ROOT_NOTES[rootIndex].freq * droneOctave;
    const targetFreq = rootFreq * octaveMul * Math.pow(2, targetInterval.id / 12);
    currentTargetFreqRef.current = targetFreq;

    if (audioCtxRef.current) {
      playToneSequence(audioCtxRef.current, [{ freq: targetFreq, dur: 0.8 }], {
        current: activeOscsRef.current,
      });
    }

    startProgressBar('reaction', reactionMs);
    stateTimeoutRef.current = setTimeout(() => {
      handleTimeoutExceededRef.current();
    }, reactionMs);
  }, [mode, activeNoteIds, register, rootIndex, droneOctave, reactionMs, startProgressBar, setButtonsDisabled, switchInterval]);

  const handleTimeoutExceeded = useCallback(() => {
    if (isPausedRef.current) return;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setCtxState('SINGING');
    setButtonsDisabled(true);
    setStatusText('⏱ 思考超时！');
    const targetInterval = currentTargetIdRef.current !== null ? INTERVAL_DATA.find((n) => n.id === currentTargetIdRef.current) : null;
    if (targetInterval) {
      setFeedbackText(`答案是: [ ${targetInterval.name} ] - 听声音`);
      setFlashMap({ [targetInterval.id]: 'correct' });
    }
    enterSingingPhaseCooldown();
  }, []);

  handleTimeoutExceededRef.current = handleTimeoutExceeded;

  const enterSingingPhaseCooldown = useCallback(() => {
    const duration = singingMs;
    const totalSec = duration / 1000;

    if (useReferenceDo) {
      const refDoFreq = ROOT_NOTES[rootIndex].freq * droneOctave * currentTargetOctaveMulRef.current;
      const rootDur = totalSec * 0.35;
      const targetDur = totalSec - rootDur;
      if (audioCtxRef.current) {
        playToneSequence(
          audioCtxRef.current,
          [
            { freq: refDoFreq, dur: rootDur },
            { freq: currentTargetFreqRef.current, dur: targetDur },
          ],
          { current: activeOscsRef.current }
        );
      }
    } else {
      if (audioCtxRef.current) {
        playToneSequence(audioCtxRef.current, [{ freq: currentTargetFreqRef.current, dur: totalSec }], {
          current: activeOscsRef.current,
        });
      }
    }

    startProgressBar('singing', duration);
    stateTimeoutRef.current = setTimeout(() => {
      triggerNextCycle();
    }, duration);
  }, [singingMs, useReferenceDo, rootIndex, droneOctave, startProgressBar, triggerNextCycle]);

  const handleUserAnswer = useCallback(
    (chosenId: number) => {
      if (ctxState !== 'REACTION' || isPaused) return;
      clearTimers();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setCtxState('SINGING');
      setButtonsDisabled(true);

      const tid = currentTargetIdRef.current;
      if (chosenId === tid) {
        setStatusText('✓ 直觉正确！');
        const targetInterval = INTERVAL_DATA.find((n) => n.id === tid);
        setFeedbackText(`目标正是: [ ${targetInterval?.name} ] - 请跟唱`);
        setFlashMap({ [chosenId]: 'correct' });
      } else {
        setStatusText('✗ 色彩跑偏！');
        const targetInterval = INTERVAL_DATA.find((n) => n.id === tid);
        setFeedbackText(`那是: [ ${targetInterval?.name} ] - 发声矫正`);
        setFlashMap({ [chosenId]: 'wrong', [tid!]: 'correct' });
      }

      enterSingingPhaseCooldown();
    },
    [ctxState, isPaused, clearTimers, setButtonsDisabled, enterSingingPhaseCooldown]
  );

  const initiateKeyTransition = useCallback(() => {
    isTransitioningRef.current = true;
    setCtxState('TRANSITION');
    setButtonsDisabled(true);
    setFlashMap({});
    setRoundsCounter(0);

    let newIdx = rootIndex;
    while (newIdx === rootIndex) newIdx = Math.floor(Math.random() * 12);
    updateRootNote(newIdx);

    setStatusText('⚠️ 目标音移动...');
    setRegBadgeText('锁定中');

    let countdown = 3;
    startProgressBar('transition', 3000);

    const tick = () => {
      if (isPausedRef.current) return;
      if (countdown > 0) {
        setFeedbackText(`重置听觉缓存: ${countdown} 秒...`);
        countdown--;
        stateTimeoutRef.current = setTimeout(tick, 1000);
      } else {
        forceRootNextRef.current = true;
        isTransitioningRef.current = false;
        triggerNextCycle();
      }
    };
    tick();
  }, [rootIndex, updateRootNote, startProgressBar, setButtonsDisabled, triggerNextCycle]);

  const startTrainer = useCallback(() => {
    if (isRunning) return;
    const ctx = getAudioContext();
    audioCtxRef.current = ctx;

    let initialRoot: number;
    if (mode === 'fixed') {
      initialRoot = fixedRoot;
    } else {
      initialRoot = Math.floor(Math.random() * 12);
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = ROOT_NOTES[initialRoot].freq * droneOctave;
    gain.gain.value = 0.25;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    droneOscRef.current = osc;
    droneGainRef.current = gain;

    setIsRunning(true);
    setIsPaused(false);
    isTransitioningRef.current = false;
    forceRootNextRef.current = false;
    setRoundsCounter(0);
    setStatusText('🚀 运行中');

    updateRootNote(initialRoot);
    setTimeout(() => triggerNextCycle(), 100);
  }, [isRunning, mode, fixedRoot, droneOctave, updateRootNote, triggerNextCycle]);

  const togglePause = useCallback(() => {
    if (!isRunning) return;
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);

    if (nextPaused) {
      clearTimers();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      clearActiveOscs();
      if (droneGainRef.current && audioCtxRef.current) {
        droneGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
      }
      setStatusText('⏸ 已暂停');
      setButtonsDisabled(true);
    } else {
      if (droneGainRef.current && audioCtxRef.current) {
        droneGainRef.current.gain.setTargetAtTime(0.25, audioCtxRef.current.currentTime, 0.05);
      }
      if (ctxState === 'REACTION') {
        if (audioCtxRef.current && currentTargetFreqRef.current) {
          playToneSequence(audioCtxRef.current, [{ freq: currentTargetFreqRef.current, dur: 0.8 }], {
            current: activeOscsRef.current,
          });
        }
        startProgressBar('reaction', reactionMs);
        setButtonsDisabled(false);
        setStatusText('听音预测中...');
        stateTimeoutRef.current = setTimeout(() => {
          handleTimeoutExceeded();
        }, reactionMs);
      } else if (ctxState === 'SINGING') {
        enterSingingPhaseCooldown();
      } else if (ctxState === 'TRANSITION') {
        initiateKeyTransition();
      }
    }
  }, [
    isRunning,
    isPaused,
    ctxState,
    reactionMs,
    clearTimers,
    clearActiveOscs,
    setButtonsDisabled,
    enterSingingPhaseCooldown,
    initiateKeyTransition,
    startProgressBar,
    handleTimeoutExceeded,
  ]);

  const syncActiveNotes = useCallback(
    (id: number, checked: boolean) => {
      setActiveNoteIds((prev) => {
        let next: number[];
        if (checked) {
          next = [...prev, id];
        } else {
          next = prev.filter((n) => n !== id);
        }
        if (next.length === 0) next = [0, 2, 4, 5, 7];
        return next;
      });
    },
    []
  );

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'p') {
        togglePause();
        return;
      }
      if (!isRunning || ctxState !== 'REACTION' || isPaused) return;
      const matched = INTERVAL_DATA.find((n) => n.key === key);
      if (matched && activeNoteIds.includes(matched.id)) {
        e.preventDefault();
        handleUserAnswer(matched.id);
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isRunning, ctxState, isPaused, activeNoteIds, togglePause, handleUserAnswer]);

  useEffect(() => {
    return () => {
      clearTimers();
      clearActiveOscs();
      if (droneOscRef.current) {
        try {
          droneOscRef.current.stop();
        } catch {
          // already stopped
        }
      }
    };
  }, [clearTimers, clearActiveOscs]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '20px',
        userSelect: 'none',
      }}
    >
      <Link href="/" className={styles.backLink}>
        ← 返回首页
      </Link>

      <div className={styles.container}>
        <h1 className={styles.title}>持续根音练耳器</h1>
        <div className={styles.subtitle}>训练目标音与原点(Do)的音程条件反射</div>

        <div className={styles.controlPanel}>
          <div className={styles.sectionTitle}>调性与目标音设置</div>

          <div className={styles.keyControl} style={{ marginBottom: 10 }}>
            <div className={styles.radioGroup}>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="fixed"
                  checked={mode === 'fixed'}
                  onChange={() => setMode('fixed')}
                />{' '}
                固定调
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="dynamic"
                  checked={mode === 'dynamic'}
                  onChange={() => setMode('dynamic')}
                />{' '}
                动态游走
              </label>
            </div>

            {mode === 'fixed' && (
              <div className={styles.keySettings}>
                <select
                  className={styles.select}
                  value={fixedRoot}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setFixedRoot(val);
                    if (isRunning) updateRootNote(val);
                  }}
                >
                  {ROOT_NOTES.map((note) => (
                    <option key={note.id} value={note.id}>
                      {note.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.keySettings}>
              <label style={{ fontSize: 13, color: '#a1a1aa' }}>基底音区:</label>
              <select
                className={styles.select}
                style={{ background: '#2a2a2e', borderColor: '#52525b', color: '#4ade80', fontWeight: 'bold' }}
                value={droneOctave}
                onChange={(e) => {
                  setDroneOctave(parseFloat(e.target.value));
                  if (isRunning) updateRootNote(rootIndex);
                }}
              >
                <option value={0.5}>低音区 (C2-B2)</option>
                <option value={1}>中音区 (C3-B3)</option>
                <option value={2}>高音区 (C4-B4)</option>
              </select>
            </div>

            {mode === 'dynamic' && (
              <div className={styles.keySettings} style={{ width: '100%', marginTop: 5 }}>
                <label>每隔</label>
                <input
                  type="number"
                  className={styles.numberInput}
                  value={switchInterval}
                  min={1}
                  max={50}
                  onChange={(e) => setSwitchInterval(parseInt(e.target.value) || 10)}
                />
                <label>次切换调性</label>
              </div>
            )}
          </div>

          <div className={styles.keyControl}>
            <div className={styles.radioGroup} style={{ borderTop: '1px dashed #3f3f46', paddingTop: 15, width: '100%' }}>
              <label style={{ color: '#60a5fa' }}>
                <input
                  type="radio"
                  name="register"
                  value="high"
                  checked={register === 'high'}
                  onChange={() => setRegister('high')}
                />{' '}
                靶区: 高八度 (上行)
              </label>
              <label style={{ color: '#4ade80' }}>
                <input
                  type="radio"
                  name="register"
                  value="low"
                  checked={register === 'low'}
                  onChange={() => setRegister('low')}
                />{' '}
                靶区: 低八度 (下行)
              </label>
              <label style={{ color: '#facc15' }}>
                <input
                  type="radio"
                  name="register"
                  value="random"
                  checked={register === 'random'}
                  onChange={() => setRegister('random')}
                />{' '}
                靶区: 随机频段突袭
              </label>
            </div>
          </div>

          <div className={styles.keyControl}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={useReferenceDo}
                onChange={(e) => setUseReferenceDo(e.target.checked)}
              />
              音程校准：跟唱时，先播报原点 1 (Do)，再播报目标音
            </label>
          </div>

          <div className={styles.sectionTitle} style={{ marginTop: 20 }}>
            限时设置
          </div>
          <div className={styles.sliders}>
            <div className={styles.sliderItem}>
              <label>
                反应窗口: <span>{reactionMs}</span> ms
              </label>
              <input
                type="range"
                min={400}
                max={4000}
                step={100}
                value={reactionMs}
                onChange={(e) => setReactionMs(parseInt(e.target.value))}
              />
            </div>
            <div className={styles.sliderItem}>
              <label>
                跟唱时间: <span>{singingMs}</span> ms
              </label>
              <input
                type="range"
                min={1000}
                max={4000}
                step={100}
                value={singingMs}
                onChange={(e) => setSingingMs(parseInt(e.target.value))}
              />
            </div>
          </div>

          <div style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 10 }}>
            自定义目标音域矩阵 (取消勾选即彻底隐藏):
          </div>
          <div className={styles.matrixGrid}>
            {INTERVAL_DATA.map((interval) => (
              <div
                key={interval.id}
                className={styles.matrixItem}
                onClick={() => {
                  const chk = !activeNoteIds.includes(interval.id);
                  syncActiveNotes(interval.id, chk);
                }}
              >
                <input type="checkbox" checked={activeNoteIds.includes(interval.id)} readOnly />
                <label>{interval.name}</label>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.btnGroup}>
          <button
            className={styles.startBtn}
            style={{ flex: 2 }}
            onClick={startTrainer}
            disabled={isRunning}
          >
            {isRunning ? '🚀 运行中' : '▶ 启动'}
          </button>
          <button
            className={styles.pauseBtn}
            style={{ display: isRunning ? 'block' : 'none' }}
            onClick={togglePause}
          >
            {isPaused ? '▶ 继续 (P)' : '⏸ 暂停 (P)'}
          </button>
        </div>

        <div className={styles.displayPanel}>
          <div className={styles.regBadge} style={{ display: isRunning ? 'block' : 'none' }}>
            靶区: {regBadgeText}
          </div>
          <div
            className={styles.keyBadge}
            style={
              keyBadgeHighlight
                ? { backgroundColor: 'rgba(250, 204, 21, 0.8)', color: '#000' }
                : {}
            }
          >
            当前调性: {isRunning ? `1 = ${ROOT_NOTES[rootIndex].name}` : '未启动'}
          </div>

          <div className={styles.statusText}>{statusText}</div>
          <div className={styles.feedbackText}>{feedbackText}</div>
          <div className={styles.progressContainer}>
            <div
              className={`${styles.progressBar} ${progressClass}`}
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </div>

        <div className={styles.answersGrid}>
          {INTERVAL_DATA.filter((int) => activeNoteIds.includes(int.id)).map((interval) => (
            <button
              key={interval.id}
              className={`${styles.ansBtn} ${
                flashMap[interval.id] === 'correct' ? styles.correctFlash : ''
              } ${flashMap[interval.id] === 'wrong' ? styles.wrongFlash : ''}`}
              id={`btn-${interval.id}`}
              disabled={ctxState !== 'REACTION' || isPaused}
              onClick={() => handleUserAnswer(interval.id)}
            >
              <span className={styles.noteName}>{interval.name}</span>
              <span className={styles.noteDesc}>{interval.desc}</span>
              <span className={styles.hotkey}>键: {interval.key.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
