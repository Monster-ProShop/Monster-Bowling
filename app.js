const KEY = 'monster-bowling-v2';
const DEFAULT_CONFIG = {hdcpBuyin:10,hdcpFirst:50,hdcpSecond:25,scratchBuyin:10,scratchFirst:50,scratchSecond:25,highBuyin:20,highPayout:100,quinBuyin:50,quinGameFirst:30,quinGameSecond:20,quinSeriesFirst:30,quinSeriesSecond:20};
const CONFIG_IDS = Object.keys(DEFAULT_CONFIG);
const money = cents => '$' + (cents / 100).toFixed(2);
const cents = value => Math.round(Number(value) * 100);
const safe = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const num = (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const blankScores = () => ({g1:null,g2:null,g3:null});
function fresh() { return {config:{...DEFAULT_CONFIG},bowlers:[],brackets:{hdcp:[],scratch:[]},generated:false}; }
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw || !Array.isArray(raw.bowlers)) return fresh();
    return {config:{...DEFAULT_CONFIG,...raw.config},bowlers:raw.bowlers.map(b=>({...b,high:!!b.high,quin:!!b.quin,scores:{...blankScores(),...b.scores}})),brackets:raw.brackets || {hdcp:[],scratch:[]},generated:!!raw.generated};
  } catch { return fresh(); }
}
let state = typeof localStorage === 'undefined' ? fresh() : load();
let editingId = null;
function persist() { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY,JSON.stringify(state)); }
function configured(c) {
  for (const id of CONFIG_IDS) if (!Number.isFinite(Number(c[id])) || c[id] < 0 || (id.includes('Buyin') && cents(c[id]) < 0) || (!id.includes('Buyin') && c[id] > 100)) return false;
  return c.hdcpFirst+c.hdcpSecond <= 100 && c.scratchFirst+c.scratchSecond <= 100 &&
    c.quinGameFirst+c.quinGameSecond+c.quinSeriesFirst+c.quinSeriesSecond <= 100;
}
function totalEntries(type) { return state.brackets[type].reduce((n,b)=>n+b.length,0); }
function assignedCount(type,id) { return state.brackets[type].reduce((n,b)=>n+b.filter(p=>p===id).length,0); }
function shuffle(a) { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function buildBrackets(bowlers,type) {
  const prop = type==='hdcp'?'hdcpCount':'scratchCount';
  const pool = bowlers.map(b=>({id:b.id,limit:Math.max(0,Math.floor(Number(b[prop])||0)),assigned:0}));
  const eligible=pool.filter(b=>b.limit>0).length;
  if(eligible<7) return [];
  const spots=eligible===7?7:8;
  const total = pool.reduce((n,b)=>n+b.limit,0);
  let low=0, high=Math.floor(total/spots);
  // A bowler can appear only once in each bracket. This condition gives the
  // maximum number of brackets possible under everyone's limits. A seven
  // bowler field gets one first-round bye in each eight-slot bracket.
  while(low<high) {
    const mid=Math.ceil((low+high)/2);
    if(pool.reduce((n,b)=>n+Math.min(b.limit,mid),0)>=spots*mid) low=mid;
    else high=mid-1;
  }
  const count=low, entries=count*spots;
  if(!count) return [];
  // Spread spots across bowlers first, then use the remaining capacity.
  for(let i=0;i<entries;i++) {
    const eligible=pool.filter(b=>b.assigned<Math.min(b.limit,count));
    const chosen=shuffle(eligible).sort((a,b)=>(a.assigned/Math.min(a.limit,count))-(b.assigned/Math.min(b.limit,count)))[0];
    chosen.assigned++;
  }
  // Place the largest assignments first into the emptiest brackets.
  const result=Array.from({length:count},()=>[]);
  shuffle(pool).sort((a,b)=>b.assigned-a.assigned).forEach(b=>{
    const available=shuffle(result.map((ids,index)=>({ids,index}))).sort((a,b)=>a.ids.length-b.ids.length);
    available.slice(0,b.assigned).forEach(slot=>slot.ids.push(b.id));
  });
  return result.map(ids=>shuffle(spots===7?[...ids,null]:ids));
}
function complete(b) { return ['g1','g2','g3'].every(g=>b.scores[g]!==null && b.scores[g]!=='' && Number.isFinite(Number(b.scores[g]))); }
function game(b,g,handicap=false) { return Number(b.scores['g'+g])+(handicap?Number(b.handicap):0); }
function series(b,handicap=false) { return [1,2,3].reduce((n,g)=>n+game(b,g,handicap),0); }
function bestGame(b,handicap=false) { return Math.max(...[1,2,3].map(g=>game(b,g,handicap))); }
function rankAwards(players,value,pool,percentages,description) {
  const sorted=[...players].sort((a,b)=>value(b)-value(a)||a.name.localeCompare(b.name));
  const awards=[];
  let rank=0;
  for(let i=0;i<sorted.length && rank<percentages.length;){
    const tied=sorted.filter(p=>value(p)===value(sorted[i]));
    const first=i, last=i+tied.length;
    const amount=percentages.slice(first,Math.min(last,percentages.length)).reduce((n,p)=>n+Math.round(pool*p/100),0);
    if(amount>0) {
      const share=Math.floor(amount/tied.length), remainder=amount%tied.length;
      tied.forEach((p,j)=>awards.push({id:p.id,description:description+' · '+(first+1)+(tied.length>1?' tie':'')+' ('+value(p)+')',amount:share+(j<remainder?1:0)}));
    }
    i=last;rank=i;
  }
  return awards;
}
function bracketFinalists(ids,type,bowlers) {
  const byId=new Map(bowlers.map(b=>[b.id,b]));
  const players=ids.map(id=>id===null?null:byId.get(id));
  if(players.some((p,i)=>ids[i]!==null&&(!p||!complete(p)))) return null;
  const hdcp=type==='hdcp';
  const winners=(group,g)=>{const active=group.filter(Boolean);if(active.length<=1)return active;const max=Math.max(...active.map(p=>game(p,g,hdcp)));return active.filter(p=>game(p,g,hdcp)===max);};
  const round1=[0,2,4,6].map(i=>winners(players.slice(i,i+2),1));
  const semi=[winners([...round1[0],...round1[1]],2),winners([...round1[2],...round1[3]],2)];
  return [...semi[0],...semi[1]];
}
function bracketGraphic(ids,type,bowlers,index) {
  const byId=new Map(bowlers.map(b=>[b.id,b]));
  const entrants=ids.map(id=>id===null?null:byId.get(id)).filter((_,i)=>i<8);
  const hdcp=type==='hdcp';
  const outcome=(members,gameNumber,ready=true)=>{
    if(!ready) return {winners:[],decided:false};
    const active=members.filter(Boolean);
    if(active.length===1) return {winners:active,decided:true};
    if(!active.length||active.some(b=>b.scores['g'+gameNumber]===null)) return {winners:[],decided:false};
    const top=Math.max(...active.map(b=>game(b,gameNumber,hdcp)));
    return {winners:active.filter(b=>game(b,gameNumber,hdcp)===top),decided:true};
  };
  const first=Array.from({length:4},(_,i)=>outcome(entrants.slice(i*2,i*2+2),1));
  const second=Array.from({length:2},(_,i)=>outcome([...first[i*2].winners,...first[i*2+1].winners],2,first[i*2].decided&&first[i*2+1].decided));
  const final=outcome([...second[0].winners,...second[1].winners],3,second.every(x=>x.decided));
  const xs=[20,300,590,870], width=210, height=34;
  const ys1=Array.from({length:8},(_,i)=>70+i*54);
  const centers1=ys1.map(y=>y+height/2);
  const centers2=Array.from({length:4},(_,i)=>(centers1[i*2]+centers1[i*2+1])/2);
  const centers3=Array.from({length:2},(_,i)=>(centers2[i*2]+centers2[i*2+1])/2);
  const center4=(centers3[0]+centers3[1])/2;
  const line=(x1,y1,x2,y2)=>'<path d="M'+x1+' '+y1+' L'+x2+' '+y2+'" fill="none" stroke="#9b8254" stroke-width="2.5"/>';
  const links=(fromX,toX,centers)=>centers.reduce((out,y,i)=>{
    if(i%2)return out;
    const y2=centers[i+1], mid=(y+y2)/2, joint=fromX+27;
    return out+line(fromX,y,joint,y)+line(fromX,y2,joint,y2)+line(joint,y,joint,y2)+line(joint,mid,toX,mid);
  },'');
  const box=(x,y,people,g,result,placeholder='PENDING')=>{
    const one=people.filter(Boolean), bye=!one.length;
    const label=bye?placeholder:one.map(b=>b.name).join(' / ');
    const score=one.length===1&&one[0].scores['g'+g]!==null?'  '+game(one[0],g,hdcp):'';
    const shown=(label+score).length>27?(label+score).slice(0,26)+'…':label+score;
    const won=result.decided&&one.length>0&&one.every(b=>result.winners.some(w=>w.id===b.id));
    const lost=result.decided&&one.length>0&&one.every(b=>!result.winners.some(w=>w.id===b.id));
    const bg=bye?'#eeeae3':'#fffaf0';
    let mark='';
    if(won) mark='<ellipse cx="'+(x+width/2)+'" cy="'+(y+height/2)+'" rx="'+(width/2+5)+'" ry="'+(height/2+5)+'" fill="none" stroke="#1d67d6" stroke-width="3.5"/>';
    if(lost) mark='<path d="M'+(x+width-26)+' '+(y+8)+' l16 18 M'+(x+width-10)+' '+(y+8)+' l-16 18" fill="none" stroke="#c53038" stroke-width="4" stroke-linecap="round"/>';
    return '<g><title>'+safe(label)+'</title><rect x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'" rx="8" fill="'+bg+'" stroke="#bdac8b"/><text x="'+(x+12)+'" y="'+(y+22)+'" font-size="14" font-weight="700" fill="'+(bye?'#777':'#17212e')+'">'+safe(shown)+'</text>'+mark+'</g>';
  };
  let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1110 550" role="img" aria-label="'+safe((hdcp?'Handicap':'Scratch')+' bracket '+(index+1))+'" class="bracket-svg"><rect width="1110" height="550" fill="#fffdf9"/>';
  ['GAME 1','GAME 2 · SEMIFINAL','GAME 3 · FINAL','WINNER'].forEach((t,i)=>svg+='<text x="'+xs[i]+'" y="38" fill="#66151c" font-size="16" font-weight="800">'+t+'</text>');
  svg+=links(xs[0]+width,xs[1],centers1)+links(xs[1]+width,xs[2],centers2);
  svg+=line(xs[2]+width,centers3[0],xs[2]+width+27,centers3[0])+line(xs[2]+width,centers3[1],xs[2]+width+27,centers3[1])+line(xs[2]+width+27,centers3[0],xs[2]+width+27,centers3[1])+line(xs[2]+width+27,center4,xs[3],center4);
  entrants.forEach((p,i)=>svg+=box(xs[0],ys1[i],p?[p]:[],1,first[Math.floor(i/2)],'BYE'));
  first.forEach((r,i)=>svg+=box(xs[1],centers2[i]-height/2,r.winners,2,second[Math.floor(i/2)]));
  second.forEach((r,i)=>svg+=box(xs[2],centers3[i]-height/2,r.winners,3,final));
  svg+=box(xs[3],center4-height/2,final.winners,3,{winners:final.winners,decided:final.decided});
  svg+='<text x="20" y="530" fill="#596578" font-size="13">Blue circle = winner   •   Red X = loser   •   BYE = automatic advance</text></svg>';
  return svg;
}
function calculate(state) {
  const c=state.config, bowlers=state.bowlers, awards=[], pending=[];
  if(!configured(c)) return {awards,pending:['Fix payout percentages before calculating payouts.']};
  for(const type of ['hdcp','scratch']) {
    for(const [i,ids] of state.brackets[type].entries()) {
      const finalists=bracketFinalists(ids,type,bowlers);
      if(!finalists){pending.push(type+' bracket #'+(i+1)+' needs all three scores for every entrant.');continue;}
      const pool=cents(c[type+'Buyin'])*ids.filter(Boolean).length;
      const value=p=>game(p,3,type==='hdcp');
      awards.push(...rankAwards(finalists,value,pool,[c[type+'First'],c[type+'Second']],(type==='hdcp'?'HDCP':'Scratch')+' bracket #'+(i+1)));
    }
  }
  const high=bowlers.filter(b=>b.high);
  if(high.length && high.every(complete)) {
    awards.push(...rankAwards(high,b=>bestGame(b,true),cents(c.highBuyin)*high.length,[c.highPayout],'HDCP High Game Pot'));
  } else if(high.length) pending.push('High Game Pot needs all three scores for every entrant.');
  const quin=bowlers.filter(b=>b.quin);
  if(quin.length && quin.every(complete)) {
    const pool=cents(c.quinBuyin)*quin.length;
    awards.push(...rankAwards(quin,b=>bestGame(b),pool,[c.quinGameFirst,c.quinGameSecond],'Quiniela high game'));
    awards.push(...rankAwards(quin,b=>series(b),pool,[c.quinSeriesFirst,c.quinSeriesSecond],'Quiniela high series'));
  } else if(quin.length) pending.push('Quiniela needs all three scores for every entrant.');
  return {awards,pending};
}
function status(message) { document.getElementById('status').textContent=message; }
function render() {
  CONFIG_IDS.forEach(id=>{const el=document.getElementById(id); if(document.activeElement!==el) el.value=state.config[id];});
  document.getElementById('rosterRows').innerHTML=state.bowlers.map(b=>'<tr><td>'+safe(b.name)+'</td><td>'+b.handicap+'</td><td>'+b.hdcpCount+'</td><td>'+b.scratchCount+'</td><td>'+(b.high?'Yes':'No')+'</td><td>'+(b.quin?'Yes':'No')+'</td><td><button class="secondary" data-edit="'+safe(b.id)+'">Edit</button> <button class="danger" data-remove="'+safe(b.id)+'">Remove</button></td></tr>').join('') || '<tr><td colspan="7">No bowlers registered yet.</td></tr>';
  for(const type of ['hdcp','scratch']) {
    document.getElementById(type+'Brackets').innerHTML=state.brackets[type].map((ids,i)=>'<div class="bracket"><div class="bracket-head"><strong>'+(type==='hdcp'?'Handicap':'Scratch')+' bracket #'+(i+1)+'</strong><button class="secondary no-print" data-download="'+type+':'+i+'">Download SVG image</button></div><div class="bracket-scroll">'+bracketGraphic(ids,type,state.bowlers,i)+'</div></div>').join('') || '<p class="hint">No brackets generated. At least seven different bowlers must select this event.</p>';
  }
  const unused=state.bowlers.flatMap(b=>['hdcp','scratch'].map(t=>{const n=b[t+'Count']-assignedCount(t,b.id);return n>0?b.name+': '+n+' unused '+t+' '+(n===1?'spot':'spots'):null;})).filter(Boolean);
  document.getElementById('bracketNotice').innerHTML=state.generated&&unused.length?'<p class="notice">Willingness above the available full brackets: '+safe(unused.join(' · '))+'</p>':'';
  document.getElementById('scoreRows').innerHTML=state.bowlers.map(b=>'<tr><td>'+safe(b.name)+' (+'+b.handicap+')</td>'+[1,2,3].map(g=>'<td><input aria-label="'+safe(b.name)+' game '+g+'" data-score="'+safe(b.id)+'" data-game="g'+g+'" type="number" min="0" max="300" step="1" value="'+(b.scores['g'+g]??'')+'"></td>').join('')+'<td>'+(complete(b)?series(b):'—')+'</td><td>'+(complete(b)?series(b,true):'—')+'</td></tr>').join('')||'<tr><td colspan="6">Register bowlers first.</td></tr>';
  const c=state.config;
  const chargeRows=state.bowlers.map(b=>{
    const h=assignedCount('hdcp',b.id),s=assignedCount('scratch',b.id),high=b.high?1:0,quin=b.quin?1:0;
    const total=h*cents(c.hdcpBuyin)+s*cents(c.scratchBuyin)+high*cents(c.highBuyin)+quin*cents(c.quinBuyin);
    return '<tr><td>'+safe(b.name)+'</td><td>'+h+' × '+money(cents(c.hdcpBuyin))+'</td><td>'+s+' × '+money(cents(c.scratchBuyin))+'</td><td>'+money(high*cents(c.highBuyin))+'</td><td>'+money(quin*cents(c.quinBuyin))+'</td><td class="money">'+money(total)+'</td></tr>';
  });
  document.getElementById('chargeRows').innerHTML=chargeRows.join('')||'<tr><td colspan="6">No registrations yet.</td></tr>';
  document.getElementById('chargeNotice').innerHTML=!state.generated&&state.bowlers.some(b=>b.hdcpCount||b.scratchCount)?'<p class="notice">Generate brackets to determine actual bracket charges.</p>':unused.length?'<p class="notice">Unused bracket willingness is not charged: '+safe(unused.join(' · '))+'</p>':'';
  const result=calculate(state);
  document.getElementById('payoutNotice').innerHTML=result.pending.length?'<p class="notice">'+safe(result.pending.join(' · '))+'</p>':'';
  document.getElementById('payoutRows').innerHTML=result.awards.map(a=>'<tr><td>'+safe(state.bowlers.find(b=>b.id===a.id)?.name||'Unknown')+'</td><td>'+safe(a.description)+'</td><td class="money">'+money(a.amount)+'</td></tr>').join('')||'<tr><td colspan="3">No payouts determined yet.</td></tr>';
  document.getElementById('payoutTotal').textContent='Total awarded: '+money(result.awards.reduce((n,a)=>n+a.amount,0));
}
function resetForm() {
  editingId=null;document.getElementById('bowlerForm').reset();document.getElementById('handicap').value=0;
  document.getElementById('hdcpCount').value=1;document.getElementById('scratchCount').value=1;
  document.getElementById('saveBowler').textContent='Add bowler';document.getElementById('cancelEdit').classList.add('hidden');toggleCounts();
}
function toggleCounts() {
  for(const t of ['Hdcp','Scratch']) {
    const on=document.getElementById('join'+t).checked;
    document.getElementById(t.toLowerCase()+'CountWrap').classList.toggle('hidden',!on);
    document.getElementById(t.toLowerCase()+'Count').required=on;
  }
}
function setup() {
  document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
    document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===btn.dataset.tab));render();
  }));
  CONFIG_IDS.forEach(id=>document.getElementById(id).addEventListener('change',e=>{
    const candidate={...state.config,[id]:num(e.target.value,NaN)};
    if(!e.target.value || !configured(candidate)){status('Enter nonnegative amounts and keep each event’s payout percentages at 100% or less.');e.target.value=state.config[id];return;}
    state.config=candidate;persist();render();status('Configuration saved.');
  }));
  ['Hdcp','Scratch'].forEach(t=>document.getElementById('join'+t).addEventListener('change',toggleCounts));
  document.getElementById('bowlerForm').addEventListener('submit',e=>{
    e.preventDefault();
    const name=document.getElementById('name').value.trim(),handicap=Number(document.getElementById('handicap').value);
    const hdcpCount=document.getElementById('joinHdcp').checked?Number(document.getElementById('hdcpCount').value):0;
    const scratchCount=document.getElementById('joinScratch').checked?Number(document.getElementById('scratchCount').value):0;
    if(!name || !Number.isInteger(handicap)||handicap<0||handicap>300||![hdcpCount,scratchCount].every(n=>Number.isInteger(n)&&n>=0)||
      (document.getElementById('joinHdcp').checked&&hdcpCount<1)||(document.getElementById('joinScratch').checked&&scratchCount<1)){status('Check the name, handicap and bracket counts.');return;}
    if(!editingId && state.bowlers.some(b=>b.name.toLowerCase()===name.toLowerCase())){status('A bowler with that name is already registered.');return;}
    if(editingId && state.bowlers.some(b=>b.id!==editingId&&b.name.toLowerCase()===name.toLowerCase())){status('A bowler with that name is already registered.');return;}
    const prior=state.bowlers.find(b=>b.id===editingId);
    const bowler={id:editingId||String(Date.now())+Math.random().toString(36).slice(2),name,handicap,hdcpCount,scratchCount,high:document.getElementById('joinHigh').checked,quin:document.getElementById('joinQuin').checked,scores:prior?.scores||blankScores()};
    if(prior) state.bowlers[state.bowlers.indexOf(prior)]=bowler;else state.bowlers.push(bowler);
    // Registration changes invalidate the generated draw.
    state.brackets={hdcp:[],scratch:[]};state.generated=false;
    persist();resetForm();render();status('Bowler saved. Generate brackets again after roster changes.');
  });
  document.getElementById('cancelEdit').addEventListener('click',resetForm);
  document.getElementById('rosterRows').addEventListener('click',e=>{
    const edit=e.target.closest('[data-edit]'),remove=e.target.closest('[data-remove]');
    if(edit){const b=state.bowlers.find(x=>x.id===edit.dataset.edit);if(!b)return;editingId=b.id;document.getElementById('name').value=b.name;document.getElementById('handicap').value=b.handicap;document.getElementById('joinHdcp').checked=b.hdcpCount>0;document.getElementById('joinScratch').checked=b.scratchCount>0;document.getElementById('joinHigh').checked=b.high;document.getElementById('joinQuin').checked=b.quin;document.getElementById('hdcpCount').value=b.hdcpCount||1;document.getElementById('scratchCount').value=b.scratchCount||1;document.getElementById('saveBowler').textContent='Save changes';document.getElementById('cancelEdit').classList.remove('hidden');toggleCounts();document.getElementById('name').focus();}
    if(remove){const b=state.bowlers.find(x=>x.id===remove.dataset.remove);if(!b||!confirm('Remove '+b.name+' and regenerate brackets?'))return;state.bowlers=state.bowlers.filter(x=>x.id!==b.id);state.brackets={hdcp:[],scratch:[]};state.generated=false;persist();render();status('Bowler removed. Generate brackets again.');}
  });
  document.getElementById('generate').addEventListener('click',()=>{
    state.brackets={hdcp:buildBrackets(state.bowlers,'hdcp'),scratch:buildBrackets(state.bowlers,'scratch')};state.generated=true;persist();render();
    const total=state.brackets.hdcp.length+state.brackets.scratch.length;
    status(total?total+' bracket'+(total===1?'':'s')+' generated.':'No brackets generated. At least seven different bowlers must join an event.');
  });
  document.getElementById('brackets').addEventListener('click',e=>{
    const button=e.target.closest('[data-download]');if(!button)return;
    const svg=button.closest('.bracket').querySelector('svg');
    const file=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'});
    const link=document.createElement('a');link.href=URL.createObjectURL(file);
    link.download='monster-bowling-'+button.dataset.download.replace(':','-')+'.svg';link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  });
  document.getElementById('scoreRows').addEventListener('change',e=>{
    const id=e.target.dataset.score;if(!id)return;const b=state.bowlers.find(x=>x.id===id);if(!b)return;
    const raw=e.target.value;
    if(raw!==''&&(!Number.isInteger(Number(raw))||Number(raw)<0||Number(raw)>300)){status('Enter a whole game score from 0 to 300.');render();return;}
    b.scores[e.target.dataset.game]=raw===''?null:Number(raw);persist();render();status('Score saved.');
  });
  toggleCounts();render();
}
if(typeof document!=='undefined') setup();
if(typeof module!=='undefined') module.exports={fresh,buildBrackets,bracketGraphic,calculate,rankAwards,configured,complete,assignedCount};

