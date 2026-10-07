const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('account-wide playing summary aggregates linked profiles and all archives',()=>{
  const api=read('functions/portal.js'),ui=read('portal.js'),html=read('index.html');
  assert.match(api,/route==='\/career-summary'/);
  assert.match(api,/claimed_user_id=\$1 or l\.user_id=\$1/);
  assert.match(api,/bowling_session_archives where competition_id=\$1/);
  assert.match(api,/totalGames/);
  assert.match(api,/moneyInvested/);
  assert.match(api,/gameAverages:gameAverages\(totalGamesByPosition\)/);
  assert.match(ui,/renderCareerSummary/);
  assert.match(ui,/Game '\+item\.game\+' average/);
  assert.match(ui,/G'\+game\+' average/);
  assert.match(html,/data-dashboard-tab="summary"/);
});
