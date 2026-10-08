const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('payout configuration initializes a missing competition state',()=>{
  const api=read('functions/portal.js');
  assert.match(api,/insert into public\.bowling_competition_state\(competition_id,data\)/);
  assert.match(api,/on conflict\(competition_id\) do update set data=jsonb_set/);
  assert.doesNotMatch(api,/if\(!rowCount\) return response\(\{error:'Competition state not found'/);
});

test('competition details use Geoapify and save selected location details',()=>{
  const ui=read('portal.js'),html=read('index.html'),migration=read('neon/006_google_places_locations.sql');
  assert.match(ui,/places\/autocomplete/);
  assert.match(ui,/setupGeoapifyPlaces/);
  assert.match(read('functions/portal.js'),/GEOAPIFY_API_KEY/);
  assert.match(html,/id="editCompetitionForm"/);
  assert.match(html,/Search for the bowling center name/);
  assert.match(html,/powered by <a href="https:\/\/www\.geoapify\.com\/"/);
  assert.match(migration,/google_place_id/);
});
