// Qualitative individual-based educational model. Seconds and diet rules are game parameters.
// Plant growth uses dB/dt = r B (1 - B/K); abundance is counted from living individuals.
export const SPECIES = {
 Wolf:{label:'Kurt',speed:28,huntSpeed:118,starve:15,birthMeals:2,radius:48},
 Stag:{label:'Geyik',speed:22,starve:40,breed:13,food:'Grass',radius:50,fleeSpeed:66,bite:.10,bitePause:.7},
 Doe:{label:'Geyik',speed:22,starve:40,breed:13,food:'Grass',radius:42.5,fleeSpeed:66,bite:.10,bitePause:.7},
 Fox:{label:'Tilki',speed:26,huntSpeed:108,starve:22,birthMeals:2,radius:36},
 Rabbit:{label:'Tavşan',speed:32,starve:25,breed:7,food:'Clover',radius:25,fleeSpeed:78,bite:.055,bitePause:.65},
 Grass:{label:'Çayır',plant:true,rate:.035,spread:26,radius:65},
 Clover:{label:'Yonca',plant:true,rate:.065,spread:20,radius:55},
 Pine:{label:'Çam',plant:true,rate:.12,radius:105}
};
export const BODY_SIZE={Wolf:[260,244],Stag:[293.25,313.65],Doe:[204,220.15],Fox:[180,174],Rabbit:[125,132],Grass:[192,192],Clover:[175,169],Pine:[270,324]};
const TAU=Math.PI*2;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const isDeer=k=>k==='Stag'||k==='Doe';
export const animal=k=>!SPECIES[k].plant;
export const canEat=(a,b)=>a==='Wolf'?(b==='Rabbit'||isDeer(b)):a==='Fox'?b==='Rabbit':SPECIES[a]?.food===b;
export const foodAvailable=e=>animal(e.kind)||(e.biomass>(e.kind==='Clover'?.12:.015)&&!e.recovering);
export const logistic=(b,r,dt,k=1)=>clamp(b+r*b*(1-b/k)*dt,0,k);
export class Ecology {
 constructor(hooks={}) {
  this.hooks=hooks;this.entities=[];this.introducedKinds=new Set();this.nextId=1;this.time=0;this.accum=0;this.births=0;this.deaths=0;this.meals=0;this.moves=0;this.initialAnimals=0;this.seed=38471;this.won=false;this.additions=0;this.removals=0;this.plantLosses=0;this.history=[];this.goalStart=0;this.goalBirths=0;this.goalDeaths=0;
 }
 random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
 habitat(x,y){return this.hooks.habitat?.(x,y)||{land:true,wet:false,sun:true};}
 add(kind,x,y,opts={}){
  const e={id:this.nextId++,kind,x,y,width:opts.width||BODY_SIZE[kind][0],height:opts.height||BODY_SIZE[kind][1],angle:opts.angle??(Math.PI/2-(opts.frame||0)*TAU/60),frame:opts.frame??(SPECIES[kind].plant?20:0),biomass:opts.biomass??(SPECIES[kind].plant?1:0),sex:opts.sex??(kind==='Stag'?'male':kind==='Doe'?'female':kind==='Rabbit'?(this.random()<.5?'female':'male'):null),nextDrinkAt:this.time+8+this.random()*7,drinks:0,state:'idle',moving:false,hunger:0,warning:0,age:0,fed:0,breedClock:0,rabbitMeals:0,mealCount:0,nutrition:0,totalNutrition:0,pendingBirths:[],spreadClock:0,think:0,tx:x,ty:y,alive:true,habitat:this.habitat(x,y).sun?'sun':'shade',...opts};
  this.entities.push(e);this.introducedKinds.add(isDeer(kind)?'Deer':kind);this.hooks.add?.(e);if((opts.source||'player')==='player'){if(animal(kind))this.additions++;this.resetGoal();}return e;
 }
 resetGoal(){this.goalStart=this.time;this.goalBirths=this.births;this.goalDeaths=this.deaths;this.initialAnimals=this.entities.filter(e=>e.alive&&animal(e.kind)).length;this.won=false;}
 remove(e,reason){if(!e.alive)return;e.alive=false;if(reason==='player'){if(animal(e.kind))this.removals++;this.resetGoal();}else if(animal(e.kind))this.deaths++;else this.plantLosses++;this.won=false;this.hooks.remove?.(e,reason);}
 canReach(a,b){
  const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/8));
  for(let i=0;i<=n;i++){const h=this.habitat(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n);if(!h.land||h.water)return false;}
  return this.hooks.canReach?.(a,b)!==false;
 }
 counts(){const c={Wolf:0,Deer:0,Fox:0,Rabbit:0,Grass:0,Clover:0,Pine:0};for(const e of this.entities)if(e.alive){const k=isDeer(e.kind)?'Deer':e.kind;c[k]+=k==='Grass'||k==='Clover'?e.biomass*62.5:1;}c.Grass=Math.round(c.Grass);c.Clover=Math.round(c.Clover);return c;}
 isBlocked(e,x,y,angle=e.angle){
  const h=this.habitat(x,y);if(!h.land||h.water||x<0||x>=1920||y<0||y>=1080)return true;
  if(this.hooks.blocked)return this.hooks.blocked(e,x,y,angle);
  return this.entities.some(o=>o.alive&&o!==e&&!(e.target===o&&canEat(e.kind,o.kind))&&(animal(o.kind)||o.kind==='Pine')&&Math.hypot(o.x-x,o.y-y)<SPECIES[e.kind].radius+SPECIES[o.kind].radius*(o.kind==='Pine'?Math.max(.25,o.biomass):1));
 }
 nearest(e,filter){let best=null,bd=Infinity;for(const o of this.entities){if(o===e||!o.alive||o.dragged||!filter(o))continue;const d=Math.hypot(o.x-e.x,o.y-e.y);if(d<bd){bd=d;best=o;}}return [best,bd];}
 findSpace(kind,x,y,radius=150,angle=0){
  const temp={kind,id:-1,width:BODY_SIZE[kind][0],height:BODY_SIZE[kind][1],angle,frame:Math.round(((Math.PI/2-angle)%TAU+TAU)%TAU/TAU*60),biomass:.32};
  for(let i=0;i<28;i++){const a=i*2.399963,rr=30+radius*Math.sqrt((i+1)/28),px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;if(this.canReach({x,y},{x:px,y:py})&&!this.isBlocked(temp,px,py,angle))return [px,py];}return null;
 }
 feed(e,prey){
  if(!e.alive||e.dragged||!prey?.alive||prey.dragged||!canEat(e.kind,prey.kind))return false;
  if(SPECIES[prey.kind].plant){
   if(!foodAvailable(prey))return false;
   // Clover retains a small, non-edible crown; it must regrow before feeding again.
   const clover=prey.kind==='Clover',bite=SPECIES[e.kind].bite/(clover?3:1);
   prey.biomass=Math.max(clover?.12:0,prey.biomass-bite);e.fed+=1;
   if(clover&&prey.biomass<=.12+1e-7){prey.recovering=true;this.hooks.notice?.('Yonca otlandı. Küçük yama kaldı; nemli kıyıda yeniden yapraklanır.',4);}
   else if(prey.biomass<=.015)this.remove(prey,'grazed');
  }else{
   this.remove(prey,'predation');e.mealCount++;this.meals++;
   if(prey.kind==='Rabbit')e.rabbitMeals++;
  }
  this.hooks.fed?.(e,prey);
  e.hunger=0;e.warning=0;e.fed=Math.max(e.fed,1);e.mealPause=(e.kind==='Wolf'||e.kind==='Fox')?5:SPECIES[e.kind].bitePause;e.target=null;e.state=SPECIES[prey.kind].plant?'grazing':'resting';e.lastMealAt=this.time;
  if((e.kind==='Wolf'||e.kind==='Fox')&&this.time>=(e.matureAt||0)){
   // Game rule: a rabbit is 1 food credit; a deer is 2. Every 2 credits earns one birth.
   const points=isDeer(prey.kind)?2:1;e.nutrition+=points;e.totalNutrition+=points;
   while(e.nutrition>=2){
    e.nutrition-=2;const delay=Math.max(3,6-Math.floor(e.totalNutrition/2));
    e.pendingBirths.push({earnedAt:this.time,due:this.time+delay,delay});
    this.hooks.notice?.(`${SPECIES[e.kind].label} beslendi. ${delay} sn sonra popülasyon +1 olacak.`,3);
   }
  }
  return true;
 }
 birth(parent){
  if(this.entities.filter(e=>e.alive&&animal(e.kind)).length>=64)return false;
  const kind=isDeer(parent.kind)?(this.random()<.5?'Stag':'Doe'):parent.kind;const pos=this.findSpace(kind,parent.x,parent.y,190,parent.angle);if(!pos)return false;
  const e=this.add(kind,...pos,{angle:parent.angle,frame:parent.frame,source:'birth',matureAt:this.time+(kind==='Rabbit'?8:isDeer(kind)?20:15)});e.fed=.1;this.births++;this.hooks.notice?.(`${SPECIES[kind].label} popülasyonu +1. Yeni birey henüz üreyemez.`,2);return true;
 }
 step(dt){
  this.accum+=Math.min(dt,.2);while(this.accum>=1/30){this.fixed(1/30);this.accum-=1/30;}
 }
 fixed(dt){
  this.time+=dt;const live=this.entities.filter(e=>e.alive);
  for(const e of live){if(!e.alive||e.dragged)continue;e.age+=dt;
   if(SPECIES[e.kind].plant){this.plantStep(e,dt);continue;}
   const sp=SPECIES[e.kind];e.hunger+=dt;e.breedClock+=dt*(1+Math.min(2,e.fed*.25));e.think-=dt;e.mealPause=Math.max(0,(e.mealPause||0)-dt);
   if(e.hunger>=sp.starve){
    e.warning=e.hunger-sp.starve;
    if(!e.warned){e.warned=true;this.hooks.notice?.(`${sp.label} aç! Beslenemezse 3 saniye içinde kaybolacak.`,3);}
    if(e.warning>=3-1e-7){this.remove(e,'starvation');continue;}
   }else{e.warning=0;e.warned=false;}
   // Due births use simulation time; explicit pause and placement pause suspend the countdown.
   for(const pending of [...e.pendingBirths]){
    if(this.time+1e-7<pending.due)continue;
    if(this.birth(e)){
     this.lastBirth={parentId:e.id,kind:e.kind,at:this.time,earnedAt:pending.earnedAt,delay:pending.delay};
     e.pendingBirths.splice(e.pendingBirths.indexOf(pending),1);
    }else pending.due=this.time+.5; // Keep the earned birth until a collision-free space is available.
   }
   e.moving=false;
   // Danger is evaluated before grazing or drinking: resting prey can still escape.
   const [danger,dd]=this.nearest(e,o=>((e.kind==='Fox'&&o.kind==='Wolf')||((isDeer(e.kind)||e.kind==='Rabbit')&&canEat(o.kind,e.kind)))&&this.canReach(e,o));
   e.fleeing=!!danger&&dd<(e.fleeing?360:300);
   if(e.fleeing){
    e.mealPause=0;e.drinking=0;e.waterTarget=null;e.target=null;e.state='fleeing';
    e.tx=e.x+(e.x-danger.x)*3;e.ty=e.y+(e.y-danger.y)*3;this.move(e,dt);continue;
   }
   // A fed opposite-sex adult pair earns offspring; larger herbivores reproduce more slowly.
   if(this.time>=(e.matureAt||0)&&sp.breed&&e.breedClock>=sp.breed&&e.hunger<sp.starve*.4&&e.fed>=2){
    const [mate,d]=this.nearest(e,o=>(isDeer(e.kind)?isDeer(o.kind):o.kind===e.kind)&&o.sex!==e.sex&&o.sex&&this.canReach(e,o));
    if(mate&&mate.fed>=2&&this.time>=(mate.matureAt||0)&&d<520&&mate.hunger<sp.starve*.5&&mate.breedClock>=sp.breed&&this.birth(e)){e.breedClock=0;mate.breedClock=0;e.fed=0;mate.fed=0;}
   }
   if(e.drinking>0){e.drinking-=dt;e.state='drinking';if(e.drinking<=0){e.drinks++;e.nextDrinkAt=this.time+16+this.random()*10;e.waterTarget=null;e.think=0;}continue;}
   if(e.mealPause>0)continue;
   if(e.waterTarget&&(this.time>e.waterTarget.until||e.hunger>sp.starve*.55)){e.waterTarget=null;e.nextDrinkAt=this.time+10;e.think=0;}
   if(e.think<=0){
    e.think=.25+this.random()*.15;
    if(e.target?.alive){
     const distance=Math.hypot(e.x-e.target.x,e.y-e.target.y);
     if(e.progressTarget!==e.target.id||distance<(e.bestDistance??Infinity)-10){e.progressTarget=e.target.id;e.bestDistance=distance;e.progressAt=this.time;}
     else if(this.time-e.progressAt>3){e.ignoredTarget=e.target.id;e.ignoreUntil=this.time+8;e.target=null;e.avoidRemaining=0;}
    }
    if(!e.waterTarget&&this.time>=e.nextDrinkAt&&e.hunger<sp.starve*.55){
     const shore=this.hooks.findWater?.(e);
     if(shore){e.waterTarget={...shore,until:this.time+9};e.target=null;e.avoidRemaining=0;}
     else e.nextDrinkAt=this.time+8;
    }
    if(!e.waterTarget){
     const reachable=o=>this.canReach(e,o)&&!(o.id===e.ignoredTarget&&this.time<e.ignoreUntil);
     const locked=e.target?.alive&&reachable(e.target)&&!e.target.dragged&&canEat(e.kind,e.target.kind)&&foodAvailable(e.target)?e.target:null;
     const food=locked||this.nearest(e,o=>canEat(e.kind,o.kind)&&foodAvailable(o)&&reachable(o))[0];
     if(food){if(e.target!==food){e.chaseStartedAt=this.time;e.chaseTarget=food.id;}e.target=food;e.tx=food.x;e.ty=food.y;e.state=sp.huntSpeed?'hunting':'foraging';}
     else{e.target=null;e.state='wandering';if(Math.hypot(e.tx-e.x,e.ty-e.y)<25||!e.wanderUntil||e.age>e.wanderUntil){e.wanderUntil=e.age+8;const a=this.random()*TAU;e.tx=e.x+Math.cos(a)*230;e.ty=e.y+Math.sin(a)*150;}}
    }
   }
   if(e.waterTarget){
    const w=e.waterTarget;e.tx=w.x;e.ty=w.y;e.state='seeking-water';
    if(Math.hypot(e.x-w.x,e.y-w.y)<16){
     if(!this.isBlocked(e,e.x,e.y,w.angle)){e.angle=w.angle;e.frame=Math.round(((Math.PI/2-e.angle)%TAU+TAU)%TAU/TAU*60);}
     e.drinking=1.8;e.state='drinking';continue;
    }
    this.move(e,dt);continue;
   }
   const t=e.target;
   if(t?.alive&&!t.dragged){
    const d=Math.hypot(e.x-t.x,e.y-t.y);const reach=SPECIES[e.kind].radius+(SPECIES[t.kind].plant?70:SPECIES[t.kind].radius)+12;
    const chasedEnough=!sp.huntSpeed||this.time-(e.chaseStartedAt??this.time)>=.75;
    if(chasedEnough&&(d<reach||this.hooks.contact?.(e,t))&&this.canReach(e,t)&&this.feed(e,t))continue;
   }
   // Wolves displace or kill a nearby fox; foxes never consume deer or wolves.
   if(e.kind==='Wolf'&&e.hunger>5){const [fox,d]=this.nearest(e,o=>o.kind==='Fox');if(fox&&d<90&&this.canReach(e,fox)){this.remove(fox,'competition');e.mealPause=1;}}
   this.move(e,dt);
  }
  this.entities=this.entities.filter(e=>e.alive);
  const c=this.counts(),total=c.Wolf+c.Deer+c.Fox+c.Rabbit;
  const success=this.time-this.goalStart>=60&&this.births-this.goalBirths>=3&&total>this.initialAnimals&&Object.values(c).every(n=>n>0);
  if(success&&!this.won)this.hooks.notice?.('Komünite gelişiyor! 60 sn boyunca dışarıdan canlı eklemeden doğal artış sağladınız.',8);
  this.won=success;
  if(!this.history.length||this.time-this.history.at(-1).time>=2){this.history.push({time:this.time,counts:{...c},births:this.births,deaths:this.deaths,additions:this.additions,removals:this.removals,plantLosses:this.plantLosses});if(this.history.length>300)this.history.shift();}
 }
 move(e,dt){
  const sp=SPECIES[e.kind],hunting=sp.huntSpeed&&e.target?.alive&&!e.target.dragged;
  const speed=(e.fleeing?(sp.fleeSpeed||72):hunting?sp.huntSpeed:e.state==='foraging'||e.state==='seeking-water'?sp.speed*1.5:sp.speed)*(e.hunger>sp.starve?.7:1);
  e.avoidRemaining=Math.max(0,(e.avoidRemaining||0)-dt);e.steerWait=Math.max(0,(e.steerWait||0)-dt);
  let heading=e.avoidRemaining>0?e.avoidAngle:Math.atan2(e.ty-e.y,e.tx-e.x);
  const delta=speed*dt,sign=e.id%2?1:-1;
  const facing=a=>e.angle+clamp(Math.atan2(Math.sin(a-e.angle),Math.cos(a-e.angle)),-dt*3.5,dt*3.5);
  const clear=(a,lookahead=delta)=>!this.isBlocked(e,e.x+Math.cos(a)*lookahead,e.y+Math.sin(a)*lookahead,facing(a));
  if(!clear(heading,Math.max(delta,8))){
   if(e.steerWait>0)return;
   const choice=[.65*sign,1.15*sign,1.7*sign,2.3*sign,Math.PI,-.65*sign,-1.15*sign,-1.7*sign,-2.3*sign].map(o=>heading+o).find(a=>clear(a,Math.max(delta,28))&&clear(a));
   e.steerWait=.2;if(choice===undefined)return;
   heading=choice;e.avoidAngle=heading;e.avoidRemaining=1.1;
   if(!hunting&&!e.fleeing&&!e.waterTarget){e.tx=e.x+Math.cos(heading)*180;e.ty=e.y+Math.sin(heading)*180;e.wanderUntil=e.age+7;}
  }
  // Small swept steps prevent fast predators tunneling through other animals.
  const steps=Math.max(1,Math.ceil(delta/4)),step=delta/steps,angle=facing(heading);
  for(let i=0;i<steps;i++){
   const x=e.x+Math.cos(heading)*step,y=e.y+Math.sin(heading)*step;
   if(this.isBlocked(e,x,y,angle))break;e.x=x;e.y=y;e.angle=angle;e.moving=true;e.motionSpeed=speed;
   e.frame=Math.round(((Math.PI/2-angle)%TAU+TAU)%TAU/TAU*60);this.hooks.moved?.(e);
  }
 }
 plantStep(e,dt){
  const h=this.habitat(e.x,e.y);const pine=this.entities.some(o=>o.alive&&o.kind==='Pine'&&o!==e&&Math.hypot(o.x-e.x,o.y-e.y)<85+110*o.biomass);
  let rate;
  if(e.kind==='Grass')rate=pine?-.22:!h.sun?-.14:h.wet?-.11:SPECIES.Grass.rate;
  else if(e.kind==='Clover')rate=pine?-.08:h.wet?SPECIES.Clover.rate:-.025;
  else rate=e.habitat==='sun'?.12:.004;
  e.stressed=rate<0;
  if(e.stressed&&!e.stressNotified){e.stressNotified=true;this.hooks.notice?.(`${SPECIES[e.kind].label} uygun olmayan ortamda azalıyor. Uygun toprağa taşıyın.`,4);}
  if(!e.stressed)e.stressNotified=false;
  if(rate>0)e.biomass=logistic(Math.min(e.biomass,.999),rate,dt);else e.biomass=Math.max(0,e.biomass*Math.exp(rate*dt));
  if(e.biomass<=.015){e.frame=0;this.remove(e,'habitat');return;}
  if(e.kind==='Clover'&&e.recovering&&e.biomass>=.3)e.recovering=false;
  e.frame=Math.round(clamp(e.biomass,0,1)*60);
  if(e.kind==='Clover')e.frame=Math.max(18,e.frame); // Keep the surviving crown visible; the counter still reflects actual biomass.
  if(e.kind==='Pine')return; // Pine remains rooted in the habitat in which it was placed.
  e.spreadClock+=dt;
  if(rate>0&&e.biomass>.72&&e.spreadClock>=SPECIES[e.kind].spread){
   e.spreadClock=0;
   if(this.entities.filter(o=>o.alive&&SPECIES[o.kind].plant).length>=100)return;
   // Spread in both horizontal and vertical directions, with local capacity and competition.
   const start=Math.floor(this.random()*8);
   for(let j=0;j<8;j++){const a=(j+start)*Math.PI/4;const x=e.x+Math.cos(a)*e.width*.60,y=e.y+Math.sin(a)*e.height*.60;const nh=this.habitat(x,y);
    if(x<0||x>=1920||y<0||y>=1080||!nh.land||nh.water||(e.kind==='Grass'?(!nh.sun||nh.wet):!nh.wet))continue;
    if(this.entities.some(o=>o.alive&&SPECIES[o.kind].plant&&Math.hypot(x-o.x,y-o.y)<(o.kind==='Pine'?180:72)))continue;
    const seed={...e,id:-1,biomass:.22,frame:13};
    if(!this.canReach(e,{x,y})||this.isBlocked(seed,x,y))continue;
    this.add(e.kind,x,y,{biomass:.22,frame:13,width:e.width,height:e.height,source:'spread'});break;
   }
  }
 }
}
