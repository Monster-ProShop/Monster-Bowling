const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backend = fs.readFileSync(path.join(root, 'functions', 'portal.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'portal.js'), 'utf8');

test('dashboard membership removal is allowed through CORS and reaches its route', () => {
  assert.match(backend, /access-control-allow-methods': 'GET,POST,DELETE,OPTIONS'/);
  assert.match(backend, /route==='\/memberships'&&request\.method==='DELETE'/);
  assert.match(frontend, /api\('\/memberships','DELETE',\{competitionId:removeLeague\.dataset\.removeLeague\}\)/);
});
