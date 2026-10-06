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
});
test('archive defaults to current year and old bracket detail is purged without finances',()=>{
  assert.match(backend,/extract\(year from session_date\)=extract\(year from current_date\)/);
  assert.match(migration,/current_date-interval '6 months'/);
  assert.match(migration,/state=\(state-'brackets'-'generated'\)/);
  assert.match(migration,/results=\(results-'brackets'-'matchups'-'standings'\)/);
  assert.match(migration,/'personal',personal/);
});
