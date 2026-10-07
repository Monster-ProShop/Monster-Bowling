const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('new sessions preserve roster identity and handicap while clearing play values',()=>{
 const client=read('portal.js'),api=read('functions/portal.js');
 assert.match(client,/previous\.bowlers\.map/);
 assert.match(client,/hdcpCount:0,scratchCount:0,high:false,pairs:false,paid:false/);
 assert.match(client,/scores:\{g1:null,g2:null,g3:null\}/);
 assert.match(client,/_startNewSession=true/);
 assert.match(api,/clearsSavedScore&&!startingNewSession/);
});
