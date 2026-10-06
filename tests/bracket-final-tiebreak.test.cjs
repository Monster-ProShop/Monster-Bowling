const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const rules=source.slice(source.indexOf('function complete('),source.indexOf('function bracketGraphic('));
const context=vm.createContext({});
vm.runInContext(rules,context);

const bowler=(id,g1,g2,g3,handicap=0)=>({id,name:id,handicap,scores:{g1,g2,g3}});
const amounts=awards=>Object.fromEntries(awards.map(award=>[award.id,award.amount]));

test('final tie uses handicap series before highest handicap game',()=>{
  let players=[bowler('A',160,100,200),bowler('B',140,110,200)];
  assert.deepEqual(amounts(context.bracketFinalAwards(players,'hdcp',25000,10000,'Bracket')),{A:25000,B:10000});

  players=[bowler('A',200,50,200),bowler('B',210,40,200)];
  assert.deepEqual(amounts(context.bracketFinalAwards(players,'hdcp',25000,10000,'Bracket')),{B:25000,A:10000});
});

test('complete final tie splits first and second prizes equally',()=>{
  const players=[bowler('A',100,150,200),bowler('B',100,150,200)];
  assert.deepEqual(amounts(context.bracketFinalAwards(players,'hdcp',25000,10000,'Bracket')),{A:17500,B:17500});
});

test('De La Rosa final uses its three-game window and combines tied prizes',()=>{
  const masters=fs.readFileSync(path.join(root,'DeLaRosaMasters','masters.js'),'utf8');
  assert.match(masters,/games\.reduce\(\(sum,game\)=>sum\+score\(player,game,true\),0\)/);
  assert.match(masters,/const pool=places\.slice\(rank,Math\.min\(end,places\.length\)\)\.reduce/);
});
