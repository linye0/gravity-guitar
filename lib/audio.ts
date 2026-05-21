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

export function playTone(ctx: AudioContext, freq: number, startTime: number, durationSeconds: number, type: OscillatorType = 'triangle') {
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
}
