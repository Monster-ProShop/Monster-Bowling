import test from 'node:test';
import assert from 'node:assert/strict';
import {generateLeagueSchedule,mappedBracketGames,validateLeagueConfiguration,validateState} from '../functions/league-model.mjs';
const profile={id:'11111111-1111-4111-8111-111111111111',name:'Same Name',email:'bowler@example.test',membership_number:'MX-1'};
const state={config:{totalGames:3},teams:[{id:1,name:'Team',players:[{profileId:profile.id}]}],matches:[]};
test('identity uses IDs or email, never a matching display name',()=>{
 const result=mappedBracketGames({bowlers:[{id:'other',name:'Same Name',scores:{g1:200}}]},[profile],new Set([profile.id]),3);
 assert.equal(result.games.length,0);assert.deepEqual(result.unmapped,['Same Name']);
});
test('zero is a bowled game, blanks are not; email matching ignores case',()=>{
 const result=mappedBracketGames({bowlers:[{email:'BOWLER@EXAMPLE.TEST',scores:{g1:0,g2:null,g3:300}}]},[profile],new Set([profile.id]),3);
 assert.deepEqual(result.games.map(g=>g.scratch),[0,300]);
});
test('scores never leak to a bowler outside the session roster',()=>{
 assert.equal(mappedBracketGames({bowlers:[{id:profile.id,scores:{g1:200}}]},[profile],new Set(),3).games.length,0);
});
test('ambiguous profile match is not guessed',()=>{
 const result=mappedBracketGames({bowlers:[{id:profile.id,email:profile.email,scores:{g1:200}}]},[profile,{...profile,id:'22222222-2222-4222-8222-222222222222'}],new Set([profile.id]),3);
 assert.equal(result.games.length,0);
});
test('invalid scores and duplicate bowlers are rejected',()=>{
 assert.throws(()=>mappedBracketGames({bowlers:[{id:profile.id,scores:{g1:301}}]},[profile],new Set([profile.id]),3));
 assert.throws(()=>validateState({...state,teams:[...state.teams,...state.teams]},[profile]));
 assert.throws(()=>validateState({...state,config:{totalGames:0}},[profile]));
 assert.equal(validateState(state,[profile]).size,1);
});
test('multi-day De La Rosa needs explicit game mapping',()=>assert.throws(()=>mappedBracketGames({format:'delarosa-masters-v1'},[],new Set(),3)));

const league={numberOfTeams:8,activeBowlers:4,substituteBowlers:2,numberOfSessions:9,gamesPerBowler:3,startLane:1,startDate:'2026-10-15',positionRounds:[8],points:{gameWin:1,gameTie:.5,seriesWin:1,seriesTie:.5},handicap:{global:{percent:90,base:220,minAverage:100,maxAverage:230}},finances:{costPerGame:40,prizeFundPerSession:25}};
test('league configuration enforces supported USBC team counts',()=>{
 assert.equal(validateLeagueConfiguration(league).numberOfTeams,8);
 assert.throws(()=>validateLeagueConfiguration({...league,numberOfTeams:7}),/even number/);
 assert.throws(()=>validateLeagueConfiguration({...league,numberOfTeams:50}),/between 4 and 48/);
});
test('regular sessions rotate every team, opponent and lane pair',()=>{
 const schedule=generateLeagueSchedule(league), regular=schedule.slice(0,7);
 assert.equal(schedule.length,9);assert.equal(schedule[7].positionRound,true);assert.match(schedule[7].label,/Position Round/);
 for(const week of regular){const teams=week.matches.flatMap(m=>[m.teamA,m.teamB]);assert.deepEqual([...teams].sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);}
 const opponents=new Set(regular.map(w=>{const m=w.matches.find(x=>x.teamA===1||x.teamB===1);return m.teamA===1?m.teamB:m.teamA;}));
 const lanes=new Set(regular.map(w=>w.matches.find(x=>x.teamA===1||x.teamB===1).laneStart));
 assert.equal(opponents.size,7);assert.equal(lanes.size,4);
});
