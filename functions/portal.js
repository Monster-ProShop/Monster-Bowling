import { Pool } from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
pool.on('error', error => console.error('Idle database connection error:', error.message));
const authUrl = process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, '');
const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
const siteOrigin = 'https://brackets.prodrillos.com';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': siteOrigin,
      'vary': 'Origin', 'cache-control': 'no-store' }
  });
}
async function identity(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const { payload } = await jwtVerify(header.slice(7), jwks, {
    issuer: [authUrl, new URL(authUrl).origin]
  });
  if (payload.role !== 'authenticated' || !uuid.test(String(payload.sub))) return null;
  const result = await pool.query('select email,"emailVerified" from neon_auth."user" where id=$1', [payload.sub]);
  const record = result.rows[0];
  if (!record?.emailVerified) return null;
  return { id: payload.sub, email: record.email.toLowerCase(),
    admin: record.email.toLowerCase() === 'monsterproshop@outlook.com' };
}
async function bodyJson(request) {
  const raw = await request.text();
  if (raw.length > 2_000_000) throw new Error('Request is too large');
  return JSON.parse(raw);
}
async function handler(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== siteOrigin) return response({ error: 'Origin is not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204,
    headers: { 'access-control-allow-origin': siteOrigin,
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS', 'vary': 'Origin' } });
  const url = new URL(request.url), route = url.pathname.replace(/\/$/, '') || '/';
  if (route === '/health' && request.method === 'GET') return response({ ok: true });
  let actor = null;
  try { actor = await identity(request); }
  catch { return response({ error: 'Invalid or expired session' }, 401); }
  if (route === '/competitions' && request.method === 'GET') {
    const { rows } = await pool.query(actor?.admin
      ? 'select id,name,kind,status,created_at from public.bowling_competitions order by created_at desc'
      : "select id,name,kind,status,created_at from public.bowling_competitions where status='open' order by created_at desc");
    return response(rows);
  }
  if (!actor) return response({ error: 'Sign in and verify your email first' }, 401);
  if (route === '/competitions' && request.method === 'POST') {
    if (!actor.admin) return response({ error: 'Administrator only' }, 403);
    const body = await bodyJson(request);
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120 || !['league','tournament'].includes(body.kind))
      return response({ error: 'Invalid competition' }, 400);
    const { rows } = await pool.query('insert into public.bowling_competitions (name,kind) values ($1,$2) returning id',
      [body.name.trim(),body.kind]);
    return response(rows[0],201);
  }
  const id = url.searchParams.get('id');
  if (!uuid.test(String(id))) return response({ error: 'Invalid competition ID' }, 400);
  if (route === '/state' && request.method === 'GET') {
    if (!actor.admin) return response({ error: 'Administrator only' }, 403);
    const { rows } = await pool.query('select data from public.bowling_competition_state where competition_id=$1',[id]);
    return response(rows[0]?.data || null);
  }
  if (route === '/join' && request.method === 'POST') {
    const { rows } = await pool.query(`select 1 from public.bowling_competitions c
      join public.bowling_personal_results p on p.competition_id=c.id
      where c.id=$1 and c.status='open' and p.email=$2`,[id,actor.email]);
    if (!rows.length) return response({ error: 'Your email is not linked to a registered bowler in this competition yet.' }, 403);
    await pool.query('insert into public.bowling_memberships (competition_id,user_id) values ($1,$2) on conflict do nothing',
      [id,actor.id]);
    return response({ joined: true });
  }
  if (route === '/results' && request.method === 'GET') {
    if (!actor.admin) {
      const { rows } = await pool.query('select 1 from public.bowling_memberships where competition_id=$1 and user_id=$2',
        [id,actor.id]);
      if (!rows.length) return response({ error: 'Join this competition first' }, 403);
    }
    const [result,personal] = await Promise.all([
      pool.query('select data from public.bowling_results where competition_id=$1',[id]),
      pool.query('select data from public.bowling_personal_results where competition_id=$1 and email=$2',[id,actor.email])
    ]);
    return response({ results: result.rows[0]?.data || null, personal: personal.rows[0]?.data || null });
  }
  if (route === '/save' && request.method === 'POST') {
    if (!actor.admin) return response({ error: 'Administrator only' }, 403);
    const body = await bodyJson(request);
    if (!body.state || !Array.isArray(body.state.bowlers) || !body.results || !Array.isArray(body.personal))
      return response({ error: 'Invalid competition data' }, 400);
    const db = await pool.connect();
    try {
      await db.query('begin');
      const exists = await db.query('select 1 from public.bowling_competitions where id=$1',[id]);
      if (!exists.rows.length) { await db.query('rollback'); return response({ error: 'Competition not found' },404); }
      await db.query(`insert into public.bowling_competition_state (competition_id,data) values ($1,$2)
        on conflict (competition_id) do update set data=excluded.data,updated_at=now()`,[id,body.state]);
      await db.query(`insert into public.bowling_results (competition_id,data) values ($1,$2)
        on conflict (competition_id) do update set data=excluded.data,updated_at=now()`,[id,body.results]);
      await db.query('delete from public.bowling_personal_results where competition_id=$1',[id]);
      for (const item of body.personal) {
        if (typeof item.email !== 'string' || !item.email.trim() || !item.data) continue;
        await db.query('insert into public.bowling_personal_results (competition_id,email,data) values ($1,$2,$3)',
          [id,item.email.trim().toLowerCase(),item.data]);
      }
      await db.query('commit');
      return response({ saved: true });
    } catch (error) {
      await db.query('rollback');
      throw error;
    } finally { db.release(); }
  }
  return response({ error: 'Not found' }, 404);
}

export default { async fetch(request) {
  try { return await handler(request); }
  catch (error) { console.error(error); return response({ error: 'Server error' }, 500); }
} };
