// Qualitative individual-based educational model. Seconds and diet rules are game parameters.
// Plant growth uses dB/dt = r B (1 - B/K); abundance is counted from living individuals.
export const SPECIES = {
 Wolf:{label:'Kurt',speed:28,huntSpeed:112,starve:15,birthMeals:2,radius:48},
 Stag:{label:'Geyik',speed:22,starve:40,breed:32,food:'Grass',radius:59},
 Doe:{label:'Geyik',speed:22,starve:40,breed:32,food:'Grass',radius:50},
 Fox:{label:'Tilki',speed:26,huntSpeed:100,starve:22,birthMeals:2,radius:36},
 Rabbit:{label:'Tavşan',speed:32,starve:25,breed:10,food:'Clover',radius:25},
 Grass:{label:'Çayır',plant:true,rate:.14,spread:11,radius:65},
 Clover:{label:'Yonca',plant:true,rate:.19,spread:8,radius:55},
 Pine:{label:'Çam',plant:true,rate:.12,radius:105}
};
const TAU=Math.PI*2;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const isDeer=k=>k==='Stag'||k==='Doe';
export const animal=k=>!SPECIES[k].plant;
export const canEat=(a,b)=>a==='Wolf'?(b==='Rabbit'||isDeer(b)):a==='Fox'?b==='Rabbit':SPECIES[a]?.food===b;
export const logistic=(b,r,dt,k=1)=>clamp(b+r*b*(1-b/k)*dt,0,k);
export class Ecology {
 constructor(hooks={}) {
  this.hooks=hooks;this.entities=[];this.introducedKinds=new Set();this.nextId=1;this.time=0;this.accum=0;this.births=0;this.deaths=0;this.meals=0;this.moves=0;this.initialAnimals=0;this.seed=38471;this.won=false;
 }
 random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
 habitat(x,y){return this.hooks.habitat?.(x,y)||{land:true,wet:false,sun:true};}
 add(kind,x,y,opts={}){
  const e={id:this.nextId++,kind,x,y,width:opts.width||({Wolf:260,Stag:345,Doe:240,Fox:180,Rabbit:125,Grass:192,Clover:175,Pine:270}[kind]),height:opts.height||({Wolf:244,Stag:369,Doe:259,Fox:174,Rabbit:132,Grass:192,Clover:169,Pine:324}[kind]),angle:opts.angle??(Math.PI/2-(opts.frame||0)*TAU/60),frame:opts.frame??(SPECIES[kind].plant?20:0),biomass:opts.biomass??(SPECIES[kind].plant?1:0),hunger:0,warning:0,age:0,fed:0,breedClock:0,rabbitMeals:0,mealCount:0,nutrition:0,totalNutrition:0,pendingBirths:[],spreadClock:0,think:0,tx:x,ty:y,alive:true,habitat:this.habitat(x,y).sun?'sun':'shade',...opts};
  this.entities.push(e);this.introducedKinds.add(isDeer(kind)?'Deer':kind);this.hooks.add?.(e);return e;
 }
 remove(e,reason){if(!e.alive)return;e.alive=false;this.deaths+=animal(e.kind)&&reason!=='player'?1:0;this.hooks.remove?.(e,reason);}
 counts(){const c={Wolf:0,Deer:0,Fox:0,Rabbit:0,Grass:0,Clover:0,Pine:0};for(const e of this.entities)if(e.alive){const k=isDeer(e.kind)?'Deer':e.kind;c[k]+=k==='Grass'||k==='Clover'?e.biomass*62.5:1;}c.Grass=Math.round(c.Grass);c.Clover=Math.round(c.Clover);return c;}
 isBlocked(e,x,y,angle=e.angle){
  const h=this.habitat(x,y);if(!h.land||x<185||x>1865||y<150||y>1020)return true;
  if(this.hooks.blocked)return this.hooks.blocked(e,x,y,angle);
  return this.entities.some(o=>o.alive&&o!==e&&(animal(o.kind)||o.kind==='Pine')&&Math.hypot(o.x-x,o.y-y)<SPECIES[e.kind].radius+SPECIES[o.kind].radius*(o.kind==='Pine'?Math.max(.25,o.biomass):1));
 }
 nearest(e,filter){let best=null,bd=Infinity;for(const o of this.entities){if(o===e||!o.alive||o.dragged||!filter(o))continue;const d=Math.hypot(o.x-e.x,o.y-e.y);if(d<bd){bd=d;best=o;}}return [best,bd];}
 findSpace(kind,x,y,radius=150,angle=0){
  const temp={kind,id:-1,width:{Wolf:260,Stag:345,Doe:240,Fox:180,Rabbit:125,Grass:155,Clover:145,Pine:210}[kind],height:{Wolf:244,Stag:369,Doe:259,Fox:174,Rabbit:132,Grass:155,Clover:140,Pine:252}[kind],angle,frame:Math.round(((Math.PI/2-angle)%TAU+TAU)%TAU/TAU*60),biomass:.32};
  for(let i=0;i<28;i++){const a=i*2.399963,rr=30+radius*Math.sqrt((i+1)/28),px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;if(!this.isBlocked(temp,px,py,angle))return [px,py];}return null;
 }
 feed(e,prey){
  if(!e.alive||e.dragged||!prey?.alive||prey.dragged||!canEat(e.kind,prey.kind))return false;
  if(SPECIES[prey.kind].plant){
   if(prey.biomass<.08)return false;
   prey.biomass=Math.max(0,prey.biomass-.12);e.fed+=1;
   if(prey.biomass<.025)this.remove(prey,'grazed');
  }else{
   this.remove(prey,'predation');e.mealCount++;this.meals++;
   if(prey.kind==='Rabbit')e.rabbitMeals++;
  }
  e.hunger=0;e.warning=0;e.fed=Math.max(e.fed,1);e.mealPause=2.2;
  if(e.kind==='Wolf'||e.kind==='Fox'){
   // Game rule: a rabbit is 1 food credit; a deer is 2. Every 2 credits earns one birth.
   const points=isDeer(prey.kind)?2:1;e.nutrition+=points;e.totalNutrition+=points;
   while(e.nutrition>=2){
    e.nutrition-=2;const delay=Math.max(3,6-Math.floor(e.totalNutrition/2));
    e.pendingBirths.push({earnedAt:this.time,due:this.time+delay,delay});
    this.hooks.notice?.(`${SPECIES[e.kind].label} beslendi. ${delay} sn sonra bir yavru doğacak.`,3);
   }
  }
  return true;
 }
 birth(parent){
  if(this.entities.filter(e=>e.alive&&animal(e.kind)).length>=64)return false;
  const kind=isDeer(parent.kind)?(this.random()<.5?'Stag':'Doe'):parent.kind;const pos=this.findSpace(kind,parent.x,parent.y,190,parent.angle);if(!pos)return false;
  const e=this.add(kind,...pos,{angle:parent.angle,frame:parent.frame});e.fed=.1;this.births++;this.hooks.notice?.(`${SPECIES[kind].label} doğdu. Popülasyon +1.`,2);return true;
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
   // Due births use simulation time, so pause and drag suspend the countdown.
   for(const pending of [...e.pendingBirths]){
    if(this.time+1e-7<pending.due)continue;
    if(this.birth(e)){
     this.lastBirth={parentId:e.id,kind:e.kind,at:this.time,earnedAt:pending.earnedAt,delay:pending.delay};
     e.pendingBirths.splice(e.pendingBirths.indexOf(pending),1);
    }else pending.due=this.time+.5; // Keep the earned birth until a collision-free space is available.
   }
   // Herbivores need both food and another individual of their own species to reproduce.
   if(sp.breed&&e.breedClock>=sp.breed&&e.hunger<sp.starve*.4&&e.fed>=2){
    const [mate,d]=this.nearest(e,o=>isDeer(e.kind)?(isDeer(o.kind)&&o.kind!==e.kind):o.kind===e.kind);
    if(mate&&d<430&&mate.hunger<sp.starve*.5&&mate.breedClock>=sp.breed&&this.birth(e)){e.breedClock=0;mate.breedClock=0;e.fed=0;mate.fed=0;}
   }
   if(e.mealPause>0)continue;
   if(e.think<=0){
    e.think=.25+this.random()*.15;
    const [danger,dd]=this.nearest(e,o=>(e.kind==='Fox'&&o.kind==='Wolf')||((isDeer(e.kind)||e.kind==='Rabbit')&&canEat(o.kind,e.kind)));
    e.fleeing=!!danger&&dd<220;
    if(e.fleeing){e.tx=e.x+(e.x-danger.x)*3;e.ty=e.y+(e.y-danger.y)*3;e.target=null;}
    else{
     const locked=e.target?.alive&&!e.target.dragged&&canEat(e.kind,e.target.kind)&&(animal(e.target.kind)||e.target.biomass>.09)?e.target:null;
     const food=locked||this.nearest(e,o=>canEat(e.kind,o.kind)&&(animal(o.kind)||o.biomass>.09))[0];
     if(food){e.target=food;e.tx=food.x;e.ty=food.y;}
     else if(Math.hypot(e.tx-e.x,e.ty-e.y)<25||!e.wanderUntil||e.age>e.wanderUntil){e.target=null;e.wanderUntil=e.age+8;const a=this.random()*TAU;e.tx=e.x+Math.cos(a)*230;e.ty=e.y+Math.sin(a)*150;}
    }
   }
   const t=e.target;
   if(t?.alive&&!t.dragged){
    const d=Math.hypot(e.x-t.x,e.y-t.y);const reach=SPECIES[e.kind].radius+(SPECIES[t.kind].plant?70:SPECIES[t.kind].radius)+12;
    if((d<reach||this.hooks.contact?.(e,t))&&this.hooks.canReach?.(e,t)!==false&&this.feed(e,t))continue;
   }
   // Wolves displace or kill a nearby fox; foxes never consume deer or wolves.
   if(e.kind==='Wolf'&&e.hunger>5){const [fox,d]=this.nearest(e,o=>o.kind==='Fox');if(fox&&d<90&&this.hooks.canReach?.(e,fox)!==false){this.remove(fox,'competition');e.mealPause=1;}}
   this.move(e,dt);
  }
  this.entities=this.entities.filter(e=>e.alive);
  const c=this.counts(),total=c.Wolf+c.Deer+c.Fox+c.Rabbit;
  if(!this.won&&this.time>=60&&this.births>=3&&total>this.initialAnimals&&Object.values(c).every(n=>n>0)){this.won=true;this.hooks.notice?.('Komünite gelişiyor! Bütün türler hayatta ve popülasyon arttı.',8);}
 }
 move(e,dt){
  const sp=SPECIES[e.kind],hunting=sp.huntSpeed&&e.target?.alive&&!e.target.dragged;
  const speed=(hunting?sp.huntSpeed:sp.speed*(e.fleeing?1.45:1))*(e.hunger>sp.starve?.7:1);
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
   if(!hunting&&!e.fleeing){e.tx=e.x+Math.cos(heading)*180;e.ty=e.y+Math.sin(heading)*180;e.wanderUntil=e.age+7;}
  }
  // Small swept steps prevent fast predators tunneling through other animals.
  const steps=Math.max(1,Math.ceil(delta/4)),step=delta/steps,angle=facing(heading);
  for(let i=0;i<steps;i++){
   const x=e.x+Math.cos(heading)*step,y=e.y+Math.sin(heading)*step;
   if(this.isBlocked(e,x,y,angle))break;e.x=x;e.y=y;e.angle=angle;
   e.frame=Math.round(((Math.PI/2-angle)%TAU+TAU)%TAU/TAU*60);this.hooks.moved?.(e);
  }
 }
 plantStep(e,dt){
  const h=this.habitat(e.x,e.y);const pine=this.entities.some(o=>o.alive&&o.kind==='Pine'&&o!==e&&Math.hypot(o.x-e.x,o.y-e.y)<85+110*o.biomass);
  let rate;
  if(e.kind==='Grass')rate=pine?-.22:!h.sun?-.14:h.wet?-.11:.14;
  else if(e.kind==='Clover')rate=pine?-.22:h.wet?.19:-.065;
  else rate=e.habitat==='sun'?.12:.004;
  if(rate>0)e.biomass=logistic(Math.min(e.biomass,.999),rate,dt);else e.biomass=Math.max(0,e.biomass+rate*dt);
  if(e.biomass<=.015){e.frame=0;this.remove(e,'habitat');return;}
  e.frame=Math.round(clamp(e.biomass,0,1)*60);
  if(e.kind==='Pine')return; // Pine remains rooted in the habitat in which it was placed.
  e.spreadClock+=dt;
  if(rate>0&&e.biomass>.72&&e.spreadClock>=SPECIES[e.kind].spread){
   e.spreadClock=0;
   if(this.entities.filter(o=>o.alive&&SPECIES[o.kind].plant).length>=100)return;
   // Spread in both horizontal and vertical directions, with local capacity and competition.
   const start=Math.floor(this.random()*8);
   for(let j=0;j<8;j++){const a=(j+start)*Math.PI/4;const x=e.x+Math.cos(a)*e.width*.60,y=e.y+Math.sin(a)*e.height*.60;const nh=this.habitat(x,y);
    if(x<220||x>1840||y<180||y>980||!nh.land||(e.kind==='Grass'?(!nh.sun||nh.wet):!nh.wet))continue;
    if(this.entities.some(o=>o.alive&&SPECIES[o.kind].plant&&Math.hypot(x-o.x,y-o.y)<(o.kind==='Pine'?180:72)))continue;
    this.add(e.kind,x,y,{biomass:.22,frame:13,width:e.width,height:e.height});break;
   }
  }
 }
}
