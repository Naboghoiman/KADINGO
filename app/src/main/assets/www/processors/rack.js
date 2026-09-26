/* Independent master DSP. No transport, beat clock or synchronization code here. */
class MasterRack extends AudioWorkletProcessor {
 constructor(){super();this.s={};this.ring=[new Float32Array(8192),new Float32Array(8192)];this.pos=0;this.env=0;this.gain=1;this.gate=1;this.low=[0,0];this.high=[0,0];this.side=0;this.lastMid=[0,0];this.hpout=[0,0];this.samplePair=new Float32Array(2);this.bands=[new Float32Array(2),new Float32Array(2),new Float32Array(2)];this.benv=[0,0,0];this.bg=[1,1,1];this.prev=[0,0];this.prev2=[0,0];this.frames=0;this.peak=[0,0];this.inputPeaks=[0,0];this.reduction=0;this.fxRing=[new Float32Array(262144),new Float32Array(262144)];this.fxPos=0;this.fxWritten=0;this.fxLP=[0,0];this.fxPhase=0;this.fxElapsed=0;this.fxAnchor=0;this.pitchRead=0;this.chorusRing=[new Float32Array(8192),new Float32Array(8192)];this.chorusPos=0;this.chorusPhase=0;this.rackFilterLP=[0,0];this.eqColorLP=[0,0];this.lastVdj="";this.rng=123456789;this.port.onmessage=e=>{this.s={...this.s,...e.data};};}
 comp(db,t,r,k){let x=db-t;if(k>0&&Math.abs(x)<k/2)return (1/r-1)*(x+k/2)*(x+k/2)/(2*k);return x>0?(t+x/r-db):0;}
 chorusRead(c,back){const n=(this.chorusPos-Math.max(1,Math.min(8188,back))+8192)%8192,a=Math.floor(n),f=n-a,ring=this.chorusRing[c];return ring[a]*(1-f)+ring[(a+1)%8192]*f;}
 fxRead(c,back){const n=(this.fxPos-Math.max(1,Math.min(262140,back))+262144)%262144,a=Math.floor(n),f=n-a,ring=this.fxRing[c];return ring[a]*(1-f)+ring[(a+1)%262144]*f;}
 vdj(l,r,s,sr){
  const name=String(s.vdjFx||'').toLowerCase(),on=!!s.vdjOn&&!s.bypass,p1=Math.max(0,Math.min(100,Number(s.vdjP1??50))),p2=Math.max(0,Math.min(100,Number(s.vdjP2??50))),mix=Math.max(0,Math.min(1,Number(s.fxAmount??35)/100));
  this.fxRing[0][this.fxPos]=l;this.fxRing[1][this.fxPos]=r;this.fxWritten=Math.min(262144,this.fxWritten+1);
  const key=(on?name:'');if(key!==this.lastVdj){this.fxPhase=0;this.fxElapsed=0;this.fxAnchor=this.fxPos;this.pitchRead=(this.fxPos-2048+262144)%262144;this.lastVdj=key;}
  if(on&&this.fxWritten>4096){const bpm=Math.max(40,Math.min(250,Number(s.bpm)||120)),beat=sr*60/bpm;this.fxPhase+=bpm/60/sr;this.fxElapsed+=1/sr;let a=l,b=r;
   const blend=(x,y)=>x*(1-mix)+y*mix, lpCut=80*Math.pow(220,p1/100),alpha=1-Math.exp(-2*Math.PI*Math.min(sr*.45,lpCut)/sr);
   if(name==='filter'||name==='filter lp'){this.fxLP[0]+=alpha*(l-this.fxLP[0]);this.fxLP[1]+=alpha*(r-this.fxLP[1]);a=this.fxLP[0];b=this.fxLP[1];}
   else if(name==='filter hp'){this.fxLP[0]+=alpha*(l-this.fxLP[0]);this.fxLP[1]+=alpha*(r-this.fxLP[1]);a=l-this.fxLP[0];b=r-this.fxLP[1];}
   else if(name==='wahwah'){const sweep=.5+.5*Math.sin(2*Math.PI*this.fxPhase*(.25+p1*.02)),fc=180*Math.pow(55,sweep),al=1-Math.exp(-2*Math.PI*Math.min(sr*.45,fc)/sr);this.fxLP[0]+=al*(l-this.fxLP[0]);this.fxLP[1]+=al*(r-this.fxLP[1]);a=(l-this.fxLP[0])*(.5+p2/100)+this.fxLP[0]*.35;b=(r-this.fxLP[1])*(.5+p2/100)+this.fxLP[1]*.35;}
   else if(name==='distortion'){const d=1+p1*.11,n=Math.tanh(d);a=Math.tanh(l*d)/n;b=Math.tanh(r*d)/n;}
   else if(name==='eq10'){const al=1-Math.exp(-2*Math.PI*220/sr);this.fxLP[0]+=al*(l-this.fxLP[0]);this.fxLP[1]+=al*(r-this.fxLP[1]);const tilt=(p1-50)/50*.6,mid=(p2-50)/50*.35;a=l+this.fxLP[0]*tilt+(l-this.fxLP[0])*mid;b=r+this.fxLP[1]*tilt+(r-this.fxLP[1])*mid;}
   else if(name==='noise'){this.rng=(1664525*this.rng+1013904223)>>>0;const n=this.rng/2147483648-1,w=p2/100*.45;a=l+n*w;b=r+n*w;}
   else if(name==='beat grid'||name==='slicer'){const steps=name==='beat grid'?16:8,step=Math.floor((this.fxPhase*4)%steps),pattern=name==='beat grid'?[1,1,0,1,1,0,1,0,1,1,0,1,0,1,1,0]:[1,0,1,0,1,1,0,1],g=pattern[step%pattern.length]?1:Math.max(0,1-p2/100);a=l*g;b=r*g;}
   else if(name==='backspin'){const speed=.5+p1/18,back=Math.min(this.fxWritten-2,this.fxElapsed*sr*speed*(1+this.fxElapsed*.8));a=this.fxRead(0,back);b=this.fxRead(1,back);}
   else if(name==='brakestart'){const dur=.25+p1*.04,t=Math.min(1,this.fxElapsed/dur),start=p2>=50,q=start?t:1-t,back=Math.min(this.fxWritten-2,(1-q)*beat*4+2);a=this.fxRead(0,back)*Math.sqrt(Math.max(0,q));b=this.fxRead(1,back)*Math.sqrt(Math.max(0,q));}
   else if(name==='flippin double'){const back=Math.max(2,beat*.5),phase=this.fxPhase%1;a=phase<.5?l:this.fxRead(0,back);b=phase<.5?r:this.fxRead(1,back);}
   else if(name==='loop out'||name==='loop roll'){const div=Math.pow(2,Math.round((p1-50)/20)),span=Math.max(128,beat/Math.max(.25,div)),back=2+(this.fxElapsed*sr)%span;a=this.fxRead(0,back);b=this.fxRead(1,back);if(name==='loop out'){const fade=Math.max(0,1-this.fxElapsed/(1+p2*.04));a*=fade;b*=fade;}}
   else if(name==='mobius'){const mod=.5+.5*Math.sin(2*Math.PI*this.fxPhase*(.125+p1*.01)),back=sr*(.001+.028*mod);a=this.fxRead(0,back);b=this.fxRead(1,back);}
   else if(name==='pitch'){const rate=.5+1.5*p1/100;this.pitchRead=(this.pitchRead+rate)%262144;const back=(this.fxPos-this.pitchRead+262144)%262144;a=this.fxRead(0,back);b=this.fxRead(1,back);}
   else if(name==='scratch dna'){const seq='CaDAEaEA',beatIndex=Math.floor(this.fxPhase)%4,frac=this.fxPhase%1,idx=(beatIndex*2+Math.floor(frac*2))%seq.length,ch=seq[idx],depth=(ch.toUpperCase().charCodeAt(0)-64)/5,seg=(frac*2)%1,back=Math.min(this.fxWritten-2,2+(1-Math.cos(Math.PI*2*seg))*.5*beat*.28*depth);a=this.fxRead(0,back);b=this.fxRead(1,back);if(ch===ch.toLowerCase()){a=0;b=0;}}
   else if(name==='spiral'){const back=Math.min(this.fxWritten-2,sr*(.06+.9*((this.fxPhase*.125)%1))),fb=.25+p2*.006;a=l+this.fxRead(0,back)*fb;b=r+this.fxRead(1,back)*fb;}
   if(name!=='filter'&&name!=='filter lp'&&name!=='filter hp'&&name!=='wahwah') {a=blend(l,a);b=blend(r,b);} else {a=blend(l,a);b=blend(r,b);}l=a;r=b;
  }
  this.fxPos=(this.fxPos+1)%262144;return [l,r];
 }
 process(inputs,outputs){const input=inputs[0],out=outputs[0];if(!out?.[0])return true;const s=this.s,sr=sampleRate;
  const attack=Math.exp(-1/(sr*Math.max(.0001,(s.attack??20)/1000))),release=Math.exp(-1/(sr*Math.max(.01,(s.release??180)/1000)));
  const lc=1-Math.exp(-2*Math.PI*(s.lowCross??120)/sr),hc=1-Math.exp(-2*Math.PI*(s.highCross??4000)/sr),sc=1-Math.exp(-2*Math.PI*120/sr),sh=Math.exp(-2*Math.PI*(s.scHP??120)/sr);
  const ceiling=Math.pow(10,(s.ceiling??-1)/20),drive=Math.pow(10,((s.drive??0)+(s.maximizer??0)*.06)/20),makeup=Math.pow(10,(s.makeup??0)/20);
  const delay=Math.max(1,Math.min(2048,Math.round(sr*(s.lookahead??4)/1000))),limitRelease=Math.exp(-1/(sr*((s.limitRelease??160)/1000)));
  const clipDrive=10**((s.clipDrive??4)/20),clipMix=(s.clipSaturation??45)/100,clipShape=1+3*clipMix,clipNorm=Math.tanh(clipShape),clipHard=s.clipHardness??.5,clipTrim=10**((s.clipOutput??-.5)/20);
  for(let i=0;i<out[0].length;i++){
   let l=input?.[0]?.[i]||0,r=input?.[1]?.[i]??l;
   this.inputPeaks[0]=Math.max(this.inputPeaks[0],Math.abs(l));this.inputPeaks[1]=Math.max(this.inputPeaks[1],Math.abs(r));
   if(!s.bypass){
    const globalWet=Math.max(0,Math.min(1,Number(s.fxAmount??35)/100));
    // Chorus: independent short modulated stereo delay.
    this.chorusRing[0][this.chorusPos]=l;this.chorusRing[1][this.chorusPos]=r;
    if(s.chorus){const amt=globalWet*Math.max(0,Math.min(1,Number(s.chorusAmount??35)/100)),mode=String(s.chorusMode||"WIDE").toUpperCase(),rate=mode==="DEEP"?.22:mode==="CLASSIC"?.38:.28,depth=mode==="DEEP"?.008:mode==="CLASSIC"?.0045:.006,base=mode==="DEEP"?.018:.013;this.chorusPhase=(this.chorusPhase+rate/sr)%1;const dl=sr*(base+depth*(.5+.5*Math.sin(2*Math.PI*this.chorusPhase))),dr=sr*(base+depth*(.5+.5*Math.sin(2*Math.PI*(this.chorusPhase+.27))));const wl=this.chorusRead(0,dl),wr=this.chorusRead(1,dr);l=l*(1-amt)+wl*amt;r=r*(1-amt)+wr*amt;}this.chorusPos=(this.chorusPos+1)%8192;
    // Musical distortion with three drive characters.
    if(s.rackDistortion){const a=globalWet*Math.max(0,Math.min(1,Number(s.rackDistAmount??30)/100)),mode=String(s.rackDistMode||"WARM").toUpperCase(),drive=mode==="HARD"?1+Number(s.rackDistAmount??30)*.13:mode==="SOFT"?1+Number(s.rackDistAmount??30)*.045:1+Number(s.rackDistAmount??30)*.075,n=Math.tanh(drive),dl=Math.tanh(l*drive)/n,dr=Math.tanh(r*drive)/n;l=l*(1-a)+dl*a;r=r*(1-a)+dr*a;}
    // Dedicated rack filter; amount sweeps cutoff while keeping 0 close to transparent.
    if(s.rackFilterOn){const a=globalWet*Math.max(0,Math.min(1,Number(s.rackFilterAmount??30)/100)),typ=String(s.rackFilterType||"LOW PASS").toUpperCase();if(typ==="HIGH PASS"){const fc=20*Math.pow(100,a),al=1-Math.exp(-2*Math.PI*Math.min(sr*.45,fc)/sr);this.rackFilterLP[0]+=al*(l-this.rackFilterLP[0]);this.rackFilterLP[1]+=al*(r-this.rackFilterLP[1]);l=l*(1-a)+(l-this.rackFilterLP[0])*a;r=r*(1-a)+(r-this.rackFilterLP[1])*a;}else if(typ==="BAND COLOR"){const fc=400*Math.pow(8,a),al=1-Math.exp(-2*Math.PI*Math.min(sr*.45,fc)/sr);this.rackFilterLP[0]+=al*(l-this.rackFilterLP[0]);this.rackFilterLP[1]+=al*(r-this.rackFilterLP[1]);const ml=l-this.rackFilterLP[0],mr=r-this.rackFilterLP[1];l=l*(1-a*.35)+(this.rackFilterLP[0]*.45+ml*.8)*a*.35;r=r*(1-a*.35)+(this.rackFilterLP[1]*.45+mr*.8)*a*.35;}else{const fc=2e4*Math.pow(.02,a),al=1-Math.exp(-2*Math.PI*Math.min(sr*.45,fc)/sr);this.rackFilterLP[0]+=al*(l-this.rackFilterLP[0]);this.rackFilterLP[1]+=al*(r-this.rackFilterLP[1]);l=l*(1-a)+this.rackFilterLP[0]*a;r=r*(1-a)+this.rackFilterLP[1]*a;}}
    // EQ Color: subtle shelf/tilt, intentionally gain bounded for clean master audio.
    if(s.eqColorOn){const a=globalWet*Math.max(0,Math.min(.45,Number(s.eqColorAmount??25)/220)),al=1-Math.exp(-2*Math.PI*220/sr);this.eqColorLP[0]+=al*(l-this.eqColorLP[0]);this.eqColorLP[1]+=al*(r-this.eqColorLP[1]);const ll=this.eqColorLP[0],lr=this.eqColorLP[1],hl=l-ll,hr=r-lr,mode=String(s.eqColorMode||"WARM").toUpperCase();if(mode==="BRIGHT"){l=l+hl*a;r=r+hr*a;}else if(mode==="DEEP"){l=l+ll*a*.9-hl*a*.08;r=r+lr*a*.9-hr*a*.08;}else{l=l+ll*a*.55-hl*a*.12;r=r+lr*a*.55-hr*a*.12;}}
    if((s.width??100)!==100||s.monoBass){const mid=(l+r)*.5;let side=(l-r)*.5*(s.width??100)/100;this.side+=sc*(side-this.side);if(s.monoBass)side-=this.side;l=mid+side;r=mid-side;}
    let detector=0;if(s.compressor||s.denoise>0||s.noiseGate>0)detector=Math.max(Math.abs(l),Math.abs(r));
    if(s.compressor){this.hpout[0]=sh*(this.hpout[0]+l-this.lastMid[0]);this.hpout[1]=sh*(this.hpout[1]+r-this.lastMid[1]);this.lastMid[0]=l;this.lastMid[1]=r;const cdet=s.scHP>20?Math.max(Math.abs(this.hpout[0]),Math.abs(this.hpout[1])):detector;this.env=Math.max(1e-9,(cdet>this.env?attack:release)*this.env+(1-(cdet>this.env?attack:release))*cdet);const db=20*Math.log10(this.env),gr=this.comp(db,s.threshold??-12,s.ratio??2,s.softKnee?6:0);const cg=Math.pow(10,gr/20)*makeup,mix=(s.compMix??100)/100;l*=1-mix+mix*cg;r*=1-mix+mix*cg;this.reduction=Math.max(this.reduction,-gr);}
    if(s.denoise>0||s.noiseGate>0){const threshold=Math.pow(10,(-80+(s.noiseGate??0)*.5)/20),desired=detector<threshold?Math.pow(Math.max(.01,detector/threshold),.5+(s.denoise??0)/50):1;const c=desired>this.gate?.015:.00015;this.gate+=c*(desired-this.gate);l*=this.gate;r*=this.gate;}
    if(s.multiband){const samples=this.samplePair,bands=this.bands;samples[0]=l;samples[1]=r;for(let c=0;c<2;c++){this.low[c]+=lc*(samples[c]-this.low[c]);this.high[c]+=hc*(samples[c]-this.high[c]);bands[0][c]=this.low[c];bands[2][c]=samples[c]-this.high[c];bands[1][c]=samples[c]-bands[0][c]-bands[2][c];}l=0;r=0;
     for(let b=0;b<3;b++){const peak=Math.max(Math.abs(bands[b][0]),Math.abs(bands[b][1])),a=peak>this.benv[b]?attack:release;this.benv[b]=a*this.benv[b]+(1-a)*peak;let gr=this.comp(20*Math.log10(Math.max(1e-9,this.benv[b])),s['threshold'+b]??-18,s['ratio'+b]??2,6);if(s.autoMakeup)gr+=Math.min(6,-(s['threshold'+b]??-18)*.15);this.bg[b]=Math.pow(10,gr/20);l+=bands[b][0]*this.bg[b];r+=bands[b][1]*this.bg[b];}
    }
    if(s.warmth>0){const d=1+s.warmth/25,n=Math.tanh(d);l=Math.tanh(l*d)/n;r=Math.tanh(r*d)/n;}
    if(s.clipEnabled){
      const x=l*clipDrive,y=r*clipDrive,sl=Math.tanh(x*clipShape)/clipNorm,sr0=Math.tanh(y*clipShape)/clipNorm;
      l=(x*(1-clipMix)+(sl+(Math.max(-1,Math.min(1,x))-sl)*clipHard)*clipMix)*clipTrim;
      r=(y*(1-clipMix)+(sr0+(Math.max(-1,Math.min(1,y))-sr0)*clipHard)*clipMix)*clipTrim;
    }
    if(s.cut){const phase=(currentFrame+i)/sr*(s.bpm??120)/60*(s.cutRate??1);const duty=Math.max(.02,Math.min(.98,(s.cutDepth??50)/100));l*=phase%1<duty?1:1-(s.fxAmount??25)/100;r*=phase%1<duty?1:1-(s.fxAmount??25)/100;}
    if(s.vdjOn)[l,r]=this.vdj(l,r,s,sr);
   }
   l*=s.bypass?1:drive;r*=s.bypass?1:drive;
   let peak=Math.max(Math.abs(l),Math.abs(r));
   // Inter-sample peak estimate, with configurable subdivision; not a certified dBTP meter.
   const oversample=s.limiter&&!s.bypass?(s.oversample??4):1;for(let c=0;c<2;c++){const v=c?r:l,p=this.prev[c],p2=this.prev2[c];for(let k=1;k<oversample;k++){const t=k/oversample;peak=Math.max(peak,Math.abs(p+(v-p)*t+.5*t*(1-t)*(p-p2)));}this.prev2[c]=p;this.prev[c]=v;}
   this.ring[0][this.pos]=l;this.ring[1][this.pos]=r;
   // Fixed lookahead ring remains in circuit for both channels, even in bypass.
   if(s.limiter&&!s.bypass){const need=Math.min(1,ceiling/Math.max(1e-9,peak));if(need<this.gain){this.gain=need;this.hold=delay;}else if(this.hold>0)this.hold--;else this.gain=limitRelease*this.gain+(1-limitRelease)*need;}else this.gain=1;
   const read=(this.pos-delay+8192)%8192;
   for(let c=0;c<out.length;c++){let v=this.ring[Math.min(c,1)][read]*this.gain;out[c][i]=Number.isFinite(v)?v:0;if(c<2)this.peak[c]=Math.max(this.peak[c],Math.abs(out[c][i]));}this.pos=(this.pos+1)%8192;
  }
  this.frames+=out[0].length;if(this.frames>=sr/15){this.port.postMessage({inputPeaks:this.inputPeaks,peaks:this.peak,gr:this.reduction,limitGR:-20*Math.log10(Math.max(this.gain,1e-9)),bandGR:this.bg.map(v=>-20*Math.log10(Math.max(v,1e-9)))});this.peak=[0,0];this.inputPeaks=[0,0];this.reduction=0;this.frames=0;}
  return true;
 }
}
registerProcessor('master-rack',MasterRack);
class PitchLock extends AudioWorkletProcessor {
 constructor(){super();this.rings=[new Float32Array(32768),new Float32Array(32768)];this.pos=0;this.phase=0;this.ratio=1;this.port.onmessage=e=>{this.ratio=Math.max(.5,Math.min(2,e.data.ratio||1));};}
 read(ring,d){const n=(this.pos-d+32768)%32768,a=Math.floor(n),f=n-a;return ring[a]*(1-f)+ring[(a+1)%32768]*f;}
 process(inputs,outputs){const src=inputs[0],dst=outputs[0],span=sampleRate*.06;for(let i=0;i<dst[0].length;i++){
  this.phase=(this.phase+(1-this.ratio)/span+1)%1;
  for(let c=0;c<dst.length;c++){const ring=this.rings[Math.min(c,1)];ring[this.pos]=src?.[c]?.[i]??src?.[0]?.[i]??0;
   const p=this.phase,q=(p+.5)%1,w=.5-.5*Math.cos(2*Math.PI*p);
   dst[c][i]=Math.abs(this.ratio-1)<.00001?this.read(ring,span*.5+2):this.read(ring,2+p*span)*w+this.read(ring,2+q*span)*(1-w);
  }this.pos=(this.pos+1)%32768;
 }return true;}
}
registerProcessor('pitch-lock',PitchLock);
// Slip/DNA scratch. Transport and sync clocks remain untouched; only audible deck output is scrubbed.
// Parallel scratch return. Idle output is zero; the original deck route stays live.
// The deck transport keeps running underneath, so release returns in rhythm.
class AutoScratch extends AudioWorkletProcessor {
 constructor(){
  super();this.mode='idle';this.mix=0;this.gate=0;this.left=null;this.right=null;
  this.position=0;this.anchor=0;this.step=0;this.remaining=0;this.depth=5;
  this.sourceRate=sampleRate;this.bpm=120;this.sourceBpm=120;this.beat=0;
  this.pattern=['CADA','EAEA'];this.token=0;this.heartbeat=0;
  this.port.onmessage=({data:s})=>{
   if(Number.isFinite(s.depth))this.depth=Math.max(1,Math.min(10,s.depth));
   if(s.bpm>0)this.bpm=s.bpm;
   if(s.reset){this.mode='idle';this.remaining=0;}
   if(s.type==='begin'&&s.left?.length>1&&s.right?.length===s.left.length){
    this.left=s.left;this.right=s.right;this.sourceRate=s.sampleRate;
    this.anchor=Math.max(0,Math.min(this.left.length-1,s.anchor));
    this.position=this.anchor;this.mode=s.mode==='manual'?'manual':'auto';
    this.token=s.token;this.sourceBpm=s.sourceBpm||120;this.beat=0;
    this.step=0;this.remaining=0;this.gate=0;this.heartbeat=currentFrame;
    const pattern=String(s.pattern||'CADA.EAEA.').split('.').filter(v=>/^[A-Za-z]+$/.test(v));
    this.pattern=pattern.length?pattern:['CADA','EAEA'];
   }else if(s.token===this.token){
    if(s.type==='move'&&this.mode==='manual'&&Number.isFinite(s.offset)){
     const target=Math.max(0,Math.min(this.left.length-1,this.anchor+s.offset*this.sourceRate));
     this.remaining=Math.round(sampleRate*Math.max(.006,Math.min(.04,s.seconds||.016)));
     this.step=(target-this.position)/this.remaining;this.heartbeat=currentFrame;
    }else if(s.type==='heartbeat')this.heartbeat=currentFrame;
    else if(s.type==='end'){this.mode='idle';this.remaining=0;}
   }
  };
 }
 read(data,pos){
  if(!data||pos<0||pos>=data.length-1)return 0;
  const i=Math.floor(pos),f=pos-i;
  return data[i]+(data[i+1]-data[i])*f;
 }
 process(inputs,outputs){
  const input=inputs[0],out=outputs[0];if(!out?.[0])return true;
  if(this.mode!=='idle'&&currentFrame-this.heartbeat>sampleRate)this.mode='idle';
  if(this.mode==='idle'&&this.mix===0){
   for(let c=0;c<out.length;c++)out[c].fill(0);
   this.left=null;this.right=null;return true;
  }
  const fade=1/(sampleRate*.006),gateFade=1/(sampleRate*.002);
  for(let i=0;i<out[0].length;i++){
   const active=this.mode!=='idle';this.mix+=Math.max(-fade,Math.min(fade,(active?1:0)-this.mix));
   let audible=0;
   if(this.mode==='manual'&&this.remaining>0){
    this.position+=this.step;this.remaining--;audible=Math.min(1,Math.abs(this.step)*this.sourceRate/sampleRate*40);
   }else if(this.mode==='auto'){
    const bi=Math.floor(this.beat)%this.pattern.length,group=this.pattern[bi],phase=(this.beat%1)*group.length,
     index=Math.min(group.length-1,Math.floor(phase)),fraction=phase-index,
     previous=index?group[index-1]:this.pattern[(bi+this.pattern.length-1)%this.pattern.length].slice(-1),next=group[index],
     start=previous.toUpperCase().charCodeAt(0)-65,end=next.toUpperCase().charCodeAt(0)-65,
     unit=this.sourceRate*60/this.sourceBpm*(.075+.01*this.depth);
    this.position=this.anchor+(start+(end-start)*fraction)*unit;
    audible=next===next.toUpperCase()?1:0;
    this.beat=(this.beat+this.bpm/60/sampleRate)%this.pattern.length;
   }
   this.gate+=Math.max(-gateFade,Math.min(gateFade,audible-this.gate));
   for(let c=0;c<out.length;c++){
    const live=input?.[c]?.[i]??input?.[0]?.[i]??0,
     scratch=this.read(c?this.right:this.left,this.position)*this.gate;
    out[c][i]=(scratch-live)*this.mix;
   }
  }
  return true;
 }
}
registerProcessor('auto-scratch',AutoScratch);
