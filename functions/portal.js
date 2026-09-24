import { Pool } from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import webpush from 'web-push';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
pool.on('error', error => console.error('Idle database connection error:', error.message));
const authUrl = process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, '');
const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
const siteOrigin = 'https://brackets.prodrillos.com';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:monsterproshop@outlook.com',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);

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
  const result = await pool.query(`select u.email,u."emailVerified",coalesce(r.role,'user') role
    from neon_auth."user" u left join public.bowling_user_roles r on r.user_id=u.id where u.id=$1`, [payload.sub]);
  const record = result.rows[0];
  if (!record?.emailVerified) return null;
  const email=record.email.toLowerCase(),role=email==='monsterproshop@outlook.com'?'superadmin':record.role;
  return { id: payload.sub, email, role, admin:role==='superadmin' };
}
async function canManage(actor,competitionId) {
  if(actor.role==='superadmin')return true;
  if(actor.role!=='manager')return false;
  const result=await pool.query('select 1 from public.bowling_manager_assignments where user_id=$1 and competition_id=$2',[actor.id,competitionId]);
  return !!result.rowCount;
}
async function bodyJson(request) {
  const raw = await request.text();
  if (raw.length > 2_000_000) throw new Error('Request is too large');
  return JSON.parse(raw);
}
function personalForBowler(state,results,bowlerId) {
  const bowler=(state?.bowlers||[]).find(b=>b.id===bowlerId);if(!bowler)return null;
  const config=state.config||{},toCents=value=>Math.round(Number(value||0)*100);
  const count=type=>(state.brackets?.[type]||[]).reduce((n,ids)=>n+ids.filter(id=>id===bowlerId).length,0);
  const hdcp=count('hdcp'),scratch=count('scratch'),pairs=(state.pairs||[]).filter(ids=>ids.includes(bowlerId)).length;
  const charges=[
    ...(hdcp?[{category:'hdcp',label:`${hdcp} handicap bracket${hdcp===1?'':'s'} × $${Number(config.hdcpBuyin||0).toFixed(2)}`,amount:hdcp*toCents(config.hdcpBuyin)}]:[]),
    ...(scratch?[{category:'scratch',label:`${scratch} scratch bracket${scratch===1?'':'s'} × $${Number(config.scratchBuyin||0).toFixed(2)}`,amount:scratch*toCents(config.scratchBuyin)}]:[]),
    ...(bowler.high?[{category:'high',label:'Handicap High Game Pot',amount:toCents(config.highBuyin)}]:[]),
    ...(pairs?[{category:'pairs',label:`${pairs} Doubles team${pairs===1?'':'s'} × $${Number(config.pairsBuyin||0).toFixed(2)}`,amount:pairs*toCents(config.pairsBuyin)}]:[])
  ];
  const winnings=(results?.awards||[]).filter(a=>a.name===bowler.name);
  const due=charges.reduce((n,x)=>n+x.amount,0),won=winnings.reduce((n,x)=>n+Number(x.amount||0),0),paid=!!bowler.paid,outstanding=paid?0:due;
  return {id:bowler.id,name:bowler.name,paid,charges,due,outstanding,winnings,won,net:won-due,settlement:won-outstanding};
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
  if(route==='/me'&&request.method==='GET') {
    if(!actor)return response({error:'Sign in first'},401);
    return response({email:actor.email,role:actor.role});
  }
  if (route === '/competitions' && request.method === 'GET') {
    const { rows } = await pool.query(actor?.role==='superadmin'
      ? 'select id,name,kind,status,created_at,true can_manage from public.bowling_competitions order by created_at desc'
      : actor?.role==='manager'
        ? `select c.id,c.name,c.kind,c.status,c.created_at,(a.user_id is not null) can_manage from public.bowling_competitions c
           left join public.bowling_manager_assignments a on a.competition_id=c.id and a.user_id=$1
           where c.status='open' order by c.created_at desc`
        : "select id,name,kind,status,created_at,false can_manage from public.bowling_competitions where status='open' order by created_at desc",
      actor?.role==='manager'?[actor.id]:[]);
    return response(rows);
  }
  if (!actor) return response({ error: 'Sign in and verify your email first' }, 401);
  if(route==='/users'&&request.method==='GET') {
    if(actor.role!=='superadmin')return response({error:'SuperAdmin only'},403);
    const {rows}=await pool.query(`select u.id,lower(u.email) email,
      case when lower(u.email)='monsterproshop@outlook.com' then 'superadmin' else coalesce(r.role,'user') end role,
      coalesce(jsonb_agg(a.competition_id) filter(where a.competition_id is not null),'[]'::jsonb) competition_ids
      from neon_auth."user" u left join public.bowling_user_roles r on r.user_id=u.id
      left join public.bowling_manager_assignments a on a.user_id=u.id
      group by u.id,u.email,r.role order by lower(u.email)`);
    return response(rows);
  }
  if(route==='/users/role'&&request.method==='POST') {
    if(actor.role!=='superadmin')return response({error:'SuperAdmin only'},403);
    const body=await bodyJson(request);
    if(!uuid.test(String(body.userId))||!['user','manager'].includes(body.role))return response({error:'Invalid account type'},400);
    const target=await pool.query('select lower(email) email from neon_auth."user" where id=$1',[body.userId]);
    if(!target.rowCount)return response({error:'User not found'},404);
    if(target.rows[0].email==='monsterproshop@outlook.com')return response({error:'The SuperAdmin account cannot be changed'},400);
    await pool.query(`insert into public.bowling_user_roles(user_id,role) values($1,$2)
      on conflict(user_id) do update set role=excluded.role,updated_at=now()`,[body.userId,body.role]);
    if(body.role==='user')await pool.query('delete from public.bowling_manager_assignments where user_id=$1',[body.userId]);
    return response({saved:true});
  }
  if(route==='/users/assignments'&&request.method==='POST') {
    if(actor.role!=='superadmin')return response({error:'SuperAdmin only'},403);
    const body=await bodyJson(request),ids=Array.isArray(body.competitionIds)?body.competitionIds:[];
    if(!uuid.test(String(body.userId))||ids.some(id=>!uuid.test(String(id))))return response({error:'Invalid manager assignments'},400);
    const db=await pool.connect();try{await db.query('begin');await db.query('delete from public.bowling_manager_assignments where user_id=$1',[body.userId]);
      for(const competitionId of ids)await db.query('insert into public.bowling_manager_assignments(user_id,competition_id) values($1,$2)',[body.userId,competitionId]);
      await db.query('commit');return response({saved:true});}catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }
  if (route === '/competitions' && request.method === 'POST') {
    if (actor.role!=='superadmin') return response({ error: 'SuperAdmin only' }, 403);
    const body = await bodyJson(request);
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120 || !['league','tournament'].includes(body.kind))
      return response({ error: 'Invalid competition' }, 400);
    const { rows } = await pool.query('insert into public.bowling_competitions (name,kind) values ($1,$2) returning id',
      [body.name.trim(),body.kind]);
    return response(rows[0],201);
  }
  if (route === '/sessions' && request.method === 'GET') {
    const competitionId = url.searchParams.get('competition_id');
    if (!uuid.test(String(competitionId))) return response({ error: 'Invalid competition ID' }, 400);
    const { rows } = await pool.query(`select id,label,session_date,created_at from public.bowling_session_archives
      where competition_id=$1 order by session_date desc,created_at desc`,[competitionId]);
    return response(rows);
  }
  if (route === '/session' && request.method === 'GET') {
    const sessionId=url.searchParams.get('id');
    if (!uuid.test(String(sessionId))) return response({ error: 'Invalid session ID' }, 400);
    const { rows }=await pool.query(`select id,competition_id,label,session_date,state,results,personal
      from public.bowling_session_archives where id=$1`,[sessionId]);
    if(!rows.length) return response({error:'Session not found'},404);
    let bowlerId=(rows[0].state?.bowlers||[]).find(b=>String(b.email||'').toLowerCase()===actor.email)?.id;
    if(!bowlerId) {
      const selected=await pool.query(`select bowler_id from public.bowling_user_bowler_links
        where user_id=$1 and competition_id=$2 limit 1`,[actor.id,rows[0].competition_id]);
      bowlerId=selected.rows[0]?.bowler_id;
    }
    const personal=personalForBowler(rows[0].state,rows[0].results,bowlerId);
    return response({id:rows[0].id,competitionId:rows[0].competition_id,label:rows[0].label,
      date:rows[0].session_date,results:rows[0].results,personal});
  }
  if (route === '/sessions' && request.method === 'POST') {
    const body=await bodyJson(request);
    if(!uuid.test(String(body.competitionId))||typeof body.label!=='string'||!body.label.trim()||body.label.length>120||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.date)||!body.state||!body.results||!Array.isArray(body.personal))
      return response({error:'Invalid session data'},400);
    if(!await canManage(actor,body.competitionId))return response({error:'Manager access required'},403);
    const existing=await pool.query(`select id from public.bowling_session_archives
      where competition_id=$1 and lower(label)=lower($2) and session_date=$3 order by created_at desc limit 1`,
      [body.competitionId,body.label.trim(),body.date]);
    if(existing.rowCount) {
      const {rows}=await pool.query(`update public.bowling_session_archives set state=$2,results=$3,personal=$4
        where id=$1 returning id`,[existing.rows[0].id,body.state,body.results,JSON.stringify(body.personal)]);
      return response({...rows[0],updated:true});
    }
    const {rows}=await pool.query(`insert into public.bowling_session_archives
      (competition_id,label,session_date,state,results,personal) values ($1,$2,$3,$4,$5,$6) returning id`,
      [body.competitionId,body.label.trim(),body.date,body.state,body.results,JSON.stringify(body.personal)]);
    return response(rows[0],201);
  }
  if (route === '/balance' && request.method === 'POST') {
    const body=await bodyJson(request);
    if(!uuid.test(String(body.competitionId))||typeof body.bowlerId!=='string'||!body.bowlerId)
      return response({error:'Invalid bowler selection'},400);
    await pool.query(`insert into public.bowling_user_bowler_links(user_id,competition_id,bowler_id) values($1,$2,$3)
      on conflict(user_id,competition_id) do update set bowler_id=excluded.bowler_id,updated_at=now()`,[actor.id,body.competitionId,body.bowlerId]);
    let personal=null;
    if(uuid.test(String(body.sessionId))) {
      const archive=await pool.query('select state,results from public.bowling_session_archives where id=$1 and competition_id=$2',[body.sessionId,body.competitionId]);
      personal=personalForBowler(archive.rows[0]?.state,archive.rows[0]?.results,body.bowlerId);
    } else {
      const [state,results]=await Promise.all([
        pool.query('select data from public.bowling_competition_state where competition_id=$1',[body.competitionId]),
        pool.query('select data from public.bowling_results where competition_id=$1',[body.competitionId])]);
      personal=personalForBowler(state.rows[0]?.data,results.rows[0]?.data,body.bowlerId);
    }
    if(!personal)return response({error:'Bowler balance is not available'},404);
    return response({personal});
  }
  if (route === '/notifications' && request.method === 'POST') {
    const body=await bodyJson(request);
    if(!uuid.test(String(body.competitionId))||typeof body.bowlerId!=='string'||!body.bowlerId||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.eventDate)||!body.subscription?.endpoint)
      return response({error:'Invalid notification preference'},400);
    await pool.query(`insert into public.bowling_notification_subscriptions
      (endpoint,user_id,competition_id,bowler_id,event_date,subscription) values ($1,$2,$3,$4,$5,$6)
      on conflict(endpoint) do update set user_id=excluded.user_id,competition_id=excluded.competition_id,
      bowler_id=excluded.bowler_id,event_date=excluded.event_date,subscription=excluded.subscription,updated_at=now()`,
      [body.subscription.endpoint,actor.id,body.competitionId,body.bowlerId,body.eventDate,body.subscription]);
    await pool.query(`insert into public.bowling_user_bowler_links(user_id,competition_id,bowler_id) values($1,$2,$3)
      on conflict(user_id,competition_id) do update set bowler_id=excluded.bowler_id,updated_at=now()`,[actor.id,body.competitionId,body.bowlerId]);
    let personal=null;
    if(uuid.test(String(body.sessionId))) {
      const archive=await pool.query('select state,results,personal from public.bowling_session_archives where id=$1 and competition_id=$2',[body.sessionId,body.competitionId]);
      personal=personalForBowler(archive.rows[0]?.state,archive.rows[0]?.results,body.bowlerId);
    } else {
      const state=await pool.query('select data from public.bowling_competition_state where competition_id=$1',[body.competitionId]);
      const bowler=(state.rows[0]?.data?.bowlers||[]).find(b=>b.id===body.bowlerId);
      if(bowler?.email) personal=(await pool.query('select data from public.bowling_personal_results where competition_id=$1 and email=lower($2)',[body.competitionId,bowler.email])).rows[0]?.data||null;
      personal=personal||personalForBowler(state.rows[0]?.data,(await pool.query('select data from public.bowling_results where competition_id=$1',[body.competitionId])).rows[0]?.data,body.bowlerId);
    }
    return response({subscribed:true,personal});
  }
  const id = url.searchParams.get('id');
  if (!uuid.test(String(id))) return response({ error: 'Invalid competition ID' }, 400);
  if (route === '/state' && request.method === 'GET') {
    if (!await canManage(actor,id)) return response({ error: 'Manager access required' }, 403);
    const { rows } = await pool.query('select data from public.bowling_competition_state where competition_id=$1',[id]);
    return response(rows[0]?.data || null);
  }
  if (route === '/config' && request.method === 'POST') {
    if (!await canManage(actor,id)) return response({ error: 'Manager access required' }, 403);
    const body=await bodyJson(request);
    if(!body.config||typeof body.config!=='object'||Array.isArray(body.config))
      return response({error:'Invalid payout configuration'},400);
    const {rowCount}=await pool.query(`update public.bowling_competition_state
      set data=jsonb_set(data,'{config}',$2::jsonb,true),updated_at=now() where competition_id=$1`,[id,body.config]);
    if(!rowCount) return response({error:'Competition state not found'},404);
    return response({saved:true});
  }
  if (route === '/payment' && request.method === 'POST') {
    if (!await canManage(actor,id)) return response({ error: 'Manager access required' }, 403);
    const body=await bodyJson(request);
    if(typeof body.bowlerId!=='string'||!body.bowlerId||typeof body.paid!=='boolean')
      return response({error:'Invalid payment status'},400);
    const db=await pool.connect();
    try {
      await db.query('begin');
      const updated=await db.query(`update public.bowling_competition_state set data=jsonb_set(data,'{bowlers}',
        (select jsonb_agg(case when item->>'id'=$2 then jsonb_set(item,'{paid}',to_jsonb($3::boolean),true) else item end order by ordinality)
         from jsonb_array_elements(data->'bowlers') with ordinality as entries(item,ordinality)),true),updated_at=now()
        where competition_id=$1 returning data`,[id,body.bowlerId,body.paid]);
      if(!updated.rowCount){await db.query('rollback');return response({error:'Competition state not found'},404);}
      const bowler=(updated.rows[0].data.bowlers||[]).find(item=>item.id===body.bowlerId);
      if(bowler?.email) await db.query(`update public.bowling_personal_results set data=data||jsonb_build_object(
        'paid',$3::boolean,'outstanding',case when $3 then 0 else coalesce((data->>'due')::numeric,0) end,
        'settlement',coalesce((data->>'won')::numeric,0)-case when $3 then 0 else coalesce((data->>'due')::numeric,0) end)
        where competition_id=$1 and email=lower($2)`,[id,bowler.email,body.paid]);
      await db.query('commit');return response({saved:true});
    } catch(error){await db.query('rollback');throw error;} finally{db.release();}
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
    const [result,state] = await Promise.all([
      pool.query('select data from public.bowling_results where competition_id=$1',[id]),
      pool.query('select data from public.bowling_competition_state where competition_id=$1',[id])
    ]);
    let bowlerId=(state.rows[0]?.data?.bowlers||[]).find(b=>String(b.email||'').toLowerCase()===actor.email)?.id;
    if(!bowlerId) {
      const selected=await pool.query(`select bowler_id from public.bowling_user_bowler_links
        where user_id=$1 and competition_id=$2 limit 1`,[actor.id,id]);
      bowlerId=selected.rows[0]?.bowler_id;
    }
    const personalData=personalForBowler(state.rows[0]?.data,result.rows[0]?.data,bowlerId);
    return response({ results: result.rows[0]?.data || null, personal: personalData });
  }
  if (route === '/save' && request.method === 'POST') {
    if (!await canManage(actor,id)) return response({ error: 'Manager access required' }, 403);
    const body = await bodyJson(request);
    if (!body.state || !Array.isArray(body.state.bowlers) || !body.results || !Array.isArray(body.personal))
      return response({ error: 'Invalid competition data' }, 400);
    const db = await pool.connect(); let changed=[];
    try {
      await db.query('begin');
      const exists = await db.query('select 1 from public.bowling_competitions where id=$1',[id]);
      if (!exists.rows.length) { await db.query('rollback'); return response({ error: 'Competition not found' },404); }
      const previous=await db.query('select data from public.bowling_competition_state where competition_id=$1',[id]);
      const oldById=new Map((previous.rows[0]?.data?.bowlers||[]).map(b=>[b.id,JSON.stringify(b.scores)]));
      changed=body.state.bowlers.filter(b=>oldById.has(b.id)&&oldById.get(b.id)!==JSON.stringify(b.scores));
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
      if(changed.length&&/^\d{4}-\d{2}-\d{2}$/.test(body.eventDate||'')) {
        const ids=changed.map(b=>b.id), names=Object.fromEntries(changed.map(b=>[b.id,b.name]));
        const subscriptions=await pool.query(`select endpoint,subscription,bowler_id from public.bowling_notification_subscriptions
          where competition_id=$1 and event_date=$2 and bowler_id=any($3::text[])`,[id,body.eventDate,ids]);
        await Promise.allSettled(subscriptions.rows.map(async sub=>{
          try { await webpush.sendNotification(sub.subscription,JSON.stringify({title:'Brackets score update',body:names[sub.bowler_id]+' has a new score update.',url:siteOrigin})); }
          catch(error){if(error.statusCode===404||error.statusCode===410)await pool.query('delete from public.bowling_notification_subscriptions where endpoint=$1',[sub.endpoint]);}
        }));
      }
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
