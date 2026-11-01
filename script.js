document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', e => {
  // F12
  if (e.key === 'F12') {
    e.preventDefault();
  }

  // Ctrl + U
  if (e.ctrlKey && e.key.toLowerCase() === 'u') {
    e.preventDefault();
  }

  // Ctrl + Shift + I / J / C (DevTools)
  if (e.ctrlKey && e.shiftKey && ['i','j','c'].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }

  // Ctrl + S or Cmd + S (Disable Save Page)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
  }
});

const SH={
 1:'<svg width="__" height="__" viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="currentColor"/></svg>',
 2:'<svg width="__" height="__" viewBox="0 0 40 40"><circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" stroke-width="6"/></svg>',
 3:'<svg width="__" height="__" viewBox="0 0 40 40"><rect x="7" y="7" width="26" height="26" rx="3" fill="currentColor"/></svg>',
 4:'<svg width="__" height="__" viewBox="0 0 40 40"><path d="M20 3 37 20 20 37 3 20Z" fill="currentColor"/></svg>'};
const shape=(n,s)=>SH[n].replace(/__/g,s);

/* ---------- Settings ---------- */
const DEFAULTS={rounds:2,seqLen:4,seqStep:1,ask:2,step:1,show:1000,time:45,errors:3,newOnWrong:1};
const MAXSEQ=8;
const SCHEMA=[
 {k:'rounds',label:'Rounds',hint:'How many rounds to win',opts:[[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5']]},
 {k:'seqLen',label:'Sequence length (round 1)',hint:'Packets shown in the first round',opts:[[3,'3'],[4,'4'],[5,'5'],[6,'6'],[7,'7']]},
 {k:'seqStep',label:'Sequence growth per round',hint:'Extra packets shown each round (max 8)',opts:[[0,'None'],[1,'+1'],[2,'+2']]},
 {k:'ask',label:'Packets asked (round 1)',hint:'Recalled in reverse order',opts:[[1,'1'],[2,'2'],[3,'3'],[4,'4']]},
 {k:'step',label:'Increase per round',hint:'Extra packets asked each round',opts:[[0,'None'],[1,'+1'],[2,'+2']]},
 {k:'show',label:'Packet display time',hint:'Per packet',opts:[[500,'0.5s'],[750,'0.75s'],[1000,'1s'],[1500,'1.5s'],[2000,'2s']]},
 {k:'time',label:'Time limit',hint:'One timer for the whole game, all rounds',opts:[[0,'Off'],[30,'30s'],[45,'45s'],[60,'60s'],[90,'90s']]},
 {k:'errors',label:'Errors allowed',hint:'Wrong entries before the lock jams',opts:[[1,'1'],[2,'2'],[3,'3'],[4,'4'],[5,'5']]},
 {k:'newOnWrong',label:'After a wrong entry',hint:'New sequence keeps the timer running',opts:[[1,'New sequence'],[0,'Same sequence']]}
];
const KEY='packetRecall.settings.v1';
function loadSettings(){
  const s={...DEFAULTS};
  try{
    const raw=JSON.parse(localStorage.getItem(KEY)||'{}');
    SCHEMA.forEach(d=>{if(d.opts.some(o=>o[0]===raw[d.k]))s[d.k]=raw[d.k];});
  }catch(e){}
  return s;
}
function saveSettings(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}
let S=loadSettings();
const seqFor=r=>Math.min(MAXSEQ,S.seqLen+r*S.seqStep);
const askFor=r=>Math.max(1,Math.min(seqFor(r),S.ask+r*S.step));

/* ---------- Game ---------- */
const GAP=300;
const view=document.getElementById('view');
let st,timers=[],raf=0,screen='home';

function clearAll(){timers.forEach(clearTimeout);timers=[];cancelAnimationFrame(raf);}
const later=(f,ms)=>timers.push(setTimeout(f,ms));
const livesHTML=()=>Array.from({length:S.errors},(_,i)=>`<span class="dot ${i<st.errors?'':'off'}"></span>`).join('');
const hud=(mid)=>`<div class="hud"><div>Round <b>${st.round+1}/${S.rounds}</b></div><div class="mid">${mid}</div><div class="lives">Errors ${livesHTML()}</div></div>`;
const foot=()=>S.time?`<div class="foot"><div class="bar"><i id="fill"></i></div><div class="time" id="time"></div></div>`:`<div class="foot"></div>`;
const joinNums=a=>a.length===1?`packet <b>${a[0]}</b>`:`packets `+a.map(n=>`<b>${n}</b>`).join(' ').replace(/<\/b> <b>/g,'</b>, <b>').replace(/, (<b>\d+<\/b>)$/,' and $1');

function home(title,msg,btn){
  clearAll();screen='home';
  view.innerHTML=`<div class="stage"><h2>${title}</h2><p>${msg}</p>
    <div class="row-btns"><button class="btn pri" id="again">${btn}</button><button class="btn" id="openSet">Settings</button></div></div>`;
  document.getElementById('again').onclick=start;
  document.getElementById('openSet').onclick=settings;
}
function start(){
  clearAll();
  st={round:0,errors:S.errors};
  screen='play';
  ready();
}
/* Settings screen */
function settings(){
  clearAll();screen='settings';
  view.innerHTML=`<div class="sets"><h2>Settings</h2>${SCHEMA.map(d=>`
    <div class="set"><div class="lab"><span>${d.label}</span><small>${d.hint}</small></div>
    <div class="opts" role="group" aria-label="${d.label}">${d.opts.map(o=>`<button class="opt" data-k="${d.k}" data-v="${o[0]}" aria-pressed="${S[d.k]===o[0]}">${o[1]}</button>`).join('')}</div></div>`).join('')}
  </div>
  <div class="setfoot"><button class="btn" id="reset">Reset defaults</button><button class="btn pri" id="done">Done</button></div>`;
  view.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{
    S[b.dataset.k]=+b.dataset.v;
    if(S.ask>S.seqLen)S.ask=S.seqLen;
    saveSettings();refreshOpts();
  });
  document.getElementById('reset').onclick=()=>{S={...DEFAULTS};saveSettings();refreshOpts();};
  document.getElementById('done').onclick=()=>home('Packet Recall',summary(),'Start');
}
function refreshOpts(){
  view.querySelectorAll('.opt').forEach(b=>b.setAttribute('aria-pressed',String(S[b.dataset.k]===+b.dataset.v)));
}
function summary(){
  const asks=Array.from({length:S.rounds},(_,r)=>askFor(r));
  const lens=Array.from({length:S.rounds},(_,r)=>seqFor(r));
  return `Memorize the packets, then enter the ones asked for in reverse.<br><span style="font-size:13px">${S.rounds} round${S.rounds>1?'s':''} · shows ${lens.join(' → ')} · asks ${asks.join(' → ')} · ${S.time?S.time+'s limit':'no time limit'} · ${S.errors} error${S.errors>1?'s':''}</span>`;
}
/* Phase 1 */
function ready(){
  clearAll();
  view.innerHTML=`<div class="stage" style="flex:1">
    <svg width="90" height="70" viewBox="0 0 24 20" fill="var(--y)"><rect x="1" y="1" width="6" height="6" rx="2"/><rect x="9" y="1" width="6" height="6" rx="2" fill="none" stroke="var(--y)" stroke-width="1.6"/><rect x="17" y="1" width="6" height="6" rx="2"/><path d="M20 13H5m0 0 4-4m-4 4 4 4" stroke="var(--y)" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h2>Inspecting Door Lock</h2><p>Remember the lock pattern</p></div>`;
  if(S.time&&st.started)tick();
  later(()=>memory(true),4000);
}
/* Phase 2 */
function memory(keepTimer){
  clearAll();
  const L=seqFor(st.round),ask=askFor(st.round);
  const seq=[];
  while(seq.length<L){const n=1+Math.floor(Math.random()*4);if(n!==seq[seq.length-1])seq.push(n);}
  const idx=Array.from({length:L},(_,i)=>i+1).sort(()=>Math.random()-.5).slice(0,ask).sort((a,b)=>a-b);
  st.seq=seq;st.idx=idx;st.answer=idx.slice().reverse().map(i=>seq[i-1]);st.entered=[];
  if(!st.started){st.started=true;st.total=S.time*1000;st.deadline=S.time?performance.now()+st.total:0;}
  view.innerHTML=hud('Watch the packets')+`<div class="stage"><div class="box" id="box" style="color:var(--y)"></div><div class="segs" id="segs">${seq.map(()=>'<span></span>').join('')}</div></div>`+foot();
  if(S.time)tick();
  const box=document.getElementById('box'),segs=[...document.querySelectorAll('#segs span')];
  seq.forEach((n,i)=>{
    later(()=>{box.innerHTML=shape(n,90);segs.forEach((s,j)=>s.classList.toggle('on',j===i));},i*(S.show+GAP)+300);
    later(()=>{box.innerHTML='';},i*(S.show+GAP)+300+S.show);
  });
  later(entry,L*(S.show+GAP)+300);
}
/* Phase 3 */
function entry(){
  const need=st.idx.slice().reverse();
  view.innerHTML=hud('Enter them')+`<div class="stage"><div class="ask">Enter ${joinNums(st.idx)}, last to first</div>
    <div class="slots" id="slots">${need.map(i=>`<div class="slot"><span>#${i}</span><div></div></div>`).join('')}</div>
    <div class="pad">${[1,2,3,4].map(n=>`<button class="key" data-n="${n}" aria-label="Shape ${n}">${shape(n,34)}<small>${n}</small></button>`).join('')}</div>
    <button class="btn" id="undo">Undo</button></div>`+foot();
  view.querySelectorAll('.key').forEach(b=>b.onclick=()=>press(+b.dataset.n));
  document.getElementById('undo').onclick=()=>{st.entered.pop();drawSlots();};
  drawSlots();
}
function drawSlots(){
  const slots=[...document.querySelectorAll('#slots .slot')];
  slots.forEach((s,i)=>{
    s.classList.toggle('cur',i===st.entered.length);
    s.querySelector('div').innerHTML=st.entered[i]?`<span style="color:var(--t)">${shape(st.entered[i],44)}</span>`:'';
  });
}
function press(n){
  if(screen!=='play'||!document.getElementById('slots'))return;
  const i=st.entered.length;
  if(i>=st.answer.length)return;
  st.entered.push(n);drawSlots();
  if(n!==st.answer[i]){
    st.errors--;
    const sl=document.getElementById('slots');sl.classList.add('shake');
    document.querySelector('.stage').classList.add('flash-bad');
    document.querySelector('.lives').innerHTML='Errors '+livesHTML();
    if(st.errors<=0){later(()=>end(false,'Out of errors.'),350);return;}
    later(()=>{
      if(S.newOnWrong){memory(true);return;}
      st.entered=[];document.querySelector('.stage')?.classList.remove('flash-bad');sl.classList.remove('shake');drawSlots();
    },450);
    return;
  }
  if(st.entered.length===st.answer.length){
    later(()=>{
      if(st.round+1>=S.rounds)end(true);
      else{st.round++;memory(true);}
    },350);
  }
}
function tick(){
  const left=Math.max(0,st.deadline-performance.now());
  const f=document.getElementById('fill'),t=document.getElementById('time');
  if(f){f.style.width=(left/st.total*100)+'%';t.textContent=(left/1000).toFixed(1)+'s';}
  if(left<=0){end(false,'Time ran out.');return;}
  raf=requestAnimationFrame(tick);
}
function end(win,why){
  clearAll();screen='home';
  view.innerHTML=`<div class="stage"><h2 style="color:${win?'var(--y)':'var(--r)'}">${win?'Lock bypassed':'Lock jammed'}</h2><p>${win?(S.rounds>1?'All '+S.rounds+' rounds complete.':'Round complete.'):why+' Reset the pattern and try again.'}</p>
    <div class="row-btns"><button class="btn pri" id="again">${win?'Play again':'Retry'}</button><button class="btn" id="openSet">Settings</button></div></div>`;
  document.getElementById('again').onclick=start;
  document.getElementById('openSet').onclick=settings;
}
function abort(){
  if(screen==='settings'){home('Packet Recall',summary(),'Start');return;}
  home('Aborted','You stepped away from the lock.','Start');
}
document.getElementById('abort').onclick=abort;
addEventListener('keydown',e=>{
  if(e.key==='Escape')abort();
  else if(screen==='play'&&'1234'.includes(e.key)&&e.key.length===1)press(+e.key);
  else if(screen==='play'&&e.key==='Backspace'&&document.getElementById('undo'))document.getElementById('undo').click();
});
home('Packet Recall',summary(),'Start');
