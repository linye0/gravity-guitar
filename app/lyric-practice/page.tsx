'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PITCH_SPACE } from '@/lib/notes';
import { getAudioContext, playTone } from '@/lib/audio';
import styles from './page.module.css';

type GridData = { active: boolean; length: number }[][];

const BEATS = 8;

export default function LyricPracticePage() {
  const [viewMode, setViewMode] = useState<'chromatic' | 'major' | 'minor'>('major');
  const [keyNote, setKeyNote] = useState(261.63);
  const [bpm, setBpm] = useState(95);
  const [stepsPerBeat, setStepsPerBeat] = useState(2);
  const [minRange, setMinRange] = useState(-5);
  const [maxRange, setMaxRange] = useState(16);

  const steps = BEATS * stepsPerBeat;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const currentStepRef = useRef(0);
  const nextNoteTimeRef = useRef(0);
  const timerIdRef = useRef<number | null>(null);
  const hoveredCellRef = useRef<{ row: number; col: number } | null>(null);

  const visiblePitches = useMemo(() => {
    return PITCH_SPACE.filter((p) => {
      if (viewMode === 'major') return p.isMajor;
      if (viewMode === 'minor') return p.isMinor;
      return true;
    });
  }, [viewMode]);

  const [gridData, setGridData] = useState<GridData>(() =>
    PITCH_SPACE.map(() => Array(steps).fill(null).map(() => ({ active: false, length: 1 })))
  );
  const gridRef = useRef(gridData);
  gridRef.current = gridData;

  const [playingCol, setPlayingCol] = useState<number | null>(null);

  useEffect(() => {
    const newSteps = BEATS * stepsPerBeat;
    setGridData((prev) =>
      PITCH_SPACE.map((_, rowIdx) =>
        Array(newSteps)
          .fill(null)
          .map((_, colIdx) => prev[rowIdx]?.[colIdx] || { active: false, length: 1 })
      )
    );
  }, [stepsPerBeat]);

  const initRangeSelectors = useCallback(() => {
    setMinRange(-5);
    setMaxRange(16);
  }, []);

  useEffect(() => {
    initRangeSelectors();
  }, [initRangeSelectors]);

  const toggleCell = useCallback((rowIdx: number, colIdx: number) => {
    setGridData((prev) => {
      const next = prev.map((row) => row.map((cell) => ({ ...cell })));
      next[rowIdx][colIdx].active = !next[rowIdx][colIdx].active;
      if (next[rowIdx][colIdx].active) next[rowIdx][colIdx].length = 1;
      return next;
    });
  }, []);

  const paintCell = useCallback((rowIdx: number, colIdx: number) => {
    setGridData((prev) => {
      const next = prev.map((row) => row.map((cell) => ({ ...cell })));
      if (!next[rowIdx][colIdx].active) {
        next[rowIdx][colIdx].active = true;
        next[rowIdx][colIdx].length = 1;
      }
      return next;
    });
  }, []);

  const adjustNoteLength = useCallback((delta: number) => {
    const cell = hoveredCellRef.current;
    if (!cell) return;
    setGridData((prev) => {
      const next = prev.map((row) => row.map((c) => ({ ...c })));
      const data = next[cell.row][cell.col];
      if (data.active) {
        data.length += delta;
        if (data.length < 1) data.length = 1;
        const maxLen = BEATS * (prev[0]?.length ? prev[0].length / BEATS : 2) - cell.col;
        if (data.length > maxLen) data.length = maxLen;
      }
      return next;
    });
  }, []);

  const clearGrid = useCallback(() => {
    setGridData((prev) => prev.map((row) => row.map(() => ({ active: false, length: 1 }))));
  }, []);

  const generateRandomExercise = useCallback(() => {
    setGridData((prev) => {
      const next = prev.map((row) => row.map(() => ({ active: false, length: 1 })));

      const realMin = Math.min(minRange, maxRange);
      const realMax = Math.max(minRange, maxRange);

      const availableRowIndices: number[] = [];
      PITCH_SPACE.forEach((pitch, idx) => {
        if (viewMode === 'major' && !pitch.isMajor) return;
        if (viewMode === 'minor' && !pitch.isMinor) return;
        if (pitch.offset < realMin || pitch.offset > realMax) return;
        availableRowIndices.push(idx);
      });

      const fallbackIndices = availableRowIndices.length > 0 ? availableRowIndices : [];
      if (availableRowIndices.length === 0) {
        PITCH_SPACE.forEach((pitch, idx) => {
          if (viewMode === 'major' && !pitch.isMajor) return;
          if (viewMode === 'minor' && !pitch.isMinor) return;
          availableRowIndices.push(idx);
        });
      }

      const totalSteps = next[0].length;
      const doRowIdx = PITCH_SPACE.findIndex((p) => p.offset === 0);

      if (doRowIdx !== -1 && availableRowIndices.includes(doRowIdx)) {
        next[doRowIdx][0].active = true;
        next[doRowIdx][0].length = 1;
      }

      let lastRowIdx =
        doRowIdx !== -1 && availableRowIndices.includes(doRowIdx)
          ? doRowIdx
          : availableRowIndices[Math.floor(availableRowIndices.length / 2)];

      for (let col = 1; col < totalSteps; col++) {
        if (Math.random() < 0.2) continue;

        let candidates = availableRowIndices.filter((idx) => {
          const curOff = PITCH_SPACE[idx].offset;
          const lastOff = PITCH_SPACE[lastRowIdx].offset;
          return Math.abs(curOff - lastOff) <= 7;
        });

        if (candidates.length === 0) candidates = availableRowIndices;

        const randIdx = candidates[Math.floor(Math.random() * candidates.length)];
        next[randIdx][col].active = true;
        next[randIdx][col].length = 1;
        lastRowIdx = randIdx;
      }

      return next;
    });
  }, [viewMode, minRange, maxRange]);

  const scheduleNote = useCallback(() => {
    const secondsPerBeat = 60.0 / bpm;
    const stepDuration = secondsPerBeat / stepsPerBeat;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    setPlayingCol(currentStepRef.current);

    const totalSteps = gridRef.current[0].length;
    for (let row = 0; row < PITCH_SPACE.length; row++) {
      const cellData = gridRef.current[row]?.[currentStepRef.current];
      if (cellData?.active) {
        const duration = stepDuration * cellData.length;
        const pitch = PITCH_SPACE[row];
        const freq = keyNote * Math.pow(2, pitch.offset / 12);
        playTone(ctx, freq, nextNoteTimeRef.current, duration);
      }
    }

    nextNoteTimeRef.current += stepDuration;
    currentStepRef.current = (currentStepRef.current + 1) % totalSteps;
  }, [bpm, stepsPerBeat, keyNote]);

  const scheduler = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
      scheduleNote();
    }
    timerIdRef.current = requestAnimationFrame(scheduler);
  }, [scheduleNote]);

  const togglePlay = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = getAudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    if (isPlayingRef.current) {
      if (timerIdRef.current) cancelAnimationFrame(timerIdRef.current);
      isPlayingRef.current = false;
      setPlayingCol(null);
    } else {
      isPlayingRef.current = true;
      currentStepRef.current = 0;
      nextNoteTimeRef.current = ctx.currentTime + 0.05;
      scheduler();
    }
  }, [scheduler]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target instanceof HTMLElement && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        togglePlay();
      }
      if (hoveredCellRef.current) {
        const cell = hoveredCellRef.current;
        const data = gridRef.current[cell.row]?.[cell.col];
        if (data?.active) {
          if (e.key === '+' || e.key === '=') adjustNoteLength(1);
          if (e.key === '-' || e.key === '_') adjustNoteLength(-1);
        }
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [togglePlay, adjustNoteLength]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (hoveredCellRef.current) {
        const cell = hoveredCellRef.current;
        const data = gridRef.current[cell.row]?.[cell.col];
        if (data?.active) {
          e.preventDefault();
          adjustNoteLength(e.deltaY < 0 ? 1 : -1);
        }
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [adjustNoteLength]);

  useEffect(() => {
    return () => {
      if (timerIdRef.current) cancelAnimationFrame(timerIdRef.current);
    };
  }, []);

  const totalSteps = steps;
  const startIdx = PITCH_SPACE.findIndex((p) => p.offset === 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '20px',
        userSelect: 'none',
        overflowX: 'hidden',
      }}
    >
      <Link href="/" className={styles.backLink}>
        ← 返回首页
      </Link>

      <div className={styles.container}>
        <h1 className={styles.title}>视唱生成与练耳控制台 (音域受控版)</h1>
        <div className={styles.subtitle}>底层维护十二平均律，支持特定调式过滤与动态随机出题音域裁剪</div>

        <div className={styles.topControls}>
          <div className={styles.settingsGroup}>
            <label style={{ fontSize: 13, color: '#a1a1aa' }}>模式视图:</label>
            <select
              className={`${styles.select} ${styles.viewSelect}`}
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'chromatic' | 'major' | 'minor')}
            >
              <option value="chromatic">🎹 十二平均律 (全展开)</option>
              <option value="major">☀️ 大调音阶 (Ionian)</option>
              <option value="minor">🌧️ 自然小调 (Aeolian)</option>
            </select>

            <label style={{ fontSize: 13, color: '#a1a1aa', marginLeft: 5 }}>绝对调高:</label>
            <select
              className={styles.select}
              value={keyNote}
              onChange={(e) => setKeyNote(parseFloat(e.target.value))}
            >
              <option value={261.63}>C4</option>
              <option value={293.66}>D4</option>
              <option value={329.63}>E4</option>
              <option value={440}>A4</option>
            </select>

            <label style={{ fontSize: 13, color: '#a1a1aa' }}>BPM:</label>
            <input
              type="number"
              className={styles.numberInput}
              value={bpm}
              min={40}
              max={240}
              onChange={(e) => setBpm(parseInt(e.target.value) || 95)}
            />

            <label style={{ fontSize: 13, color: '#a1a1aa' }}>精度:</label>
            <select
              className={styles.select}
              value={stepsPerBeat}
              onChange={(e) => setStepsPerBeat(parseInt(e.target.value))}
            >
              <option value={4}>1/16 音符</option>
              <option value={2}>1/8 音符</option>
            </select>
          </div>

          <div
            className={styles.settingsGroup}
            style={{ borderLeft: '1px solid #3f3f46', paddingLeft: 15 }}
          >
            <label style={{ fontSize: 13, color: '#d8b4fe', fontWeight: 'bold' }}>出题下限:</label>
            <select
              className={`${styles.select} ${styles.rangeSelect}`}
              value={minRange}
              onChange={(e) => setMinRange(parseInt(e.target.value))}
            >
              {PITCH_SPACE.map((p) => (
                <option key={p.offset} value={p.offset}>
                  {p.name}
                </option>
              ))}
            </select>

            <label style={{ fontSize: 13, color: '#d8b4fe', fontWeight: 'bold', marginLeft: 5 }}>
              出题上限:
            </label>
            <select
              className={`${styles.select} ${styles.rangeSelect}`}
              value={maxRange}
              onChange={(e) => setMaxRange(parseInt(e.target.value))}
            >
              {PITCH_SPACE.map((p) => (
                <option key={p.offset} value={p.offset}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.btnGroup}>
            <button className={`${styles.btn} ${styles.btnRandom}`} onClick={generateRandomExercise}>
              🎲 随机视唱出题
            </button>
            <button className={`${styles.btn} ${styles.btnClear}`} onClick={clearGrid}>
              🗑️ 清空
            </button>
            <button
              className={`${styles.btn} ${isPlayingRef.current ? styles.btnStop : styles.btnPlay}`}
              onClick={togglePlay}
            >
              {isPlayingRef.current ? '⏹ 停止' : '▶ 播放 (Space)'}
            </button>
          </div>
        </div>

        <div className={styles.helpTips}>
          🎯 <b>动态视唱调校：</b> 如果觉得高音唱不上去，可在上方<b>&ldquo;出题上限&rdquo;</b>和
          <b>&ldquo;出题下限&rdquo;</b>中框定你的舒适声带区。生成引擎会自动将随机线条禁锢在该绝对范围内。
        </div>

        <div className={styles.sequencerWrapper}>
          <div className={styles.rowLabels}>
            {visiblePitches.map((pitch, i) => (
              <div
                key={pitch.offset}
                className={`${styles.labelCell} ${pitch.isBlack ? styles.labelCellBlack : ''} ${pitch.isRoot ? styles.labelCellRoot : ''}`}
                onMouseDown={() => {
                  if (!audioCtxRef.current) audioCtxRef.current = getAudioContext();
                  const ctx = audioCtxRef.current;
                  if (ctx.state === 'suspended') ctx.resume();
                  const freq = keyNote * Math.pow(2, pitch.offset / 12);
                  playTone(ctx, freq, ctx.currentTime, 0.35);
                }}
              >
                {pitch.name}
              </div>
            ))}
          </div>

          <div className={styles.gridContainer}>
            {visiblePitches.map((pitch) => {
              const pitchIdx = PITCH_SPACE.indexOf(pitch);
              return (
                <div
                  key={pitch.offset}
                  className={`${styles.gridRow} ${pitch.isBlack ? styles.gridRowBlack : ''} ${pitch.isRoot ? styles.gridRowRoot : ''}`}
                >
                  {Array.from({ length: totalSteps }).map((_, col) => {
                    const cellData = gridData[pitchIdx]?.[col];
                    return (
                      <div
                        key={col}
                        className={`${styles.gridCell} ${playingCol === col ? styles.gridCellPlaying : ''}`}
                        onMouseDown={() => toggleCell(pitchIdx, col)}
                        onMouseEnter={(e) => {
                          hoveredCellRef.current = { row: pitchIdx, col };
                          if (e.buttons === 1 && !(cellData?.active)) {
                            paintCell(pitchIdx, col);
                          }
                        }}
                        onMouseLeave={() => {
                          if (hoveredCellRef.current?.row === pitchIdx && hoveredCellRef.current?.col === col) {
                            hoveredCellRef.current = null;
                          }
                        }}
                      >
                        {cellData?.active && (
                          <div
                            className={`${styles.noteBlock} ${pitch.cls ? (pitch.cls === 'high-zone' ? styles.highZone : pitch.cls === 'low-zone' ? styles.lowZone : styles.rootAnchor) : ''}`}
                            style={{ '--len': cellData.length } as React.CSSProperties}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
