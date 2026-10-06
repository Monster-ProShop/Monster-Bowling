const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const backend=fs.readFileSync(path.join(root,'functions/portal.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'neon/005_accounts_rosters_archives.sql'),'utf8');
const portal=fs.readFileSync(path.join(root,'portal.js'),'utf8');
const indexHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('account types and manager-owned competition formats are supported',()=>{
  assert.match(backend,/\/account\/setup/);
  assert.match(backend,/\['manager','superadmin'\]\.includes\(actor\.role\)/);
  assert.match(backend,/\['traditional','delarosa'\]/);
  assert.match(portal,/pending-account-type/);
});
test('permanent roster import preview, apply, undo and claims are wired',()=>{
  for(const route of ['/roster/import-preview','/roster/import','/roster/import-undo','/roster/claim','/roster/reset-claim'])assert.ok(backend.includes(route),route);
  for(const route of ['/roster/links','/roster/link-account'])assert.ok(backend.includes(route),route);
  assert.match(migration,/create table if not exists public\.bowling_roster_profiles/);
  assert.match(migration,/unique\(competition_id,claimed_user_id\)/);
  assert.match(indexHtml,/Download Excel roster template/);
  assert.match(portal,/\['Bowler First Name','Bowler Last Name','Handicap'\]/);
  assert.match(backend,/Both Bowler First Name and Bowler Last Name are required/);
  assert.match(backend,/Every imported bowler must include a first and last name/);
  assert.match(backend,/locationLetters\(competition\.country\)\+locationLetters\(competition\.region\)/);
  assert.match(backend,/String\(last\+1\)\.padStart\(7,'0'\)/);
  assert.match(backend,/syncPlayerIdForUser/);
  assert.match(backend,/where claimed_user_id=\$1/);
  assert.match(backend,/update public\.bowling_roster_profiles set membership_number=\$1,updated_at=now\(\) where claimed_user_id=\$2/);
});
test('linked-account management is hidden and blocked for bowler accounts',()=>{
  const portal=fs.readFileSync(root+'/portal.js','utf8');
  assert.match(portal,/const canManage=!!\(admin&&c\.can_manage\)/);
  assert.match(portal,/if\(!\(admin&&rosterCompetition\?\.can_manage\)\)throw new Error\('Manager access required\.'\)/);
  assert.match(backend,/if\(!uuid\.test\(String\(competitionId\)\)\|\|!await canManage\(actor,competitionId\)\)return response\(\{error:'Manager access required'\},403\)/);
});
test('archive defaults to current year and old bracket detail is purged without finances',()=>{
  assert.match(backend,/extract\(year from session_date\)=extract\(year from current_date\)/);
  assert.match(migration,/current_date-interval '6 months'/);
  assert.match(migration,/state=\(state-'brackets'-'generated'\)/);
  assert.match(migration,/results=\(results-'brackets'-'matchups'-'standings'\)/);
  assert.match(migration,/'personal',personal/);
});
