export function getAudioContext(): AudioContext {
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

export interface ToneSpec {
  freq: number;
  dur: number;
}

export function playToneSequence(
  ctx: AudioContext,
  toneArray: ToneSpec[],
  oscillatorsRef: { current: OscillatorNode[] }
) {
  clearOscillators(oscillatorsRef);
  let startTime = ctx.currentTime;

  toneArray.forEach((tone) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = tone.freq;

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.04);

    const decayTime = tone.dur > 0.1 ? tone.dur - 0.05 : tone.dur;
    gainNode.gain.exponentialRampToValueAtTime(0.005, startTime + decayTime);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + tone.dur);

    oscillatorsRef.current.push(osc);
    startTime += tone.dur;
  });
}

export function clearOscillators(ref: { current: OscillatorNode[] }) {
  ref.current.forEach((osc) => {
    try {
      osc.stop();
    } catch {
      // already stopped
    }
  });
  ref.current = [];
}

export function playTone(ctx: AudioContext, freq: number, startTime: number, durationSeconds: number, type: OscillatorType = 'triangle'): OscillatorNode {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.6, startTime + 0.02);
  gain.gain.setValueAtTime(0.6, startTime + durationSeconds - 0.03);
  gain.gain.linearRampToValueAtTime(0, startTime + durationSeconds);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + durationSeconds);

  return osc;
}

export function playPianoNote(ctx: AudioContext, freq: number, startTime: number, durationSeconds: number) {
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, startTime);
  masterGain.gain.linearRampToValueAtTime(0.55, startTime + 0.003);
  masterGain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.04);
  masterGain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.25);
  masterGain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSeconds);
  masterGain.connect(ctx.destination);

  const partials: { mult: number; gain: number }[] = [
    { mult: 1, gain: 0.6 },
    { mult: 2, gain: 0.25 },
    { mult: 3, gain: 0.10 },
    { mult: 4, gain: 0.04 },
  ];

  for (const p of partials) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * p.mult;
    g.gain.value = p.gain;
    osc.connect(g);
    g.connect(masterGain);
    osc.start(startTime);
    osc.stop(startTime + durationSeconds);
  }
}
