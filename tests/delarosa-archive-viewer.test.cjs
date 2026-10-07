const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('saved De La Rosa sessions reopen in the seven-game archive viewer',()=>{
 const main=read('portal.js'),masters=read('DeLaRosaMasters/masters.js'),api=read('functions/portal.js');
 assert.match(main,/DeLaRosaMasters\/\?competition=.*&session=/);
 assert.match(masters,/requestedSession=pageParams\.get\('session'\)/);
 assert.match(masters,/archiveMode=true/);assert.match(masters,/Saved session · read only/);
 assert.match(api,/results,personal,bowlerId/);
});
