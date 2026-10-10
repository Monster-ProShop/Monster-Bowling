const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Tournaments career summary uses only scored league sessions',()=>{
  const api=read('functions/portal.js');
  const ui=fs.readFileSync(path.join(root,'..','ilusion-bowl-manager','cloud.js'),'utf8');
  const route=api.slice(api.indexOf("route==='/league-career-summary'"),api.indexOf("route==='/directory'"));
  assert.match(route,/c\.kind='league'/);
  assert.match(route,/bowling_league_games/);
  assert.match(route,/bowling_league_sessions/);
  assert.match(route,/if\(!games\.length\)continue/);
  assert.doesNotMatch(route,/bowling_session_archives/);
  assert.doesNotMatch(route,/bowling_competition_state/);
  assert.match(ui,/api\('\/league-career-summary'\)/);
  assert.match(ui,/League average/);
});
