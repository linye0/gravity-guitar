'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NOTES } from '@/lib/notes';
import styles from './page.module.css';

const STRINGS: Record<number, { name: string; rootNoteIdx: number }> = {
  6: { name: '6弦 (E)', rootNoteIdx: 4 },
  5: { name: '5弦 (A)', rootNoteIdx: 9 },
  4: { name: '4弦 (D)', rootNoteIdx: 2 },
};

export default function GuitarRadarPage() {
  const [isPaused, setIsPaused] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);
  const [activeStrings, setActiveStrings] = useState([6, 5, 4]);
  const [currentState, setCurrentState] = useState<'THINKING' | 'ANSWERING'>('THINKING');
  const [currentString, setCurrentString] = useState(6);
  const [currentNoteIdx, setCurrentNoteIdx] = useState(0);
  const [thinkTime, setThinkTime] = useState(2000);
  const [ansTime, setAnsTime] = useState(1500);
  const [progressWidth, setProgressWidth] = useState(100);

  const phaseStartRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const isPausedRef = useRef(true);
  const currentStateRef = useRef<'THINKING' | 'ANSWERING'>('THINKING');

  isPausedRef.current = isPaused;
  currentStateRef.current = currentState;

  const getFret = useCallback((stringNum: number, noteIdx: number) => {
    const rootIdx = STRINGS[stringNum].rootNoteIdx;
    return (noteIdx - rootIdx + 12) % 12;
  }, []);

  const generateNextTarget = useCallback(() => {
    const active = activeStrings.length > 0 ? activeStrings : [6];
    const note = Math.floor(Math.random() * 12);
    const strIdx = Math.floor(Math.random() * active.length);
    setCurrentNoteIdx(note);
    setCurrentString(active[strIdx]);
  }, [activeStrings]);

  const startPhase = useCallback(
    (phaseType: 'THINKING' | 'ANSWERING') => {
      if (isPausedRef.current) return;

      setCurrentState(phaseType);
      phaseStartRef.current = performance.now();

      let durationMs = 0;

      if (phaseType === 'THINKING') {
        generateNextTarget();
        durationMs = thinkTime;
      } else {
        durationMs = ansTime;
      }

      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      const updateProgress = (now: number) => {
        if (isPausedRef.current) return;
        const elapsed = now - phaseStartRef.current;
        let pct = 100 - (elapsed / durationMs) * 100;
        if (pct < 0) pct = 0;
        setProgressWidth(pct);

        if (elapsed >= durationMs) {
          if (currentStateRef.current === 'THINKING') {
            if (showAnswer) startPhase('ANSWERING');
            else startPhase('THINKING');
          } else {
            startPhase('THINKING');
          }
        } else {
          animFrameRef.current = requestAnimationFrame(updateProgress);
        }
      };

      animFrameRef.current = requestAnimationFrame(updateProgress);
    },
    [thinkTime, ansTime, showAnswer, generateNextTarget]
  );

  const togglePlayPause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      if (next) {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      } else {
        phaseStartRef.current = performance.now();
        if (document.getElementById('display-note')?.innerText === '--') {
          setTimeout(() => startPhase('THINKING'), 50);
        } else {
          setTimeout(() => startPhase(currentStateRef.current), 50);
        }
      }
      return next;
    });
  }, [startPhase]);

  const toggleString = useCallback(
    (strNum: number) => {
      setActiveStrings((prev) => {
        const idx = prev.indexOf(strNum);
        if (idx > -1) {
          if (prev.length <= 1) return prev;
          return prev.filter((s) => s !== strNum);
        } else {
          return [...prev, strNum];
        }
      });
    },
    []
  );

  const toggleAnswerMode = useCallback(() => {
    setShowAnswer((prev) => !prev);
  }, []);

  const syncSlider = useCallback(
    (id: string, increment: number) => {
      if (id === 'think') {
        setThinkTime((prev) => Math.min(10000, Math.max(1000, prev + increment)));
      } else {
        setAnsTime((prev) => Math.min(5000, Math.max(500, prev + increment)));
      }
    },
    []
  );

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      switch (key) {
        case 'p':
          togglePlayPause();
          break;
        case 'a':
          toggleAnswerMode();
          break;
        case '6':
          toggleString(6);
          break;
        case '5':
          toggleString(5);
          break;
        case '4':
          toggleString(4);
          break;
        case '=':
        case '+':
          syncSlider('think', 500);
          break;
        case '-':
        case '_':
          syncSlider('think', -500);
          break;
        case ']':
          syncSlider('ans', 500);
          break;
        case '[':
          syncSlider('ans', -500);
          break;
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [togglePlayPause, toggleAnswerMode, toggleString, syncSlider]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const fret = getFret(currentString, currentNoteIdx);
  const statusLabel = isPaused ? 'PAUSED / 已暂停' : 'PLAYING / 运行中';
  const statusClass = isPaused ? styles.statusPaused : styles.statusPlaying;

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
        <h1 className={styles.title}>吉他低音弦根音雷达</h1>
        <div className={styles.subtitle}>切断视觉依赖，建立指板绝对坐标系肌肉记忆</div>

        <div className={styles.controlPanel}>
          <div className={styles.topControls}>
            <button
              className={`${styles.playBtn} ${isPaused ? styles.playBtnPaused : ''}`}
              onClick={togglePlayPause}
            >
              {isPaused ? '▶ 开始训练' : '⏸ 暂停训练'}
            </button>

            <div className={styles.toggles}>
              <div className={styles.toggleGroup}>
                {[6, 5, 4].map((s) => (
                  <div
                    key={s}
                    className={`${styles.toggleLabel} ${activeStrings.includes(s) ? styles.toggleLabelActive : ''}`}
                    onClick={() => toggleString(s)}
                  >
                    {s}弦 ({STRINGS[s].name.split('(')[1]?.replace(')', '') ?? ''})
                  </div>
                ))}
              </div>
              <div className={styles.toggleGroup}>
                <div
                  className={`${styles.toggleLabel} ${showAnswer ? styles.toggleLabelAnswer : ''}`}
                  onClick={toggleAnswerMode}
                >
                  答案提示 (A)
                </div>
              </div>
            </div>
          </div>

          <div className={styles.sliders}>
            <div className={styles.sliderItem}>
              <label>
                思考寻找时间: <span>{(thinkTime / 1000).toFixed(1)}</span> 秒
              </label>
              <input
                type="range"
                min={1000}
                max={10000}
                step={500}
                value={thinkTime}
                onChange={(e) => setThinkTime(parseInt(e.target.value))}
              />
            </div>
            <div className={styles.sliderItem}>
              <label>
                答案展示停留: <span>{(ansTime / 1000).toFixed(1)}</span> 秒
              </label>
              <input
                type="range"
                min={500}
                max={5000}
                step={500}
                value={ansTime}
                onChange={(e) => setAnsTime(parseInt(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className={styles.displayPanel}>
          <div className={`${styles.statusBadge} ${statusClass}`}>{statusLabel}</div>

          <div className={styles.targetString}>
            {isPaused
              ? '请选择参数后点击开始'
              : `目标: 请在 ${STRINGS[currentString].name} 上找到`}
          </div>
          <div className={styles.targetNote} id="display-note">
            {isPaused ? '--' : NOTES[currentNoteIdx]}
          </div>
          <div
            className={`${styles.answerDisplay} ${currentState === 'ANSWERING' ? styles.answerVisible : ''}`}
          >
            {currentState === 'ANSWERING'
              ? `>>> 答案: 第 ${fret} 品 ${fret === 0 ? '(或12品)' : ''} <<<`
              : ''}
          </div>

          <div className={styles.progressContainer}>
            <div
              className={`${styles.progressBar} ${currentState === 'THINKING' ? styles.barThink : styles.barAnswer}`}
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </div>

        <div className={styles.hotkeyHints}>
          <span>
            <span className={styles.kbd}>P</span> 暂停/继续
          </span>
          <span>
            <span className={styles.kbd}>A</span> 答案开关
          </span>
          <span>
            <span className={styles.kbd}>6/5/4</span> 琴弦开关
          </span>
          <span>
            <span className={styles.kbd}>+/-</span> 思考时间
          </span>
          <span>
            <span className={styles.kbd}>[/]</span> 答案时间
          </span>
        </div>
      </div>
    </div>
  );
}
