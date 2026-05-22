'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import abcjs from 'abcjs';
import { PITCH_SPACE } from '@/lib/notes';
import { getAudioContext, playPianoNote, clearOscillators } from '@/lib/audio';
import styles from './page.module.css';

// --- 1. 底层数据结构定义 (AST) ---
export type NoteDuration = '1' | '2' | '4' | '8' | '16';

export interface MusicEvent {
  id: string;
  type: 'note' | 'rest';
  pitchOffset?: number; 
  duration: NoteDuration;
}

export type Measure = MusicEvent[];

// 时值映射字典（以 16 分音符为基准单位 1）
const DURATION_UNITS: Record<NoteDuration, number> = {
  '1': 16, // 全音符 = 16 个 16分音符
  '2': 8,  // 二分音符 = 8 个 16分音符
  '4': 4,  // 四分音符 = 4 个 16分音符
  '8': 2,  // 八分音符 = 2 个 16分音符
  '16': 1  // 十六分音符 = 1 个 16分音符
};

const TOTAL_MEASURES = 4;
const MEASURE_CAPACITY = 16; // 4/4 拍

export default function LyricPracticePage() {
  // --- 2. 核心状态管理 ---
  const [viewMode, setViewMode] = useState<'chromatic' | 'major' | 'minor'>('major');
  const [keyNote, setKeyNote] = useState(261.63);
  
  // 编辑器状态
  const [measures, setMeasures] = useState<Measure[]>(Array.from({ length: TOTAL_MEASURES }, () => []));
  const [currentMeasureIdx, setCurrentMeasureIdx] = useState(0);
  const [inputDuration, setInputDuration] = useState<NoteDuration>('4'); // 默认输入四分音符
  const [pitchMin, setPitchMin] = useState(0);
  const [pitchMax, setPitchMax] = useState(7);

  const paperRef = useRef<HTMLDivElement>(null);
  const playbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [bpm, setBpm] = useState(80);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [beginnerRhythm, setBeginnerRhythm] = useState(false);

  const playCursorRef = useRef(-1);
  const isPausedInternalRef = useRef(false);
  const playTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const currentMeasureIdxRef = useRef(0);

  currentMeasureIdxRef.current = currentMeasureIdx;

  // 过滤显示的音高
  const visiblePitches = useMemo(() => {
    return PITCH_SPACE.filter((p) => {
      if (viewMode === 'major') return p.isMajor;
      if (viewMode === 'minor') return p.isMinor;
      return true;
    });
  }, [viewMode]);

  const pitchRows = useMemo(() => {
    const all = visiblePitches;
    return {
      high: all.filter(p => p.offset >= 12).reverse(),
      mid: all.filter(p => p.offset >= 0 && p.offset < 12).reverse(),
      low: all.filter(p => p.offset < 0).reverse(),
    };
  }, [visiblePitches]);

  // --- 3. AST 到 ABC 字符串的编译引擎 ---
  const abcString = useMemo(() => {
    // 基础乐谱配置：4/4拍，默认十六分音符为最小书写单位
    let abcStr = `X:1\nM:4/4\nL:1/16\nK:C\n%%stretchstaff\n`;

    const getAbcPitch = (offset: number) => {
      const notes = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
      const octave = Math.floor(offset / 12);
      const noteClass = notes[(offset % 12 + 12) % 12];
      
      if (octave === 0) return noteClass;
      if (octave === 1) return noteClass.toLowerCase();
      if (octave > 1) return noteClass.toLowerCase() + "'".repeat(octave - 1);
      if (octave < 0) return noteClass + ",".repeat(Math.abs(octave));
      return noteClass;
    };

    measures.forEach((measure, idx) => {
      let measureStr = '';
      measure.forEach(ev => {
        const len = DURATION_UNITS[ev.duration];
        if (ev.type === 'rest') {
          measureStr += `z${len} `;
        } else {
          measureStr += `${getAbcPitch(ev.pitchOffset!)}${len} `;
        }
      });
      
      abcStr += measureStr + '| ';
    });

    return abcStr;
  }, [measures]);

  // --- 4. 实时渲染五线谱副作用 ---
  useEffect(() => {
    if (paperRef.current) {
      abcjs.renderAbc(paperRef.current, abcString, {
        responsive: 'resize',
        add_classes: true,
        staffwidth: 900,
        selectTypes: false,
      });
    }
  }, [abcString]);

  // --- 5. 核心交互：输入校检与写入 ---
  const handleInputEvent = useCallback((type: 'note' | 'rest', pitchOffset?: number) => {
    setMeasures(prev => {
      const idx = currentMeasureIdxRef.current;
      const next = [...prev];
      let targetMeasure = next[idx];
      
      // 计算当前小节已用容量
      const usedCapacity = targetMeasure.reduce((sum, ev) => sum + DURATION_UNITS[ev.duration], 0);
      const incomingCapacity = DURATION_UNITS[inputDuration];

      if (usedCapacity + incomingCapacity > MEASURE_CAPACITY) {
        // 当前小节塞不下，尝试移动到下一个小节
        if (idx < TOTAL_MEASURES - 1) {
          setCurrentMeasureIdx(idx + 1);
          next[idx + 1] = [...next[idx + 1], {
            id: Math.random().toString(36).substr(2, 9),
            type,
            pitchOffset,
            duration: inputDuration
          }];
        } else {
          console.warn("乐谱已满，无法继续输入");
        }
      } else {
        // 正常写入当前小节
        next[idx] = [...targetMeasure, {
          id: Math.random().toString(36).substr(2, 9),
          type,
          pitchOffset,
          duration: inputDuration
        }];
        
        // 如果刚好填满，自动跳到下一小节
        if (usedCapacity + incomingCapacity === MEASURE_CAPACITY && idx < TOTAL_MEASURES - 1) {
          setCurrentMeasureIdx(idx + 1);
        }
      }
      return next;
    });
  }, [inputDuration]);

  // 退格删除逻辑
  const handleBackspace = useCallback(() => {
    setMeasures(prev => {
      const idx = currentMeasureIdxRef.current;
      const next = [...prev];
      if (next[idx].length > 0) {
        next[idx] = next[idx].slice(0, -1);
      } else if (idx > 0) {
        setCurrentMeasureIdx(idx - 1);
        next[idx - 1] = next[idx - 1].slice(0, -1);
      }
      return next;
    });
  }, []);

  const clearGrid = useCallback(() => {
    setMeasures(Array.from({ length: TOTAL_MEASURES }, () => []));
    setCurrentMeasureIdx(0);
  }, []);

  const generateRandomSequence = useCallback(() => {
    const newMeasures: Measure[] = Array.from({ length: TOTAL_MEASURES }, () => []);
    const availableDurs: NoteDuration[] = beginnerRhythm ? ['4'] : ['4', '8', '16'];
    const candidates: number[] = [];
    for (let o = pitchMin; o <= pitchMax; o++) {
      if (visiblePitches.some(p => p.offset === o)) {
        candidates.push(o);
      }
    }

    for (let m = 0; m < TOTAL_MEASURES; m++) {
      let cap = MEASURE_CAPACITY;
      while (cap > 0) {
        const possible = availableDurs.filter(d => DURATION_UNITS[d] <= cap);
        if (possible.length === 0) break;
        const dur = possible[Math.floor(Math.random() * possible.length)];
        const durSize = DURATION_UNITS[dur];

        const isFirst = m === 0 && newMeasures.every(meas => meas.length === 0);
        const pitchOffset = isFirst ? 0 : candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : 0;

        newMeasures[m].push({
          id: Math.random().toString(36).substr(2, 9),
          type: 'note',
          pitchOffset,
          duration: dur,
        });
        cap -= durSize;
      }
    }

    setMeasures(newMeasures);
    setCurrentMeasureIdx(0);
  }, [pitchMin, pitchMax, visiblePitches, beginnerRhythm]);

  const clearAllTimeouts = useCallback(() => {
    for (const t of playTimeoutsRef.current) clearTimeout(t);
    playTimeoutsRef.current = [];
  }, []);

  const clearNoteHighlight = useCallback(() => {
    paperRef.current?.querySelectorAll('.abcjs-note').forEach(el => {
      (el as HTMLElement).style.removeProperty('filter');
      (el as HTMLElement).style.removeProperty('fill');
      (el as HTMLElement).style.removeProperty('stroke');
    });
  }, []);

  const highlightNote = useCallback((idx: number) => {
    clearNoteHighlight();
    const els = paperRef.current?.querySelectorAll<HTMLElement>('.abcjs-note');
    if (els && els[idx]) {
      els[idx].style.setProperty('filter', 'drop-shadow(0 0 6px #a855f7) brightness(1.3)', 'important');
      els[idx].style.setProperty('fill', '#a855f7', 'important');
      els[idx].style.setProperty('stroke', '#a855f7', 'important');
    }
  }, [clearNoteHighlight]);

  const scheduleFrom = useCallback((startIdx: number) => {
    if (!audioCtxRef.current) audioCtxRef.current = getAudioContext();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const plan: { offset: number; durMs: number }[] = [];
    const unitMs = 60000 / bpm / 4;
    for (const measure of measures) {
      for (const ev of measure) {
        const durMs = DURATION_UNITS[ev.duration] * unitMs;
        plan.push({ offset: ev.type === 'note' && ev.pitchOffset !== undefined ? ev.pitchOffset : -1, durMs });
      }
    }

    let idx = startIdx;
    const tick = () => {
      if (isPausedInternalRef.current) return;
      if (idx >= plan.length) {
        setIsPlaying(false);
        setIsPaused(false);
        playCursorRef.current = -1;
        return;
      }
      const ev = plan[idx];
      playCursorRef.current = idx;
      highlightNote(idx);
      if (ev.offset >= 0) {
        const freq = keyNote * Math.pow(2, ev.offset / 12);
        playPianoNote(ctx, freq, ctx.currentTime, ev.durMs / 1000);
      }
      const tid = setTimeout(tick, ev.durMs);
      playTimeoutsRef.current.push(tid);
      idx++;
    };
    tick();
  }, [measures, bpm, keyNote, highlightNote]);

  const startPlayback = useCallback(() => {
    setIsPaused(false);
    isPausedInternalRef.current = false;
    playCursorRef.current = -1;
    if (!audioCtxRef.current) audioCtxRef.current = getAudioContext();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    setIsPlaying(true);
    scheduleFrom(0);
  }, [scheduleFrom]);

  const togglePause = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      isPausedInternalRef.current = false;
      scheduleFrom(playCursorRef.current + 1);
    } else {
      setIsPaused(true);
      isPausedInternalRef.current = true;
      clearAllTimeouts();
      clearOscillators({ current: [] });
      clearNoteHighlight();
    }
  }, [isPaused, scheduleFrom, clearAllTimeouts, clearNoteHighlight]);

  const stopPlayback = useCallback(() => {
    clearAllTimeouts();
    clearOscillators({ current: [] });
    clearNoteHighlight();
    setIsPlaying(false);
    setIsPaused(false);
    isPausedInternalRef.current = false;
    playCursorRef.current = -1;
  }, [clearAllTimeouts, clearNoteHighlight]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', padding: '20px', background: '#1c1c1f' }}>
      <Link href="/" className={styles.backLink} style={{ color: '#a1a1aa', marginBottom: 20 }}>
        ← 返回首页
      </Link>

      <div className={styles.container} style={{ width: '100%', maxWidth: 1150, background: '#232326', padding: 20, borderRadius: 12 }}>
        <h1 className={styles.title} style={{ color: '#4ade80', textAlign: 'center' }}>视唱五线谱编辑器</h1>
        <div style={{ color: '#a1a1aa', textAlign: 'center', marginBottom: 20, fontSize: 14 }}>基于抽象语法树 (AST) 的线性输入引擎</div>

        {/* --- 工具栏：时值选择与全局控制 --- */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, padding: 15, background: '#18181c', borderRadius: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderRight: '1px solid #3f3f46', paddingRight: 12 }}>
            <span style={{ color: '#a1a1aa', fontSize: 12 }}>时值:</span>
            {(['1', '2', '4', '8', '16'] as NoteDuration[]).map(dur => (
              <button
                key={dur}
                onClick={() => setInputDuration(dur)}
                style={{
                  padding: '5px 10px',
                  background: inputDuration === dur ? '#a855f7' : '#2d2d31',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: inputDuration === dur ? 'bold' : 'normal',
                  fontSize: 12,
                }}
              >
                1/{dur}
              </button>
            ))}
          </div>

          <button onClick={() => handleInputEvent('rest')} style={{ padding: '5px 12px', background: '#3f3f46', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            ⏸ 休止
          </button>
          
          <button onClick={handleBackspace} style={{ padding: '5px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            ⌫ 撤销
          </button>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', borderLeft: '1px solid #3f3f46', paddingLeft: 12 }}>
            <span style={{ color: '#a1a1aa', fontSize: 12 }}>音阶:</span>
            {([{ key: 'chromatic', label: '全音' }, { key: 'major', label: '大调' }, { key: 'minor', label: '小调' }] as const).map(opt => (
              <button
                key={opt.key}
                onClick={() => setViewMode(opt.key)}
                style={{
                  padding: '4px 10px',
                  background: viewMode === opt.key ? '#60a5fa' : '#2d2d31',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: viewMode === opt.key ? 'bold' : 'normal',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderLeft: '1px solid #3f3f46', paddingLeft: 12 }}>
            <span style={{ color: '#facc15', fontSize: 12 }}>最低:</span>
            <select value={pitchMin} onChange={e => setPitchMin(Number(e.target.value))} style={{ background: '#2d2d31', color: '#facc15', border: '1px solid #52525b', borderRadius: 4, padding: '4px 6px', fontSize: 12 }}>
              {PITCH_SPACE.slice().reverse().map(v => <option key={v.offset} value={v.offset}>{v.name}</option>)}
            </select>
            <span style={{ color: '#60a5fa', fontSize: 12 }}>最高:</span>
            <select value={pitchMax} onChange={e => setPitchMax(Number(e.target.value))} style={{ background: '#2d2d31', color: '#60a5fa', border: '1px solid #52525b', borderRadius: 4, padding: '4px 6px', fontSize: 12 }}>
              {PITCH_SPACE.slice().reverse().map(v => <option key={v.offset} value={v.offset}>{v.name}</option>)}
            </select>
            <button onClick={generateRandomSequence} style={{ padding: '5px 14px', background: '#a855f7', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              🎲 随机生成
            </button>
            <button onClick={() => setBeginnerRhythm(v => !v)} style={{ padding: '5px 10px', background: beginnerRhythm ? '#22c55e' : '#2d2d31', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: beginnerRhythm ? 'bold' : 'normal' }}>
              {beginnerRhythm ? '✓' : ''} 新手节奏型
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderLeft: '1px solid #3f3f46', paddingLeft: 12, marginLeft: 'auto' }}>
            <span style={{ color: '#a1a1aa', fontSize: 12 }}>BPM:</span>
            <input type="number" value={bpm} onChange={e => setBpm(Math.max(20, Math.min(200, Number(e.target.value))))} style={{ width: 50, background: '#2d2d31', color: '#4ade80', border: '1px solid #52525b', borderRadius: 4, padding: '4px 6px', fontSize: 12, textAlign: 'center' }} />
            {!isPlaying ? (
              <button onClick={startPlayback} style={{ padding: '5px 16px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                ▶ 播放
              </button>
            ) : (
              <>
                <button onClick={togglePause} style={{ padding: '5px 12px', background: isPaused ? '#22c55e' : '#facc15', color: isPaused ? 'white' : '#1c1c1f', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                  {isPaused ? '▶ 继续' : '⏸ 暂停'}
                </button>
                <button onClick={stopPlayback} style={{ padding: '5px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                  ⏹ 停止
                </button>
              </>
            )}
            <button onClick={clearGrid} style={{ padding: '5px 12px', background: '#3f3f46', color: '#e4e4e7', border: '1px solid #52525b', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
              🗑 清空
            </button>
          </div>
        </div>

        {/* --- 视图区：五线谱渲染 --- */}
        <div className={styles.staffArea}>
          <div ref={paperRef}></div>
        </div>

        {/* --- 输入区：音高键盘 (点击即写入) --- */}
        <div style={{ background: '#141416', border: '1px solid #2d2d31', borderRadius: 8, padding: 20 }}>
          <div style={{ color: '#d8b4fe', marginBottom: 12, fontSize: 13, textAlign: 'center' }}>
            当前正在写入: 第 {currentMeasureIdx + 1} 小节 | 点击下方音高将其作为【1/{inputDuration} 音符】插入乐谱
          </div>

          {([
            { key: 'high', label: '高音区', color: '#60a5fa' },
            { key: 'mid', label: '中音区', color: '#d8b4fe' },
            { key: 'low', label: '低音区', color: '#facc15' },
          ] as const).map(({ key, label, color }) => {
            const pitches = pitchRows[key];
            if (pitches.length === 0) return null;
            return (
              <div key={key} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ color, fontSize: 12, fontWeight: 'bold', width: 50, flexShrink: 0 }}>{label}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {pitches.map((pitch) => (
                      <div
                        key={pitch.offset}
                        onMouseDown={(e) => {
                          if (e.button === 2) {
                            e.preventDefault();
                            if (!audioCtxRef.current) audioCtxRef.current = getAudioContext();
                            const ctx = audioCtxRef.current;
                            if (ctx.state === 'suspended') ctx.resume();
                            const freq = keyNote * Math.pow(2, pitch.offset / 12);
                            playPianoNote(ctx, freq, ctx.currentTime, 0.4);
                            return;
                          }
                          if (!audioCtxRef.current) audioCtxRef.current = getAudioContext();
                          const ctx = audioCtxRef.current;
                          if (ctx.state === 'suspended') ctx.resume();
                          const freq = keyNote * Math.pow(2, pitch.offset / 12);
                          playPianoNote(ctx, freq, ctx.currentTime, 0.4);
                          handleInputEvent('note', pitch.offset);
                        }}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{
                          width: 52,
                          height: 36,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: pitch.isBlack ? '#18181c' : '#2d2d31',
                          color: pitch.isRoot ? '#4ade80' : '#e4e4e7',
                          border: pitch.isRoot ? '1px solid #4ade80' : '1px solid #3f3f46',
                          borderLeft: pitch.isRoot ? '3px solid #4ade80' : '1px solid #3f3f46',
                          cursor: 'pointer',
                          borderRadius: 4,
                          userSelect: 'none',
                          fontSize: 12,
                          fontWeight: pitch.isRoot ? 'bold' : 'normal',
                          fontFamily: 'monospace',
                          transition: 'background 0.1s',
                          flexShrink: 0,
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#3b3b40'}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = pitch.isBlack ? '#18181c' : '#2d2d31';
                        }}
                      >
                        {pitch.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

// 维持对 AudioContext 的静默引用以防重复声明
const audioCtxRef = { current: null as AudioContext | null };