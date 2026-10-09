import {Ecology,SPECIES,animal,isDeer,clamp} from './ecology.js';
import {TERRAIN} from './terrain.js';
const TAU=Math.PI*2;
runOnStartup(runtime=>{
 let app=null;
 runtime.addEventListener('afteranylayoutstart',e=>{
  app?.dispose();app=null;runtime.timeScale=1;
  if(e.layout.name==='game'){app=new PopulationApp(runtime);runtime.eco=app;globalThis.populationDebug=()=>app?.snapshot();}
 });
 runtime.addEventListener('tick',()=>app?.tick());
 runtime.addEventListener('pointerdown',e=>app?.pointerDown(e));
 runtime.addEventListener('pointermove',e=>app?.pointerMove(e));
 runtime.addEventListener('pointerup',e=>app?.pointerUp(e));
 runtime.addEventListener('pointercancel',()=>app?.cancelDrag());
 runtime.addEventListener('keydown',e=>{
  if(!app)return;
  if(e.code==='Space')app.togglePause();
  if(e.code==='F8')console.info('POPULATION_CHECK '+JSON.stringify(app.snapshot()));
  if(e.code==='Escape'){app.cancelDrag();app.clearDraft();app.showRemove(null);if(app.help)app.toggleHelp();}
 });
});
export class PopulationApp {
 constructor(runtime){
  this.r=runtime;this.instances=new Map();this.tags=new Map();this.paused=false;this.speed=1;this.zoom=1;this.help=false;this.selected=null;this.muted=true;this.pan=[960,540];this.drag=null;this.toast='';this.toastUntil=0;this.last=performance.now();this.lastPlace=-5;this.fps=60;this.errs=[];this.guides=[];this.draft=null;this.ghost=null;this.context=null;
  this.model=new Ecology({habitat:(x,y)=>this.habitat(x,y),add:e=>this.addSprite(e),remove:(e,why)=>this.removeSprite(e,why),blocked:(e,x,y,a)=>this.blocked(e,x,y,a),canReach:(a,b)=>this.canReach(a,b),contact:(a,b)=>this.contact(a,b),notice:(s,t)=>this.notice(s,t),moved:e=>this.transform(e,this.instances.get(e.id))});
  // Hidden layout instances retain Construct's creation defaults; the habitat starts empty.
  for(const kind of Object.keys(SPECIES))for(const s of runtime.objects[kind].getAllInstances())s.destroy();
  this.model.initialAnimals=this.model.entities.filter(e=>animal(e.kind)).length;
  // Ambient river flow stays alive while the ecological simulation is paused.
  this.one('Terrain').timeScale=1;
  const focus=this.one('PauseFocus');focus.timeScale=1;
  focus.behaviors.Flash.addEventListener('flashend',()=>{focus.isVisible=false;});
  focus.behaviors.Flash.flash(.65,.45,12);
  this.initPlacementUI();this.r.timeScale=1;this.applyZoom();this.notice('Arazi boş. Soldan bitki ve hayvan seçerek komünitenizi oluşturun.',8);this.updateUI();
 }
 one(name){return this.r.objects[name]?.getFirstInstance();}
 habitat(x,y){
  const cx=clamp(Math.floor(x/24),0,79),cy=clamp(Math.floor(y/24),0,44);const c=TERRAIN[cy][cx];let near=Infinity;
  for(let yy=Math.max(0,cy-7);yy<=Math.min(44,cy+7);yy++)for(let xx=Math.max(0,cx-7);xx<=Math.min(79,cx+7);xx++)if(TERRAIN[yy][xx]==='W')near=Math.min(near,Math.hypot(xx-cx,yy-cy)*24);
  // The shallow river stones provide two crossings, while the deep river is not a placement surface.
  const shallow=c==='W'&&((x>930&&x<1075)||(x>1400&&x<1505));
  return {land:c!=='R'&&(c!=='W'||shallow),water:c==='W',wet:near<130,sun:c==='S',zone:c==='W'?'su':near<130?'sulak kıyı':c==='D'?'gölge':'güneş'};
 }
 addSprite(e){
  const s=this.pendingSprite||this.r.objects[e.kind].createInstance(SPECIES[e.kind].plant?'plants':'game',e.x,e.y);
  s.setSize(e.width,e.height);s.animationFrame=e.frame;s.stopAnimation();s.isVisible=true;this.instances.set(e.id,s);
 }
 removeSprite(e,why){if(this.context===e)this.showRemove(null);this.instances.get(e.id)?.destroy();this.instances.delete(e.id);this.tags.get(e.id)?.destroy();this.tags.delete(e.id);if(why==='starvation')this.notice(`${SPECIES[e.kind].label} açlıktan kayboldu. Popülasyon −1.`,3);}
 transform(e,s,x=e.x,y=e.y,a=e.angle){s.x=x;s.y=y;if(animal(e.kind))s.animationFrame=Math.round(((Math.PI/2-a)%TAU+TAU)%TAU/TAU*60);else s.animationFrame=e.frame;}
 blocked(e,x,y,a){
  let s=this.instances.get(e.id),temporary=false;
  if(!s){s=this.r.objects[e.kind].createInstance(SPECIES[e.kind].plant?'plants':'game',x,y);s.setSize(e.width,e.height);s.stopAnimation();temporary=true;}
  const old=[s.x,s.y,s.animationFrame];this.transform(e,s,x,y,a);
  let blocked=false;
  for(const o of this.model.entities){if(o===e||!o.alive||(!animal(o.kind)&&o.kind!=='Pine'))continue;const other=this.instances.get(o.id);if(other&&s.testOverlap(other)){blocked=true;break;}}
  if(temporary)s.destroy();else{s.x=old[0];s.y=old[1];s.animationFrame=old[2];}return blocked;
 }
 contact(a,b){
  const sa=this.instances.get(a.id),sb=this.instances.get(b.id);if(!sa||!sb)return false;
  const ox=sa.x,oy=sa.y,angle=Math.atan2(b.y-a.y,b.x-a.x);
  sa.x+=Math.cos(angle)*12;sa.y+=Math.sin(angle)*12;const hit=sa.testOverlap(sb);sa.x=ox;sa.y=oy;return hit;
 }
 canReach(a,b){
  for(const p of this.model.entities){if(!p.alive||p.kind!=='Pine')continue;const s=this.instances.get(p.id);for(let t=.1;t<1;t+=.15)if(s.containsPoint(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return false;}return true;
 }
 initPlacementUI(){
  // Reuse the existing native white Panel sprite; no additional textures or addons.
  for(let i=0;i<4;i++){const s=this.r.objects.Panel.createInstance('game',0,0);s.isVisible=false;this.guides.push(s);}
  this.removeBg=this.r.objects.Panel.createInstance('buttons',0,0);this.removeBg.setSize(150,48);this.removeBg.colorRgb=[1,.32,.23];this.removeBg.isVisible=false;
  this.removeText=this.r.objects.Status.createInstance('buttons',0,0);this.removeText.setSize(130,44);this.removeText.text='Kaldır ×';this.removeText.isVisible=false;
 }
 showRemove(e){this.context=e?.alive?e:null;this.removeBg.isVisible=this.removeText.isVisible=!!this.context;if(this.context)this.positionRemove();}
 positionRemove(){
  const e=this.context;if(!e?.alive){this.showRemove(null);return;}
  const css=this.r.layout.getLayer('game').layerToCssPx(e.x,e.y-e.height*.28);
  const [x,y]=this.r.layout.getLayer('buttons').cssPxToLayer(...css);
  this.removeBg.x=clamp(x,270,1800);this.removeBg.y=clamp(y-35,155,950);
  this.removeText.x=this.removeBg.x-54;this.removeText.y=this.removeBg.y-22;
 }
 candidate(kind){
  if(kind==='Deer'){const n=k=>this.model.entities.filter(e=>e.alive&&e.kind===k).length;kind=n('Stag')<=n('Doe')?'Stag':'Doe';}
  return {kind,id:-1,width:{Wolf:260,Stag:345,Doe:240,Fox:180,Rabbit:125,Grass:192,Clover:175,Pine:270}[kind],height:{Wolf:244,Stag:369,Doe:259,Fox:174,Rabbit:132,Grass:192,Clover:169,Pine:324}[kind],frame:animal(kind)?15:24,biomass:.4,angle:0};
 }
 makeGhost(e){
  this.ghost?.destroy();this.ghost=this.r.objects[e.kind].createInstance('overlay',0,0);
  this.ghost.animationFrame=e.frame;this.ghost.stopAnimation();this.ghost.isVisible=true;this.ghost.opacity=.85;
 }
 select(kind){
  if(this.help)return;this.cancelDrag();this.clearDraft();this.showRemove(null);
  this.selected=kind;this.draft=this.candidate(kind);this.makeGhost(this.draft);this.parkDraft();
  this.notice(`${SPECIES[this.draft.kind].label}: tutup toprağa sürükleyin. Çerçeve yeşil olduğunda bırakın.`,5);this.updateUI();
 }
 parkDraft(){
  if(!this.draft||!this.ghost)return;const btn=this.one(this.selected+'Btn'),e=this.draft;
  this.ghost.x=btn.x+35;this.ghost.y=btn.y;const k=150/Math.max(e.width,e.height);this.ghost.setSize(e.width*k,e.height*k);this.ghost.colorRgb=[1,1,1];this.hideGuides();
 }
 clearDraft(){this.draft=null;this.selected=null;this.ghost?.destroy();this.ghost=null;this.hideGuides();this.one('Habitat').text='';}
 hideGuides(){for(const s of this.guides)s.isVisible=false;this.placement=null;}
 validPlacement(e,x,y){
  const h=this.habitat(x,y);if(!h.land||h.water||x<200||x>1840||y<170||y>1000||this.model.isBlocked(e,x,y))return false;
  return animal(e.kind)||!this.model.entities.some(o=>o.alive&&o!==e&&o.kind===e.kind&&Math.hypot(x-o.x,y-o.y)<65);
 }
 snapPlacement(e,x,y){
  const sx=Math.round(x/24)*24,sy=Math.round(y/24)*24;
  // Search only one neighboring cell: magnetism must never teleport across the river.
  const points=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)points.push([sx+dx*24,sy+dy*24]);
  points.sort((a,b)=>Math.hypot(a[0]-x,a[1]-y)-Math.hypot(b[0]-x,b[1]-y));
  const pt=points.find(([px,py])=>this.validPlacement(e,px,py));return {x:pt?.[0]??sx,y:pt?.[1]??sy,valid:!!pt};
 }
 previewPlacement(e,x,y,overUI=false){
  const p=this.snapPlacement(e,x,y);if(overUI)p.valid=false;this.placement=p;
  const color=p.valid?[.25,1,.55]:[1,.25,.18];
  const w=Math.ceil(e.width*.55/24)*24,h=Math.ceil(e.height*.4/24)*24;
  for(let i=0;i<4;i++){const s=this.guides[i],vertical=i<2;s.x=p.x+(vertical?(i===0?-w/2:w/2):0);s.y=p.y+(vertical?0:(i===2?-h/2:h/2));s.setSize(vertical?4:w,vertical?h:4);s.colorRgb=color;s.opacity=.9;s.isVisible=!overUI;}
  const css=this.r.layout.getLayer('game').layerToCssPx(p.x,p.y),[gx,gy]=this.r.layout.getLayer('overlay').cssPxToLayer(...css);
  this.ghost.x=gx;this.ghost.y=gy;this.ghost.setSize(e.width*this.zoom,e.height*this.zoom);this.ghost.colorRgb=p.valid?[1,1,1]:[1,.5,.45];
  this.lastPlacement={...p,kind:e.kind,visibleGuides:this.guides.filter(s=>s.isVisible).length};
  this.one('Habitat').text=`${SPECIES[e.kind].label} · ${this.habitat(p.x,p.y).zone} · ${p.valid?'Bırakabilirsiniz':'Buraya yerleşemez'}`;
 }
 togglePause(){if(this.help)return;const focus=this.one('PauseFocus');focus.behaviors.Flash.stop();focus.isVisible=false;this.paused=!this.paused;this.r.timeScale=this.paused?0:this.speed;this.notice(this.paused?'Simülasyon duraklatıldı. Canlıları yerleştirebilirsiniz.':'Simülasyon çalışıyor. Açlık ve besin dengesini izleyin.',3);this.updateUI();}
 toggleSpeed(){this.speed=this.speed===1?2:1;this.r.timeScale=this.paused||this.help?0:this.speed;this.notice(`Simülasyon hızı ${this.speed}×.`,2);this.updateUI();}
 toggleZoom(){this.zoom=this.zoom===1?1.25:1;if(this.zoom===1)this.pan=[960,540];this.applyZoom();this.notice(this.zoom===1?'Genel görünüm.':'Yakın görünüm: boş araziyi sürükleyerek gezinin.',3);this.updateUI();}
 applyZoom(){this.r.layout.scale=this.zoom;this.r.layout.scrollX=this.pan[0];this.r.layout.scrollY=this.pan[1];}
 toggleHelp(){this.cancelDrag();this.clearDraft();this.showRemove(null);this.help=!this.help;this.r.timeScale=this.help||this.paused?0:this.speed;for(const name of ['Panel','HelpTitle','HelpBody','HelpClose'])for(const i of this.r.objects[name].getAllInstances())if(i.layer.name==='overlay')i.isVisible=this.help;this.updateUI();}
 toggleSound(){this.muted=!this.muted;this.one('audioBtn').opacity=this.muted?.65:1;this.notice(this.muted?'Ses kapalı.':'Ses açık.',2);}
 fullscreenHint(){this.notice('Tam ekran görünümü değiştiriliyor.',2);}
 notice(s,seconds=3){this.toast=s;this.toastUntil=performance.now()+seconds*1000;}
 uiPoint(e){return this.r.layout.getLayer('buttons').cssPxToLayer(e.clientX,e.clientY);}
 worldPoint(e){return this.r.layout.getLayer('game').cssPxToLayer(e.clientX,e.clientY);}
 overUI(x,y){return x<178||y<113||(x>1550&&y>810)||y>1006;}
 pointerDown(ev){
  if((ev.button!==0&&ev.pointerType==='mouse')||this.help||this.drag)return;
  const [ux,uy]=this.uiPoint(ev);
  if(this.context&&this.removeBg.containsPoint(ux,uy)){
   const e=this.context;this.showRemove(null);this.model.remove(e,'player');this.model.entities=this.model.entities.filter(o=>o.alive);this.model.moves++;this.notice(`${SPECIES[e.kind].label} araziden kaldırıldı.`,2);this.updateUI();return;
  }
  const palette=['Wolf','Deer','Fox','Rabbit','Grass','Clover','Pine'].find(k=>this.one(k+'Btn').containsPoint(ux,uy));
  if(palette)this.select(palette);
  const [x,y]=this.worldPoint(ev);
  if(this.draft){
   this.drag={id:ev.pointerId,draft:true,entity:this.draft,sx:ev.clientX,sy:ev.clientY,moved:false};
   if(!this.overUI(ux,uy))this.previewPlacement(this.draft,x,y);return;
  }
  if(this.overUI(ux,uy))return;this.showRemove(null);
  const e=[...this.model.entities].reverse().find(e=>e.alive&&this.instances.get(e.id)?.containsPoint(x,y));
  if(e){
   if(e.kind==='Pine'){this.showRemove(e);this.notice('Çam kök saldığı bölgede kalır. Kaldır düğmesiyle çıkarabilirsiniz.',3);return;}
   this.drag={id:ev.pointerId,entity:e,x:e.x,y:e.y,dx:e.x-x,dy:e.y-y,sx:ev.clientX,sy:ev.clientY,moved:false};e.dragged=true;
  }else if(this.zoom>1)this.drag={id:ev.pointerId,pan:true,x,y};
 }
 pointerMove(ev){
  const d=this.drag;if(!d||d.id!==ev.pointerId)return;const [x,y]=this.worldPoint(ev);
  if(d.pan){this.pan=[clamp(this.pan[0]+d.x-x,768,1152),clamp(this.pan[1]+d.y-y,432,648)];this.applyZoom();return;}
  if(!d.moved&&Math.hypot(ev.clientX-d.sx,ev.clientY-d.sy)<6)return;
  if(!d.moved&&!d.draft){this.makeGhost(d.entity);this.instances.get(d.entity.id).isVisible=false;}
  d.moved=true;const [ux,uy]=this.uiPoint(ev);this.previewPlacement(d.entity,x+(d.dx||0),y+(d.dy||0),this.overUI(ux,uy));
 }
 pointerUp(ev){
  const d=this.drag;if(!d||d.id!==ev.pointerId)return;this.drag=null;if(d.pan)return;
  const e=d.entity;
  if(d.draft){
   if(!d.moved){this.parkDraft();return;}
   const p=this.placement;
   if(p?.valid&&this.validPlacement(e,p.x,p.y)){
    const isAnimal=animal(e.kind),count=this.model.entities.filter(o=>o.alive&&animal(o.kind)===isAnimal).length;
    if(count>=(isAnimal?64:100)){this.notice('Bu habitatın taşıma kapasitesine ulaşıldı.',3);this.clearDraft();this.updateUI();return;}
    const {id,...settings}=e;this.model.add(e.kind,p.x,p.y,settings);this.model.moves++;this.notice(`${SPECIES[e.kind].label} yerleştirildi · ${this.habitat(p.x,p.y).zone}.`,3);this.clearDraft();
   }else{this.clearDraft();this.notice('Uygun olmayan yerleşim iptal edildi.',3);}
  }else{
   e.dragged=false;
   if(!d.moved){this.showRemove(e);return;}
   const p=this.placement;if(p?.valid&&this.validPlacement(e,p.x,p.y)){e.x=p.x;e.y=p.y;e.tx=e.x;e.ty=e.y;e.target=null;e.think=0;e.avoidRemaining=0;this.model.moves++;}
   else this.notice('Uygun alan bulunamadı; canlı önceki konumuna döndü.',3);
   const sprite=this.instances.get(e.id);sprite.isVisible=true;this.transform(e,sprite);this.clearDraft();
  }
  this.updateUI();
 }
 cancelDrag(){
  const d=this.drag;if(d?.entity&&!d.draft){const e=d.entity;e.dragged=false;const s=this.instances.get(e.id);if(s)s.isVisible=true;}
  this.drag=null;if(this.draft)this.parkDraft();else{this.ghost?.destroy();this.ghost=null;this.hideGuides();}
 }
 tick(){
  const now=performance.now(),wall=Math.min(.25,(now-this.last)/1000);this.last=now;this.fps=this.fps*.95+.05/Math.max(wall,.001);
  if(!this.paused&&!this.help&&!this.drag&&this.model.introducedKinds.size)this.model.step(this.r.dt);
  for(const e of this.model.entities){const s=this.instances.get(e.id);if(!s)continue;
   const previousFrame=s.animationFrame;this.transform(e,s);
   if(e.kind==='Pine'&&this.model.entities.some(o=>animal(o.kind)&&s.testOverlap(this.instances.get(o.id))))s.animationFrame=previousFrame;
   if(SPECIES[e.kind].plant){const size=e.kind==='Pine'?1:.72+.28*e.biomass;s.setSize(e.width*size,e.height*size);}
   if(e.warned){let tag=this.tags.get(e.id);if(!tag){tag=this.r.objects.HungerTag.createInstance('game',e.x-65,e.y-95);tag.isVisible=true;this.tags.set(e.id,tag);}tag.x=e.x-65;tag.y=e.y-95;tag.text=`AÇ! ${Math.max(1,Math.ceil(3-e.warning))} sn`;}
   else if(this.tags.has(e.id)){this.tags.get(e.id).destroy();this.tags.delete(e.id);}
  }
  if(this.context)this.positionRemove();
  this.uiTimer=(this.uiTimer||0)-wall;if(this.uiTimer<=0){this.uiTimer=.15;this.updateUI();}
 }
 updateUI(){
  const c=this.model.counts();for(const [k,n]of Object.entries(c)){this.one(k+'Count').text=String(n);this.one(k+'Btn').opacity=this.selected&&this.selected!==k?.55:1;}
  this.one('playBtn').animationFrame=this.paused?1:0;this.one('zoomBtn').animationFrame=this.zoom===1?0:1;this.one('SpeedLabel').text=`${this.speed}×`;
  const t=Math.floor(this.model.time),time=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  this.one('TimeLabel').text=`${time}  ·  Doğum ${this.model.births}  ·  Kayıp ${this.model.deaths}`;
  const extinct=Object.entries(c).filter(([k,v])=>v===0&&this.model.introducedKinds.has(k)).map(([k])=>k==='Deer'?'Geyik':SPECIES[k].label);
  const hungry=this.model.entities.filter(e=>e.warned);this.one('Warning').text=hungry.length?`${hungry.length} canlı açlık tehlikesinde! Besine ulaştırın.`:'';
  this.one('Status').text=performance.now()<this.toastUntil?this.toast:this.help?'Bilgi paneli açık — simülasyon duraklatıldı.':!this.model.introducedKinds.size?'Arazi boş. Soldan bitki ve hayvan seçerek komünitenizi oluşturun.':extinct.length?`${extinct.join(', ')} tükendi. Soldan seçerek komüniteyi yeniden destekleyin.`:this.model.won?'Komüniteyi korudunuz ve çoğalttınız. Dengeyi sürdürün.':this.paused?'Simülasyon duraklatıldı. Canlıları yerleştirin; devam etmek için oynat düğmesine basın.':'Çayırı güneşte, yoncayı nemli kıyıda tutun. Aç hayvanları besine ulaştırın.';
  this.r.globalVars.Report=`Komünite | ${time} | Kurt ${c.Wolf}, geyik ${c.Deer}, tilki ${c.Fox}, tavşan ${c.Rabbit}; çayır ${c.Grass}, yonca ${c.Clover}, çam ${c.Pine}. Doğum ${this.model.births}, kayıp ${this.model.deaths}.`;
 }
 dispose(){this.r.timeScale=1;this.r.eco=null;}
 // Read-only verification snapshot for the Construct debugger / console.
 snapshot(){return {lastBirth:this.model.lastBirth??null,lastPlacement:this.lastPlacement??null,placement:this.placement,draft:this.draft?.kind??null,dragging:!!this.drag,removeVisible:this.removeBg.isVisible,contextId:this.context?.id??null,pauseFocusVisible:this.one('PauseFocus').isVisible,pauseFocusFlashing:this.one('PauseFocus').behaviors.Flash.isFlashing,waterFrame:this.one('Terrain').animationFrame,waterSpeed:this.one('Terrain').animationSpeed,waterTimeScale:this.one('Terrain').timeScale,time:this.model.time,paused:this.paused,speed:this.speed,zoom:this.zoom,layoutScale:this.r.layout.scale,counts:this.model.counts(),births:this.model.births,deaths:this.model.deaths,meals:this.model.meals,fps:Math.round(this.fps),overlaps:this.model.entities.flatMap((a,i)=>this.model.entities.slice(i+1).filter(b=>animal(a.kind)&&animal(b.kind)&&this.instances.get(a.id).testOverlap(this.instances.get(b.id))).map(b=>[a.id,b.id])),entities:this.model.entities.map(e=>({id:e.id,kind:e.kind,x:e.x,y:e.y,hunger:e.hunger,frame:e.frame,biomass:e.biomass,pendingBirths:e.pendingBirths?.map(b=>({remaining:Math.max(0,b.due-this.model.time),delay:b.delay}))??[],target:e.target?.id??null,avoid:e.avoidRemaining||0}))};}
}
