/* Loop audio follows a read-only deck clock. No live deck transport is written. */
const mod=(a,b)=>((a%b)+b)%b;
class GroovePads extends AudioWorkletProcessor {
 constructor(){super();this.slots=Array(12).fill(null);this.anchor={time:0,beat:0,bps:2,playing:false};this.key=0;this.ticks=0;
  this.port.onmessage=({data:m})=>{
   if(m.type==='clock'){this.anchor=m;for(const p of m.plans||[]){const s=this.slots[p.index];if(s){this.setPlan(s,p);if(p.wait)s.started=false;}}}
   else if(m.type==='load')this.slots[m.index]={index:m.index,left:m.left,right:m.right,rate:m.sampleRate,beats:m.beats,gridOffset:m.gridOffset||0,startTime:Infinity,on:false,started:false,level:0,gain:m.gain??1,transition:0};
   else if(m.type==='play'){const s=this.slots[m.index];if(s){this.setPlan(s,m);s.on=true;s.started=false;}}
   else if(m.type==='stop'){const s=this.slots[m.index];if(s)s.on=false;}
   else if(m.type==='remove')this.slots[m.index]=null;
   else if(m.type==='beats'&&this.slots[m.index])this.slots[m.index].beats=m.beats;
   else if(m.type==='key')this.key=Math.max(-12,Math.min(12,m.value));
  };
 }
 setPlan(s,p){
  if(s.started&&s.level>.001&&Number.isFinite(s.lastPos)){
   s.oldPos=s.lastPos+(s.lastStep||0);s.oldStep=s.lastStep||0;s.transition=Math.round(sampleRate*.01);s.fadeFrames=s.transition;
  }
  s.startTime=p.at;s.referenceBeat=p.referenceBeat;s.phase=p.phase;s.ratio=p.ratio;s.gridOffset=p.gridOffset;
 }
 beatAt(t){return this.anchor.beat+(this.anchor.playing?Math.max(0,t-this.anchor.time)*this.anchor.bps:0);}
 read(a,p){p=mod(p,a.length);const n=Math.floor(p),f=p-n;return a[n]+(a[(n+1)%a.length]-a[n])*f;}
 process(inputs,outputs){const out=outputs[0];if(!out?.length)return true;const n=out[0].length;for(const ch of out)ch.fill(0);
  const time=currentFrame/sampleRate,beat=this.beatAt(time),pitch=2**(this.key/12),grain=.045*sampleRate,playing=this.anchor.playing;
  // Iterate loaded, active slots once per block, not twelve slots per sample.
  for(const s of this.slots){if(!s||(!s.on&&s.level<.00001))continue;
   const step=s.left.length/s.beats*this.anchor.bps*s.ratio/sampleRate;
   let f=mod((s.phase+(beat-s.referenceBeat)*s.ratio)/s.beats*s.left.length+s.gridOffset*s.rate,s.left.length);
   for(let i=0;i<n;i++){
    const now=time+i/sampleRate;
    if(s.on&&!s.started&&playing&&now>=s.startTime){s.started=true;this.port.postMessage({type:'started',index:s.index,time:now,beat:this.beatAt(now)});}
    const gate=s.on&&playing&&s.started;s.level+=(Number(gate)-s.level)*.008;
    if(s.level>.00001){let l,r;
     if(Math.abs(pitch-1)<.00001){l=this.read(s.left,f);r=this.read(s.right,f);}
     else{l=0;r=0;for(let g=0;g<4;g++){const ph=mod((currentFrame+i)/grain+g/4,1),w=(1-Math.cos(2*Math.PI*ph))/4,p=f+(ph-.5)*grain*(pitch-1)*step;l+=this.read(s.left,p)*w;r+=this.read(s.right,p)*w;}}
     const seam=Math.min(1,f/32,(s.left.length-f)/32);l*=seam;r*=seam;
     if(s.transition>0){const a=1-s.transition/s.fadeFrames;l=this.read(s.left,s.oldPos)*(1-a)+l*a;r=this.read(s.right,s.oldPos)*(1-a)+r*a;s.oldPos+=s.oldStep;s.transition--;}
     out[0][i]+=l*s.level*s.gain;if(out[1])out[1][i]+=r*s.level*s.gain;
    }
    s.lastPos=f;s.lastStep=playing?step:0;if(playing)f=mod(f+step,s.left.length);
   }
  }
  let peak=0;for(const ch of out)for(let i=0;i<n;i++){if(!Number.isFinite(ch[i]))ch[i]=0;peak=Math.max(peak,Math.abs(ch[i]));}
  if(++this.ticks%32===0)this.port.postMessage({type:'meter',peak,beat:this.beatAt(time+n/sampleRate)});
  return true;
 }
}
registerProcessor('groove-pads',GroovePads);

/* Parallel effect return. The original deck -> master connection stays intact.
 * Silence when idle; wet-minus-dry while active, aligned within the same frame. */
class DeckPadInsert extends AudioWorkletProcessor {
 constructor(){super();this.ring=[new Float32Array(1<<20),new Float32Array(1<<20)];this.mask=(1<<20)-1;this.write=0;this.filled=0;this.roll=null;this.rolling=false;this.mix=0;this.fx='OFF';this.fxMix=0;this.lastFx='OFF';this.amount=.35;this.bpm=120;this.phase=0;
  this.port.onmessage=({data:m})=>{
   if(m.type==='roll'){const len=Math.min(this.filled,this.mask,Math.round(60/this.bpm*m.beats*sampleRate));if(len>32){this.roll={start:this.write-len,length:len,position:0};this.rolling=true;}}
   else if(m.type==='release')this.rolling=false;
   else if(m.type==='fx'){this.fx=m.fx;if(m.fx!=='OFF')this.lastFx=m.fx;this.amount=m.amount??this.amount;}
   else if(m.type==='bpm')this.bpm=m.bpm;
  };
 }
 process(inputs,outputs){const input=inputs[0],out=outputs[0];if(!out?.length)return true;const n=out[0].length;
  if(!this.rolling&&this.mix<.00001&&this.fx==='OFF'&&this.fxMix<.00001){
   const start=this.write&this.mask,first=Math.min(n,this.mask+1-start);
   for(let c=0;c<2;c++){const a=input?.[c]||input?.[0],b=this.ring[c];if(a){b.set(a.subarray(0,first),start);if(first<n)b.set(a.subarray(first),0);}else{b.fill(0,start,start+first);if(first<n)b.fill(0,0,n-first);}if(out[c])out[c].fill(0);}
   this.write+=n;this.filled=Math.min(this.mask,this.filled+n);this.phase+=n*this.bpm/60/sampleRate;return true;
  }
  for(let i=0;i<n;i++){
   this.mix+=(Number(this.rolling)-this.mix)*.01;this.fxMix+=(Number(this.fx!=='OFF')-this.fxMix)*.01;this.phase+=this.bpm/60/sampleRate;
   for(let c=0;c<out.length;c++){
    const a=input?.[c]||input?.[0],dry=a?.[i]||0,buf=this.ring[Math.min(c,1)];buf[this.write&this.mask]=dry;let v=dry;
    if(this.roll){const wet=buf[(this.roll.start+this.roll.position)&this.mask];v=dry*(1-this.mix)+wet*this.mix;}
    let fx=v;
    if(this.lastFx==='ECHO'){const delay=Math.max(1,Math.round(sampleRate*30/this.bpm));fx+=buf[(this.write-delay)&this.mask]*this.amount*.6;}
    else if(this.lastFx==='FLANGER'){const delay=Math.round(sampleRate*(.003+.0025*Math.sin(this.phase*Math.PI)));fx=v*(1-this.amount*.5)+buf[(this.write-delay)&this.mask]*this.amount*.5;}
    else if(this.lastFx==='CUT')fx*=mod(this.phase,1)<.5?1:1-this.amount;
    out[c][i]=v+(fx-v)*this.fxMix-dry;
   }
   if(this.roll)this.roll.position=(this.roll.position+1)%this.roll.length;
   if(!this.rolling&&this.mix<.00001)this.roll=null;
   this.write++;this.filled=Math.min(this.mask,this.filled+1);
  }return true;
 }
}
registerProcessor('deck-pad-insert',DeckPadInsert);
