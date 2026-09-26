import { SuperpoweredWebAudio } from '/vendor/superpowered/Superpowered.js';

class SPMasterFX extends SuperpoweredWebAudio.AudioWorkletProcessor {
  onReady() {
    const S = this.Superpowered, sr = this.samplerate;
    const safe = (name, make) => { try { return make(); } catch (e) { this.sendMessageToMainScope({ type: 'spfx-error', name, message: String(e) }); return null; } };
    this.chain = new S.Float32Buffer(128 * 2);
    this.reverb = safe('Reverb', () => new S.Reverb(sr, Math.max(96000, sr)));
    this.echo1 = safe('Echo1', () => new S.Echo(sr, Math.max(96000, sr)));
    this.echo2 = safe('Echo2', () => new S.Echo(sr, Math.max(96000, sr)));
    this.flanger = safe('Flanger', () => new S.Flanger(sr));
    this.bitcrusher = safe('Bitcrusher', () => new S.Bitcrusher(sr));
    this.gate = safe('Gate', () => new S.Gate(sr));
    this.roll = safe('Roll', () => new S.Roll(sr, Math.max(96000, sr)));
    this.whoosh = safe('Whoosh', () => new S.Whoosh(sr));
    this.compressor = safe('Compressor', () => new S.Compressor(sr));
    this.limiter = safe('Limiter', () => new S.Limiter(sr));
    this.clipper = safe('Clipper', () => new S.Clipper());
    this.filter = safe('Filter', () => new S.Filter(S.Filter.Resonant_Lowpass, sr));
    this.eq = safe('ThreeBandEQ', () => new S.ThreeBandEQ(sr));
    this.distortion = safe('GuitarDistortion', () => new S.GuitarDistortion(sr));
    this.delay = safe('Delay', () => new S.Delay(2000, Math.max(96000, sr), 128, sr));
    this.s = { bpm: 120 };
    this.configure(this.s);
    this.sendMessageToMainScope({ type: 'spfx-ready', version: '2.8.2' });
  }

  onDestruct() {
    for (const k of ['reverb','echo1','echo2','flanger','bitcrusher','gate','roll','whoosh','compressor','limiter','clipper','filter','eq','distortion','delay']) {
      try { this[k]?.destruct?.(); } catch {}
    }
    try { this.chain?.free?.(); } catch {}
  }

  onMessageFromMainScope(message) {
    if (!message || typeof message !== 'object') return;
    this.s = { ...this.s, ...message };
    this.configure(this.s);
  }

  configure(s) {
    const sr = this.samplerate, bpm = Math.max(40, Math.min(250, Number(s.bpm) || 120));
    const setSR = fx => { if (fx && 'samplerate' in fx) fx.samplerate = sr; };
    for (const fx of [this.reverb,this.echo1,this.echo2,this.flanger,this.bitcrusher,this.gate,this.roll,this.whoosh,this.compressor,this.limiter,this.filter,this.eq,this.distortion]) setSR(fx);

    if (this.reverb) {
      this.reverb.enabled = !!s.reverb;
      this.reverb.mix = Math.max(0, Math.min(1, (Number(s.reverbMix) || 0) / 100));
      this.reverb.width = 1;
      this.reverb.damp = Math.max(0, Math.min(1, (Number(s.damping) || 0) / 100));
      this.reverb.roomSize = Math.max(0, Math.min(1, (Number(s.space) || 0) / 100));
      this.reverb.predelayMs = Math.max(0, Math.min(500, Number(s.predelay) || 0));
      this.reverb.lowCutHz = 70;
    }
    const echoCfg = (fx, on, link, beats, ms, feedback, mix) => {
      if (!fx) return;
      fx.enabled = !!on;
      fx.bpm = bpm;
      fx.beats = Math.max(0.03125, Math.min(2, link ? Number(beats) || .5 : ((Number(ms) || 250) / (60000 / bpm))));
      fx.decay = Math.max(0, Math.min(.99, (Number(feedback) || 0) / 100));
      fx.setMix(Math.max(0, Math.min(1, (Number(mix) || 0) / 100)));
    };
    echoCfg(this.echo1, s.delay, s.delayLink, s.delayBeats, s.delayTime, s.feedback, s.delayMix);
    echoCfg(this.echo2, s.delay2, s.delay2Link, s.delay2Beats, s.delay2Time, s.delay2Feedback, s.delay2Mix);

    if (this.flanger) {
      this.flanger.enabled = !!s.flanger;
      this.flanger.bpm = bpm;
      this.flanger.wet = Math.max(0, Math.min(1, (Number(s.flangeMix) || 0) / 100));
      this.flanger.depth = Math.max(0, Math.min(1, (Number(s.flangeDepth) || 0) / 100));
      this.flanger.lfoBeats = Math.max(.25, Math.min(128, Number(s.flangeBeats) || 4));
      this.flanger.stereo = true;
    }
    if (this.bitcrusher) {
      this.bitcrusher.enabled = !!s.spBitcrusher;
      this.bitcrusher.bits = Math.max(1, Math.min(16, Math.round(Number(s.spBits) || 8)));
      this.bitcrusher.frequency = Math.max(20, Math.min(sr * .5, Number(s.spCrushHz) || 8000));
    }
    if (this.gate) {
      this.gate.enabled = !!s.spGate;
      this.gate.bpm = bpm;
      this.gate.beats = Math.max(.015625, Math.min(4, Number(s.spGateBeats) || .5));
      this.gate.wet = Math.max(0, Math.min(1, (Number(s.spGateWet) || 100) / 100));
    }
    if (this.roll) {
      this.roll.enabled = !!s.spRoll;
      this.roll.bpm = bpm;
      this.roll.beats = Math.max(.015625, Math.min(4, Number(s.spRollBeats) || .5));
      this.roll.wet = Math.max(0, Math.min(1, (Number(s.spRollWet) || 100) / 100));
    }
    if (this.whoosh) {
      this.whoosh.enabled = !!s.spWhoosh;
      this.whoosh.frequency = Math.max(20, Math.min(20000, Number(s.spWhooshFreq) || 500));
      this.whoosh.wet = Math.max(0, Math.min(1, (Number(s.spWhooshWet) || 40) / 100));
    }
    if (this.compressor) {
      this.compressor.enabled = !!s.spCompressor;
      this.compressor.thresholdDb = Math.max(-40, Math.min(0, Number(s.spCompThreshold) || -12));
      this.compressor.ratio = Number(s.spCompRatio) || 3;
      this.compressor.attackSec = Math.max(.0001, Math.min(1, (Number(s.spCompAttack) || 3) / 1000));
      this.compressor.releaseSec = Math.max(.1, Math.min(4, (Number(s.spCompRelease) || 300) / 1000));
      this.compressor.wet = Math.max(0, Math.min(1, (Number(s.spCompWet) || 100) / 100));
      this.compressor.hpCutOffHz = Math.max(1, Math.min(10000, Number(s.spCompHP) || 80));
    }
    if (this.limiter) {
      this.limiter.enabled = !!s.spLimiter;
      this.limiter.thresholdDb = Math.max(-40, Math.min(0, Number(s.spLimitThreshold) || -6));
      this.limiter.ceilingDb = Math.max(-40, Math.min(0, Number(s.spLimitCeiling) || -1));
      this.limiter.releaseSec = Math.max(.001, Math.min(1, (Number(s.spLimitRelease) || 80) / 1000));
    }
    if (this.clipper) {
      this.clipper.thresholdDb = Math.max(-100, Math.min(0, Number(s.spClipThreshold) || -3));
      this.clipper.maximumDb = Math.max(-48, Math.min(48, Number(s.spClipMaximum) || 6));
    }
    if (this.filter) {
      this.filter.enabled = !!s.spFilter;
      this.filter.type = s.spFilterType === 'HP' ? this.Superpowered.Filter.Resonant_Highpass : this.Superpowered.Filter.Resonant_Lowpass;
      this.filter.frequency = Math.max(20, Math.min(sr * .49, Number(s.spFilterFreq) || 8000));
      this.filter.resonance = Math.max(.01, Math.min(1, (Number(s.spFilterRes) || 20) / 100));
    }
    if (this.eq) {
      this.eq.enabled = !!s.spEq;
      const lin = db => Math.max(0, Math.min(8, Math.pow(2, (Number(db) || 0) / 6)));
      this.eq.low = lin(s.spEqLow); this.eq.mid = lin(s.spEqMid); this.eq.high = lin(s.spEqHigh);
    }
    if (this.distortion) {
      this.distortion.enabled = !!s.spDistortion;
      this.distortion.distortion1 = true;
      this.distortion.marshall = true;
      this.distortion.drive = Math.max(0, Math.min(1, (Number(s.spDrive) || 20) / 100));
      this.distortion.gainDecibel = Math.max(-36, Math.min(12, Number(s.spDistGain) || -8));
    }
    if (this.delay) {
      this.delay.samplerate = sr;
      this.delay.delayMs = Math.max(0, Math.min(2000, Number(s.spDelayMs) || 250));
    }
  }

  processAudio(inputBuffer, outputBuffer, frames) {
    const a = this.chain.array, input = inputBuffer.array;
    a.set(input.subarray(0, frames * 2));
    const p = this.chain.pointer;
    const run = fx => { if (fx) fx.process(p, p, frames); };

    run(this.reverb); run(this.echo1); run(this.echo2); run(this.flanger);
    run(this.bitcrusher); run(this.gate); run(this.roll); run(this.whoosh);
    if (this.s.spDelay && this.delay) {
      const dptr = this.delay.process(p, frames);
      const delayed = dptr?.array ? dptr.array : new Float32Array(this.Superpowered.linearMemory, dptr, frames * 2);
      const mix = Math.max(0, Math.min(1, (Number(this.s.spDelayMix) || 50) / 100));
      for (let i = 0; i < frames * 2; i++) a[i] = a[i] * (1 - mix) + delayed[i] * mix;
      if (dptr?.array) this.Superpowered.removeBuffer(dptr);
    }
    run(this.filter); run(this.eq); run(this.distortion); run(this.compressor);
    if (this.s.spClipper && this.clipper) this.clipper.process(p, p, frames);
    run(this.limiter);

    // Wet-return delta: master dry + globalReturn * (processed - dry).
    // At 100% return this reconstructs the exact serial Superpowered result.
    const out = outputBuffer.array;
    for (let i = 0; i < frames * 2; i++) out[i] = a[i] - input[i];
  }
}

if (typeof AudioWorkletProcessor === 'function') registerProcessor('SPMasterFX', SPMasterFX);
export default SPMasterFX;
