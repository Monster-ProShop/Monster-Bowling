import test from 'node:test';
import assert from 'node:assert/strict';
import {mappedBracketGames,validateState} from '../functions/league-model.mjs';
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
