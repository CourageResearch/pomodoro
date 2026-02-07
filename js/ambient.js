export function createAmbient() {
  let ctx = null;
  let masterGain = null;
  let sourceNodes = [];
  let playing = false;
  let currentType = null;
  let intervalIds = [];

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function cleanup() {
    sourceNodes.forEach(n => { try { n.stop(); } catch {} try { n.disconnect(); } catch {} });
    sourceNodes = [];
    intervalIds.forEach(id => clearInterval(id));
    intervalIds = [];
  }

  function createWhiteNoise() {
    const c = getCtx();
    const bufferSize = c.sampleRate * 2;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(masterGain);
    source.start();
    sourceNodes.push(source);
  }

  function createBrownNoise() {
    const c = getCtx();
    const bufferSize = c.sampleRate * 2;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (last + 0.02 * white) / 1.02;
      last = data[i];
    }
    // Normalize
    let max = 0;
    for (let i = 0; i < bufferSize; i++) max = Math.max(max, Math.abs(data[i]));
    if (max > 0) for (let i = 0; i < bufferSize; i++) data[i] /= max;

    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(masterGain);
    source.start();
    sourceNodes.push(source);
  }

  function createRain() {
    const c = getCtx();
    // Base: bandpass-filtered white noise
    const bufferSize = c.sampleRate * 2;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const bandpass = c.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 800;
    bandpass.Q.value = 0.5;

    const gain = c.createGain();
    gain.gain.value = 0.8;

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(masterGain);
    source.start();
    sourceNodes.push(source);

    // Random "drops" - short impulse bursts
    const dropInterval = setInterval(() => {
      if (!playing) return;
      const dropLen = 0.02 + Math.random() * 0.03;
      const dropBuf = c.createBuffer(1, Math.floor(c.sampleRate * dropLen), c.sampleRate);
      const dropData = dropBuf.getChannelData(0);
      for (let i = 0; i < dropData.length; i++) {
        dropData[i] = (Math.random() * 2 - 1) * (1 - i / dropData.length);
      }
      const dropSource = c.createBufferSource();
      dropSource.buffer = dropBuf;
      const dropGain = c.createGain();
      dropGain.gain.value = 0.15 + Math.random() * 0.15;
      const dropFilter = c.createBiquadFilter();
      dropFilter.type = 'highpass';
      dropFilter.frequency.value = 2000 + Math.random() * 4000;
      dropSource.connect(dropFilter);
      dropFilter.connect(dropGain);
      dropGain.connect(masterGain);
      dropSource.start();
      dropSource.onended = () => { try { dropSource.disconnect(); } catch {} };
    }, 50 + Math.random() * 100);
    intervalIds.push(dropInterval);
  }

  function createCoffeeShop() {
    const c = getCtx();
    // Base: brown noise for ambient murmur
    const bufferSize = c.sampleRate * 2;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (last + 0.02 * white) / 1.02;
      last = data[i];
    }
    let max = 0;
    for (let i = 0; i < bufferSize; i++) max = Math.max(max, Math.abs(data[i]));
    if (max > 0) for (let i = 0; i < bufferSize; i++) data[i] /= max;

    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const lowpass = c.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 500;

    const gain = c.createGain();
    gain.gain.value = 0.7;

    source.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(masterGain);
    source.start();
    sourceNodes.push(source);

    // Random muffled tones simulating conversation/clinks
    const toneInterval = setInterval(() => {
      if (!playing) return;
      const freq = 200 + Math.random() * 400;
      const dur = 0.1 + Math.random() * 0.3;
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const toneGain = c.createGain();
      toneGain.gain.setValueAtTime(0.03 + Math.random() * 0.04, c.currentTime);
      toneGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      const toneFilter = c.createBiquadFilter();
      toneFilter.type = 'lowpass';
      toneFilter.frequency.value = 400;
      osc.connect(toneFilter);
      toneFilter.connect(toneGain);
      toneGain.connect(masterGain);
      osc.start();
      osc.stop(c.currentTime + dur);
      osc.onended = () => { try { osc.disconnect(); } catch {} };
    }, 2000 + Math.random() * 6000);
    intervalIds.push(toneInterval);
  }

  return {
    play(type) {
      this.stop();
      playing = true;
      currentType = type;
      switch (type) {
        case 'white': createWhiteNoise(); break;
        case 'brown': createBrownNoise(); break;
        case 'rain': createRain(); break;
        case 'coffee': createCoffeeShop(); break;
      }
    },

    stop() {
      playing = false;
      currentType = null;
      cleanup();
    },

    setVolume(pct) {
      if (masterGain) {
        masterGain.gain.value = pct / 100;
      }
    },

    isPlaying() { return playing; },
    getType() { return currentType; },
  };
}
