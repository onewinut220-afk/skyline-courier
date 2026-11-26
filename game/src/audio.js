// Synthesised sound only, no audio files: an engine hum that follows the
// throttle, wind that rises with speed, a chime for a ring, a thud for a
// touchdown and a beep for warnings. Created on the first user gesture.
export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let windSource = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
    } catch {
      return false;
    }
    // Engine: two detuned saws through a low-pass, pitched by the throttle.
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineOsc2 = context.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55 * 1.5;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    engineOsc2.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(context.destination);
    engineOsc.start();
    engineOsc2.start();
    // Wind: looped noise through a band-pass, louder the faster you fly.
    const length = context.sampleRate;
    const noise = context.createBuffer(1, length, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    windSource = context.createBufferSource();
    windSource.buffer = noise;
    windSource.loop = true;
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windGain = context.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(context.destination);
    windSource.start();
    return true;
  }

  function tone(frequency, duration, type, gainValue, when = 0) {
    if (!context) return;
    const osc = context.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime + when);
    gain.gain.linearRampToValueAtTime(gainValue, context.currentTime + when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + when + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(context.currentTime + when);
    osc.stop(context.currentTime + when + duration + 0.05);
  }

  return {
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume();
    },
    /** Called every frame with the plane's live state. */
    update(plane, flying) {
      if (!context) return;
      const target = flying && !plane.onGround ? 0.05 + plane.throttle * 0.1 : 0.02;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + plane.throttle * 70 + plane.speed * 0.4, context.currentTime, 0.1);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.12, plane.speed * 0.0016) : 0, context.currentTime, 0.2);
    },
    ring() {
      tone(880, 0.35, 'sine', 0.16);
      tone(1318, 0.45, 'sine', 0.14, 0.09);
    },
    touchdown() {
      tone(70, 0.25, 'sine', 0.3);
      tone(140, 0.15, 'triangle', 0.12);
    },
    crash() {
      tone(55, 0.8, 'sawtooth', 0.2);
      tone(38, 1.1, 'sine', 0.25, 0.05);
    },
    warning() {
      tone(1046, 0.12, 'square', 0.05);
    },
    click() {
      tone(1200, 0.05, 'sine', 0.06);
    },
  };
}
