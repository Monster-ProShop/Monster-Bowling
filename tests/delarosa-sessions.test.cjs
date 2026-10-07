const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('De La Rosa sessions can be archived and restarted with roster identity preserved',()=>{
 const js=read('DeLaRosaMasters/masters.js'),html=read('DeLaRosaMasters/index.html');
 assert.match(html,/id="saveDlrSession"/);assert.match(html,/id="startDlrSession"/);
 assert.match(js,/api\('\/sessions','POST'/);assert.match(js,/scores:Array\(7\)\.fill\(null\)/);
 assert.match(js,/saturdayPaid:false,sundayPaid:false/);assert.match(js,/_startNewSession=true/);
 assert.match(js,/state\._serverUpdatedAt=saved\.updatedAt/);
});
