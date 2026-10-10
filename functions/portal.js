import { Pool } from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import webpush from 'web-push';
import { leagueRoute, syncLeagueBracketScores } from './league.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
pool.on('error', error => console.error('Idle database connection error:', error.message));
const authUrl = process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, '');
const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
const siteOrigin = 'https://brackets.prodrillos.com';
const allowedOrigins = new Set([siteOrigin, 'https://monster-proshop.github.io', 'https://tournaments.prodrillos.com']);
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
function competitionSummary(state={},results={}) {
  const config=state.config||{},bowlers=state.bowlers||[],brackets=state.brackets||{},awards=results.awards||[],dlr=state.format==='delarosa-masters-v1';
  const bracketCount=keys=>keys.reduce((n,key)=>n+(brackets[key]?.length||0),0);
  const entryCount=keys=>keys.reduce((n,key)=>n+(brackets[key]||[]).reduce((sum,ids)=>sum+ids.filter(Boolean).length,0),0);
  let handicapBrackets,scratchBrackets,highGameEntries,doublesTeams,totalIncome;
  if(dlr){
    const handicapKeys=['satEarly','satLate','sunday'],scratchKeys=['scratchEarly','scratchLate','scratchSunday'];
    handicapBrackets=bracketCount(handicapKeys);scratchBrackets=bracketCount(scratchKeys);
    highGameEntries=bowlers.reduce((n,b)=>n+(b.events?.satHigh?1:0)+(b.events?.sunHigh?1:0),0);
    doublesTeams=(state.teams||[]).length;
    totalIncome=Math.round(entryCount(handicapKeys)*Number(config.bracketBuyin||0)*100+entryCount(scratchKeys)*Number(config.scratchBracketBuyin||0)*100+bowlers.filter(b=>b.events?.satHigh).length*Number(config.satHighBuyin||0)*100+bowlers.filter(b=>b.events?.sunHigh).length*Number(config.sunHighBuyin||0)*100+doublesTeams*2*Number(config.doublesBuyin||0)*100);
  }else{
    handicapBrackets=brackets.hdcp?.length||0;scratchBrackets=brackets.scratch?.length||0;
    highGameEntries=bowlers.filter(b=>b.high).length;doublesTeams=(state.pairs||[]).length;
    totalIncome=Math.round(entryCount(['hdcp'])*Number(config.hdcpBuyin||0)*100+entryCount(['scratch'])*Number(config.scratchBuyin||0)*100+highGameEntries*Number(config.highBuyin||0)*100+doublesTeams*2*Number(config.pairsBuyin||0)*100);
  }
  const totalPayout=awards.reduce((n,a)=>n+Number(a.amount||0),0);
  return{handicapBrackets,scratchBrackets,highGameEntries,doublesTeams,totalIncome,totalPayout,totalProfit:totalIncome-totalPayout};
}
// Strip previously saved summaries too: hiding the tab does not protect API responses.
function resultsForViewer(results,state,canViewSummary=false) {
  if(!results)return null;
  const {summary,...visible}=results;
  return canViewSummary?{...visible,summary:competitionSummary(state,results)}:visible;
}
async function identity(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const bearer=header.slice(7),parts=bearer.split('.');
  let userId=null;
  if(parts.length===3){
    const { payload } = await jwtVerify(bearer, jwks, {issuer: [authUrl, new URL(authUrl).origin]});
    if (payload.role !== 'authenticated' || !uuid.test(String(payload.sub))) return null;
    userId=String(payload.sub);
  }else{
    const session=(await pool.query(`select "userId" from neon_auth.session where token=$1 and "expiresAt">now() limit 1`,[bearer])).rows[0];
    if(!session?.userId)return null;
    userId=String(session.userId);
  }
  const result = await pool.query(`select u.email,u."emailVerified",coalesce(r.role,'user') role
    from neon_auth."user" u left join public.bowling_user_roles r on r.user_id=u.id where u.id=$1`, [userId]);
  const record = result.rows[0];
  if (!record?.emailVerified) return null;
  const email=record.email.toLowerCase(),role=email==='monsterproshop@outlook.com'?'superadmin':record.role;
  return { id: userId, email, role, admin:role==='superadmin' };
}
async function canManage(actor,competitionId) {
  if(actor.role==='superadmin')return true;
  if(actor.role!=='manager')return false;
  const result=await pool.query('select 1 from public.bowling_manager_assignments where user_id=$1 and competition_id=$2',[actor.id,competitionId]);
  return !!result.rowCount;
}
async function canAccess(actor,competitionId){
  if(await canManage(actor,competitionId))return true;
  return !!(await pool.query('select 1 from public.bowling_memberships where user_id=$1 and competition_id=$2',[actor.id,competitionId])).rowCount;
}
const cleanText=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
const normalizedName=value=>cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase();
const locationLetters=value=>cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/gi,'').toUpperCase().slice(0,2).padEnd(2,'X');
async function nextPlayerId(db,competitionId,required=false){
  const competition=(await db.query('select country,region from public.bowling_competitions where id=$1 for update',[competitionId])).rows[0];
  if(!competition?.country||!competition?.region){if(required)throw new Error('Add the competition country and state / region before importing a roster');return null;}
  const prefix=locationLetters(competition.country)+locationLetters(competition.region);
  await db.query("select pg_advisory_xact_lock(hashtext('bowling-player-id:'||$1))",[prefix]);
  const last=Number((await db.query(`select coalesce(max((right(membership_number,7))::int),0) value from public.bowling_roster_profiles
    where left(membership_number,4)=$1 and membership_number ~ '^[A-Z]{4}[0-9]{7}$'`,[prefix])).rows[0]?.value||0);
  return prefix+String(last+1).padStart(7,'0');
}
async function syncPlayerIdForUser(db,userId,competitionId,profileId){
  const profiles=(await db.query(`select id,competition_id,membership_number,created_at from public.bowling_roster_profiles
    where claimed_user_id=$1 order by (id=$2) asc,(membership_number is null),created_at`,[userId,profileId])).rows;
  if(!profiles.length)return null;
  let playerId=profiles.find(p=>p.membership_number)?.membership_number||null;
  if(playerId){const collision=await db.query('select 1 from public.bowling_roster_profiles where membership_number=$1 and claimed_user_id is distinct from $2 limit 1',[playerId,userId]);if(collision.rowCount)playerId=null;}
  if(!playerId)playerId=await nextPlayerId(db,competitionId,false);
  if(playerId)await db.query('update public.bowling_roster_profiles set membership_number=$1,updated_at=now() where claimed_user_id=$2',[playerId,userId]);
  return playerId;
}
async function rosterRows(competitionId){return (await pool.query(`select id,competition_id,membership_number,name,email,handicap,active,claimed_user_id,updated_at
  from public.bowling_roster_profiles where competition_id=$1 order by active desc,lower(name)`,[competitionId])).rows;}
async function ensureRosterProfiles(db,competitionId,bowlers=[]){
  for(const b of bowlers){
    const name=cleanText(b.name),email=cleanText(b.email,254).toLowerCase()||null,membership=cleanText(b.membershipNumber||b.membership_number,80)||null;
    if(!name)continue;
    let match=null;
    if(membership)match=(await db.query('select id from public.bowling_roster_profiles where competition_id=$1 and membership_number=$2',[competitionId,membership])).rows[0];
    if(!match&&email)match=(await db.query('select id from public.bowling_roster_profiles where competition_id=$1 and lower(email)=$2',[competitionId,email])).rows[0];
    if(!match)match=(await db.query('select id from public.bowling_roster_profiles where competition_id=$1 and lower(name)=$2',[competitionId,normalizedName(name)])).rows[0];
    if(match){const assigned=membership||(await db.query('select membership_number from public.bowling_roster_profiles where id=$1',[match.id])).rows[0]?.membership_number||await nextPlayerId(db,competitionId);await db.query(`update public.bowling_roster_profiles set membership_number=$3,name=$4,email=coalesce($5,email),handicap=$6,active=true,updated_at=now() where competition_id=$1 and id=$2`,[competitionId,match.id,assigned,name,email,Number(b.handicap||0)]);}
    else await db.query(`insert into public.bowling_roster_profiles(competition_id,membership_number,name,email,handicap) values($1,$2,$3,$4,$5)`,[competitionId,membership||await nextPlayerId(db,competitionId),name,email,Number(b.handicap||0)]);
  }
}
async function resolveBowlerId(actor,competitionId,state){
  const bowlers=state?.bowlers||[];
  let id=null;
  const profile=(await pool.query(`select * from public.bowling_roster_profiles where competition_id=$1 and
    (claimed_user_id=$2 or (claimed_user_id is null and lower(email)=$3)) order by claimed_user_id nulls last limit 1`,[competitionId,actor.id,actor.email])).rows[0];
  if(profile){const db=await pool.connect();try{await db.query('begin');if(!profile.claimed_user_id)await db.query('update public.bowling_roster_profiles set claimed_user_id=$1,updated_at=now() where id=$2 and claimed_user_id is null',[actor.id,profile.id]);await syncPlayerIdForUser(db,actor.id,competitionId,profile.id);await db.query('commit');}catch(error){await db.query('rollback');throw error;}finally{db.release();}}
  if(profile)id=bowlers.find(b=>b.id===profile.id||normalizedName(b.name)===normalizedName(profile.name))?.id;
  if(!id)id=bowlers.find(b=>String(b.email||'').toLowerCase()===actor.email)?.id;
  if(!id)id=(await pool.query('select bowler_id from public.bowling_user_bowler_links where user_id=$1 and competition_id=$2 limit 1',[actor.id,competitionId])).rows[0]?.bowler_id;
  if(id)await pool.query(`insert into public.bowling_user_bowler_links(user_id,competition_id,bowler_id) values($1,$2,$3)
    on conflict(user_id,competition_id) do update set bowler_id=excluded.bowler_id,updated_at=now()`,[actor.id,competitionId,id]);
  return id;
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
function normalizePlayerName(value='') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function findProfileBowler(state={},profile={}) {
  const bowlers=state.bowlers||[],membership=String(profile.membership_number||'').trim().toLowerCase();
  return bowlers.find(b=>b.id===profile.id)
    ||(membership&&bowlers.find(b=>String(b.membershipNumber||b.membership_number||'').trim().toLowerCase()===membership))
    ||bowlers.find(b=>normalizePlayerName(b.name)===normalizePlayerName(profile.name));
}
function bowlerScoreTotals(bowler) {
  if(!bowler)return {games:0,pinfall:0,byGame:[]};
  const source=bowler.scores||{},values=Array.isArray(source)?source:Array.from({length:7},(_,index)=>source['g'+(index+1)]);
  const byGame=values.map(value=>value!==null&&value!==''&&Number.isFinite(Number(value))?Number(value):null);
  const scores=byGame.filter(value=>value!==null);
  return {games:scores.length,pinfall:scores.reduce((sum,value)=>sum+value,0),byGame};
}
function addGameScores(target,values=[]) {
  values.forEach((value,index)=>{if(value===null||value===undefined)return;target[index]??={pinfall:0,games:0};target[index].pinfall+=value;target[index].games++;});
}
function gameAverages(totals=[]) {
  return totals.map((item,index)=>item?.games?{game:index+1,games:item.games,average:Number((item.pinfall/item.games).toFixed(2))}:null).filter(Boolean);
}
function personalAmounts(personal) {
  return {invested:Math.round(Number(personal?.due||0)),won:Math.round(Number(personal?.won||0))};
}
function traditionalBracketAwards(state={}) {
  if(state.format==='delarosa-masters-v1')return null;
  const bowlers=state.bowlers||[],byId=new Map(bowlers.map(b=>[b.id,b])),awards=[];
  const has=(b,g)=>b&&b.scores?.['g'+g]!==null&&b.scores?.['g'+g]!==''&&Number.isFinite(Number(b.scores?.['g'+g]));
  const game=(b,g,hdcp)=>Number(b.scores['g'+g])+(hdcp?Number(b.handicap||0):0);
  const advance=(players,g,hdcp)=>{const active=players.filter(Boolean);if(active.length<=1)return active;if(active.some(b=>!has(b,g)))return null;const top=Math.max(...active.map(b=>game(b,g,hdcp)));return active.filter(b=>game(b,g,hdcp)===top);};
  for(const type of ['hdcp','scratch'])for(const [index,ids] of (state.brackets?.[type]||[]).entries()){
    const players=ids.map(id=>byId.get(id)).filter(Boolean),hdcp=type==='hdcp';if(players.length!==8)continue;
    const first=[0,2,4,6].map(i=>advance(players.slice(i,i+2),1,hdcp));if(first.some(x=>!x))continue;
    const semis=[advance([...first[0],...first[1]],2,hdcp),advance([...first[2],...first[3]],2,hdcp)];if(semis.some(x=>!x))continue;
    const finalists=[...semis[0],...semis[1]];if(finalists.some(b=>!has(b,3)))continue;
    const metrics=b=>[game(b,3,hdcp),[1,2,3].reduce((n,g)=>n+game(b,g,true),0),Math.max(...[1,2,3].map(g=>game(b,g,true)))];
    const ranked=finalists.map(player=>({player,metrics:metrics(player)})).sort((a,b)=>b.metrics[0]-a.metrics[0]||b.metrics[1]-a.metrics[1]||b.metrics[2]-a.metrics[2]||a.player.name.localeCompare(b.player.name));
    const places=[Math.round(Number(state.config?.[type+'FirstAmount']||0)*100),Math.round(Number(state.config?.[type+'SecondAmount']||0)*100)];
    for(let i=0;i<ranked.length&&i<places.length;){let end=i+1;while(end<ranked.length&&ranked[end].metrics.every((v,j)=>v===ranked[i].metrics[j]))end++;const pool=places.slice(i,Math.min(end,places.length)).reduce((n,v)=>n+v,0),share=Math.floor(pool/(end-i)),remainder=pool%(end-i);for(let j=i;j<end;j++)awards.push({name:ranked[j].player.name,category:type,description:(hdcp?'HDCP':'Scratch')+' bracket #'+(index+1)+' · '+(i+1)+(end-i>1?' tie':'')+' ('+ranked[j].metrics[0]+')',amount:share+(j-i<remainder?1:0)});i=end;}
  }
  return awards;
}
function effectiveResults(state={},results={}) {
  const bracketAwards=traditionalBracketAwards(state);if(!bracketAwards)return results||{};
  const other=(results?.awards||[]).filter(a=>!['hdcp','scratch'].includes(a.category));
  return {...(results||{}),awards:[...bracketAwards,...other]};
}
async function handler(request) {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins.has(origin)) return response({ error: 'Origin is not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204,
    headers: { 'access-control-allow-origin': siteOrigin,
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'vary': 'Origin' } });
  const url = new URL(request.url), route = url.pathname.replace(/\/$/, '') || '/';
  if (route === '/health' && request.method === 'GET') return response({ ok: true });
  if(route==='/auth/sign-in'&&request.method==='POST'){
    const body=await bodyJson(request),email=cleanText(body.email,254).toLowerCase(),password=typeof body.password==='string'?body.password:'';
    if(!email||!password)return response({error:'Enter your email and password'},400);
    const authResponse=await fetch(authUrl+'/sign-in/email',{method:'POST',headers:{'content-type':'application/json','origin':origin||siteOrigin},body:JSON.stringify({email,password})});
    const data=await authResponse.json().catch(()=>({}));
    if(!authResponse.ok)return response({error:data?.message||data?.error?.message||'Invalid email or password'},authResponse.status===429?429:401);
    if(!data?.user?.id)return response({error:'Neon did not return a usable session'},502);
    const activeSession=(await pool.query(`select token from neon_auth.session where "userId"=$1 and "expiresAt">now() order by "createdAt" desc limit 1`,[data.user.id])).rows[0];
    const token=activeSession?.token||null;
    if(!token)return response({error:'Neon did not create an active session'},502);
    return response({user:data.user,token});
  }
  let actor = null;
  try { actor = await identity(request); }
  catch { return response({ error: 'Invalid or expired session' }, 401); }
  if (route.startsWith('/league/')) return leagueRoute({request,url,route,actor,pool,canManage,canAccess,bodyJson,response});
  if(route==='/me'&&request.method==='GET') {
    if(!actor)return response({error:'Sign in first'},401);
    return response({email:actor.email,role:actor.role});
  }
  if(route==='/account/setup'&&request.method==='POST'){
    if(!actor)return response({error:'Sign in first'},401);
    const body=await bodyJson(request),requested=body.accountType;
    if(!['user','manager'].includes(requested))return response({error:'Choose Bowler or Bracket Manager'},400);
    if(actor.role!=='superadmin')await pool.query(`insert into public.bowling_user_roles(user_id,role) values($1,$2)
      on conflict(user_id) do update set role=excluded.role,updated_at=now()`,[actor.id,requested]);
    return response({saved:true,role:actor.role==='superadmin'?'superadmin':requested});
  }
  if (route === '/competitions' && request.method === 'GET') {
    if(!actor)return response([]);
    const columns='c.id,c.name,c.kind,c.format,c.status,c.country,c.region,c.city,c.bowling_center,c.formatted_address,c.google_place_id,c.latitude,c.longitude,c.manager_name,c.manager_email,c.owner_user_id,c.created_at';
    const { rows } = await pool.query(actor?.role==='superadmin'
      ? `select ${columns},true can_manage from public.bowling_competitions c order by c.created_at desc`
      : actor?.role==='manager'
        ? `select ${columns},true can_manage from public.bowling_competitions c left join public.bowling_manager_assignments a on a.competition_id=c.id and a.user_id=$1
           where c.status='open' and (c.owner_user_id=$1 or a.user_id=$1) order by c.created_at desc`
        : `select ${columns},false can_manage from public.bowling_competitions c join public.bowling_memberships m on m.competition_id=c.id and m.user_id=$1
           where c.status='open' order by c.created_at desc`,actor.role==='superadmin'?[]:[actor.id]);
    return response(rows);
  }
  if (!actor) return response({ error: 'Sign in and verify your email first' }, 401);
  if(route==='/places/autocomplete'&&request.method==='GET'){
    if(!['manager','superadmin'].includes(actor.role))return response({error:'Manager access required'},403);
    const query=cleanText(url.searchParams.get('q'),120);if(query.length<3)return response([]);
    const key=process.env.GEOAPIFY_API_KEY;if(!key)return response({error:'Bowling center search is awaiting its Geoapify key.'},503);
    const endpoint='https://api.geoapify.com/v1/geocode/autocomplete?format=geojson&type=amenity&limit=6&lang=en&text='+encodeURIComponent(query)+'&apiKey='+encodeURIComponent(key);
    const found=await fetch(endpoint,{headers:{accept:'application/json'}});if(!found.ok)return response({error:'Location search is temporarily unavailable.'},502);
    const data=await found.json();return response((data.features||[]).map(feature=>{const p=feature.properties||{},coordinates=feature.geometry?.coordinates||[];return{name:p.name||p.address_line1||query,addressLine1:p.address_line1||'',formattedAddress:p.formatted||'',city:p.city||p.county||'',region:p.state||'',country:p.country||'',placeId:p.place_id||p.datasource?.raw?.osm_id||'',latitude:p.lat??coordinates[1]??null,longitude:p.lon??coordinates[0]??null};}));
  }
  if(route==='/career-summary'&&request.method==='GET'){
    const {rows:profiles}=await pool.query(`select distinct on (p.competition_id) p.id,p.competition_id,p.name,p.membership_number,c.name competition_name
      from public.bowling_roster_profiles p join public.bowling_competitions c on c.id=p.competition_id
      left join public.bowling_user_bowler_links l on l.competition_id=p.competition_id and l.bowler_id=p.id::text and l.user_id=$1
      where p.claimed_user_id=$1 or l.user_id=$1
      order by p.competition_id,(p.claimed_user_id=$1) desc,p.updated_at desc`,[actor.id]);
    const totals={totalGames:0,totalPinfall:0,moneyInvested:0,moneyWon:0,sessionsPlayed:0},totalGamesByPosition=[],byCompetition=[];
    for(const profile of profiles){
      const item={id:profile.competition_id,name:profile.competition_name,games:0,pinfall:0,moneyInvested:0,moneyWon:0,sessionsPlayed:0,highGameHandicap:0,highSeriesHandicap:0},itemGamesByPosition=[];
      const currentState=(await pool.query('select data from public.bowling_competition_state where competition_id=$1',[profile.competition_id])).rows[0]?.data||{};
      const currentResults=effectiveResults(currentState,(await pool.query('select data from public.bowling_results where competition_id=$1',[profile.competition_id])).rows[0]?.data||{});
      const currentBowler=findProfileBowler(currentState,profile);
      if(currentBowler){
        const score=bowlerScoreTotals(currentBowler),stored=(await pool.query('select data from public.bowling_personal_results where competition_id=$1 and email=lower($2)',[profile.competition_id,actor.email])).rows[0]?.data;
        const money=personalAmounts(currentState.format==='delarosa-masters-v1'?stored:personalForBowler(currentState,currentResults,currentBowler.id));
        item.games+=score.games;item.pinfall+=score.pinfall;addGameScores(itemGamesByPosition,score.byGame);item.moneyInvested+=money.invested;item.moneyWon+=money.won;
        if(score.games||money.invested||money.won)item.sessionsPlayed++;
      }
      const archives=(await pool.query('select state,results,personal from public.bowling_session_archives where competition_id=$1',[profile.competition_id])).rows;
      for(const archive of archives){
        const bowler=findProfileBowler(archive.state||{},profile);if(!bowler)continue;
        const score=bowlerScoreTotals(bowler),saved=Array.isArray(archive.personal)?archive.personal.find(entry=>String(entry.email||'').toLowerCase()===actor.email):null;
        const money=personalAmounts(archive.state?.format==='delarosa-masters-v1'?saved?.data:personalForBowler(archive.state,effectiveResults(archive.state,archive.results),bowler.id));
        item.games+=score.games;item.pinfall+=score.pinfall;addGameScores(itemGamesByPosition,score.byGame);item.moneyInvested+=money.invested;item.moneyWon+=money.won;
        if(score.games||money.invested||money.won)item.sessionsPlayed++;
      }
      const league=(await pool.query(`with games as (select session_id,scratch from public.bowling_league_games where competition_id=$1 and profile_id=$2),
        totals as (select count(*)::int games,coalesce(sum(scratch),0)::int pinfall,coalesce(max(scratch),0)::int high_game from games),
        series as (select coalesce(max(total),0)::int high_series,coalesce(max(game_count),0)::int series_games from (select sum(scratch) total,count(*) game_count from games group by session_id) s),
        rules as (select coalesce((configuration#>>'{handicap,global,percent}')::numeric,90) pct,coalesce((configuration#>>'{handicap,global,base}')::numeric,220) base,
          coalesce((configuration#>>'{handicap,global,minHandicap}')::numeric,(configuration#>>'{handicap,global,minAverage}')::numeric,0) min_hcp,
          coalesce((configuration#>>'{handicap,global,maxHandicap}')::numeric,(configuration#>>'{handicap,global,maxAverage}')::numeric,300) max_hcp from public.bowling_league_configurations where competition_id=$1)
        select t.*,s.*,greatest(coalesce(r.min_hcp,0),least(coalesce(r.max_hcp,300),floor((coalesce(r.base,220)-(case when t.games>0 then t.pinfall::numeric/t.games else 0 end))*coalesce(r.pct,90)/100)))::int handicap
        from totals t cross join series s left join rules r on true`,[profile.competition_id,profile.id])).rows[0];
      if(league?.games){item.games+=league.games;item.pinfall+=league.pinfall;item.sessionsPlayed+=(await pool.query('select count(distinct session_id)::int count from public.bowling_league_games where competition_id=$1 and profile_id=$2',[profile.competition_id,profile.id])).rows[0].count;item.highGameHandicap=league.high_game+league.handicap;item.highSeriesHandicap=league.high_series+league.handicap*league.series_games;}
      item.average=item.games?Number((item.pinfall/item.games).toFixed(2)):0;item.gameAverages=gameAverages(itemGamesByPosition);item.net=item.moneyWon-item.moneyInvested;
      totals.totalGames+=item.games;totals.totalPinfall+=item.pinfall;totals.moneyInvested+=item.moneyInvested;totals.moneyWon+=item.moneyWon;totals.sessionsPlayed+=item.sessionsPlayed;
      itemGamesByPosition.forEach((entry,index)=>{if(!entry)return;totalGamesByPosition[index]??={pinfall:0,games:0};totalGamesByPosition[index].pinfall+=entry.pinfall;totalGamesByPosition[index].games+=entry.games;});
      byCompetition.push(item);
    }
    return response({...totals,average:totals.totalGames?Number((totals.totalPinfall/totals.totalGames).toFixed(2)):0,gameAverages:gameAverages(totalGamesByPosition),net:totals.moneyWon-totals.moneyInvested,highGameHandicap:Math.max(0,...byCompetition.map(i=>i.highGameHandicap||0)),highSeriesHandicap:Math.max(0,...byCompetition.map(i=>i.highSeriesHandicap||0)),competitions:byCompetition.sort((a,b)=>a.name.localeCompare(b.name))});
  }
  if(route==='/directory'&&request.method==='GET'){
    const q='%'+cleanText(url.searchParams.get('q')||'',120).toLowerCase()+'%';
    const {rows}=await pool.query(`select id,name,kind,format,country,region,city,bowling_center from public.bowling_competitions
      where status='open' and (lower(name) like $1 or lower(coalesce(country,'')) like $1 or lower(coalesce(region,'')) like $1 or lower(coalesce(city,'')) like $1 or lower(coalesce(bowling_center,'')) like $1)
      order by lower(name) limit 100`,[q]);return response(rows);
  }
  if(route==='/memberships'&&request.method==='POST'){
    const body=await bodyJson(request);if(!uuid.test(String(body.competitionId)))return response({error:'Invalid competition'},400);
    await pool.query('insert into public.bowling_memberships(competition_id,user_id) values($1,$2) on conflict do nothing',[body.competitionId,actor.id]);return response({saved:true});
  }
  if(route==='/memberships'&&request.method==='DELETE'){
    const body=await bodyJson(request);if(!uuid.test(String(body.competitionId)))return response({error:'Invalid competition'},400);
    await pool.query('delete from public.bowling_memberships where competition_id=$1 and user_id=$2',[body.competitionId,actor.id]);return response({deleted:true});
  }
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
    if (!['manager','superadmin'].includes(actor.role)) return response({ error: 'Bracket Manager account required' }, 403);
    const body = await bodyJson(request);
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120 || !['league','tournament'].includes(body.kind)||!['traditional','delarosa'].includes(body.format||'traditional'))
      return response({ error: 'Invalid competition' }, 400);
    const { rows } = await pool.query(`insert into public.bowling_competitions
      (name,kind,format,owner_user_id,manager_email,manager_name,country,region,city,bowling_center,formatted_address,google_place_id,latitude,longitude) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [body.name.trim(),body.kind,body.format||'traditional',actor.id,actor.email,cleanText(body.managerName),cleanText(body.country),cleanText(body.region),cleanText(body.city),cleanText(body.bowlingCenter),cleanText(body.formattedAddress),cleanText(body.googlePlaceId),body.latitude!==''&&body.latitude!=null&&Number.isFinite(Number(body.latitude))?Number(body.latitude):null,body.longitude!==''&&body.longitude!=null&&Number.isFinite(Number(body.longitude))?Number(body.longitude):null]);
    await pool.query('insert into public.bowling_manager_assignments(user_id,competition_id) values($1,$2) on conflict do nothing',[actor.id,rows[0].id]);
    return response(rows[0],201);
  }
  if(route==='/competitions/edit'&&request.method==='POST'){
    const body=await bodyJson(request);if(!uuid.test(String(body.competitionId))||!await canManage(actor,body.competitionId))return response({error:'Manager access required'},403);
    await pool.query(`update public.bowling_competitions set name=$2,kind=$3,country=$4,region=$5,city=$6,bowling_center=$7,formatted_address=$8,google_place_id=$9,latitude=$10,longitude=$11,updated_at=now() where id=$1`,
      [body.competitionId,cleanText(body.name),body.kind==='tournament'?'tournament':'league',cleanText(body.country),cleanText(body.region),cleanText(body.city),cleanText(body.bowlingCenter),cleanText(body.formattedAddress),cleanText(body.googlePlaceId),body.latitude!==''&&body.latitude!=null&&Number.isFinite(Number(body.latitude))?Number(body.latitude):null,body.longitude!==''&&body.longitude!=null&&Number.isFinite(Number(body.longitude))?Number(body.longitude):null]);return response({saved:true});
  }
  if(route==='/competitions/delete'&&request.method==='POST') {
    const body=await bodyJson(request);
    if(!uuid.test(String(body.competitionId)))return response({error:'Invalid competition ID'},400);
    const own=actor.role==='superadmin'||(await pool.query('select 1 from public.bowling_competitions where id=$1 and owner_user_id=$2',[body.competitionId,actor.id])).rowCount;
    if(!own)return response({error:'Only the owner or SuperAdmin can delete this competition'},403);
    const {rows}=await pool.query('delete from public.bowling_competitions where id=$1 returning id,name',[body.competitionId]);
    if(!rows.length)return response({error:'Competition not found'},404);
    return response({deleted:true,competition:rows[0]});
  }
  if (route === '/sessions' && request.method === 'GET') {
    const competitionId = url.searchParams.get('competition_id');
    if (!uuid.test(String(competitionId))) return response({ error: 'Invalid competition ID' }, 400);
    if(!await canAccess(actor,competitionId))return response({error:'Competition access required'},403);
    await pool.query('select public.bowling_cleanup_old_bracket_details()');
    const all=url.searchParams.get('all')==='1';
    const { rows } = await pool.query(`select id,label,session_date,created_at,bracket_details_purged_at from public.bowling_session_archives
      where competition_id=$1 and ($2::boolean or extract(year from session_date)=extract(year from current_date)) order by session_date desc,created_at desc`,[competitionId,all]);
    return response(rows);
  }
  if(route==='/roster'&&request.method==='GET'){
    const competitionId=url.searchParams.get('competition_id');if(!uuid.test(String(competitionId)))return response({error:'Invalid competition'},400);
    if(!await canAccess(actor,competitionId))return response({error:'Competition access required'},403);
    const rows=await rosterRows(competitionId),manager=await canManage(actor,competitionId);
    return response(manager?rows:rows.map(({claimed_user_id,...profile})=>({...profile,claimed:!!claimed_user_id,claimed_by_me:claimed_user_id===actor.id})));
  }
  if(route==='/roster/claim'&&request.method==='POST'){
    const body=await bodyJson(request);if(!uuid.test(String(body.competitionId))||!uuid.test(String(body.profileId))||body.confirm!==true)return response({error:'Confirm the bowler profile selection'},400);
    const db=await pool.connect();try{await db.query('begin');const profile=(await db.query('select * from public.bowling_roster_profiles where id=$1 and competition_id=$2 for update',[body.profileId,body.competitionId])).rows[0];
    if(!profile){await db.query('rollback');return response({error:'Bowler profile not found'},404);}if(profile.claimed_user_id&&profile.claimed_user_id!==actor.id){await db.query('rollback');return response({error:'This bowler profile is already linked'},409);}
    const existingClaim=await db.query('select id,name from public.bowling_roster_profiles where competition_id=$1 and claimed_user_id=$2 and id<>$3',[body.competitionId,actor.id,body.profileId]);
    if(existingClaim.rowCount){await db.query('rollback');return response({error:'Your account is already permanently linked to '+existingClaim.rows[0].name+' for this league. Ask a Manager to reset it.'},409);}
    await db.query('update public.bowling_roster_profiles set claimed_user_id=$1,email=coalesce(email,$4),updated_at=now() where id=$2 and competition_id=$3',[actor.id,body.profileId,body.competitionId,actor.email]);
    const playerId=await syncPlayerIdForUser(db,actor.id,body.competitionId,body.profileId),currentState=(await db.query('select data from public.bowling_competition_state where competition_id=$1',[body.competitionId])).rows[0]?.data,bowler=(currentState?.bowlers||[]).find(b=>b.id===profile.id||(profile.email&&String(b.email||'').toLowerCase()===String(profile.email).toLowerCase())||normalizedName(b.name)===normalizedName(profile.name));
    if(bowler)await db.query(`insert into public.bowling_user_bowler_links(user_id,competition_id,bowler_id) values($1,$2,$3) on conflict(user_id,competition_id) do update set bowler_id=excluded.bowler_id,updated_at=now()`,[actor.id,body.competitionId,bowler.id]);
    await db.query('insert into public.bowling_memberships(competition_id,user_id) values($1,$2) on conflict do nothing',[body.competitionId,actor.id]);await db.query('commit');return response({linked:true,profile:{...profile,membership_number:playerId}});}catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }
  if(route==='/roster/reset-claim'&&request.method==='POST'){
    const body=await bodyJson(request);if(!uuid.test(String(body.competitionId))||!await canManage(actor,body.competitionId))return response({error:'Manager access required'},403);
    await pool.query('update public.bowling_roster_profiles set claimed_user_id=null,updated_at=now() where id=$1 and competition_id=$2',[body.profileId,body.competitionId]);return response({saved:true});
  }
  if(route==='/roster/links'&&request.method==='GET'){
    const competitionId=url.searchParams.get('competition_id');
    if(!uuid.test(String(competitionId))||!await canManage(actor,competitionId))return response({error:'Manager access required'},403);
    const [profiles,members]=await Promise.all([
      pool.query(`select p.id,p.membership_number,p.name,p.email roster_email,p.active,p.claimed_user_id,lower(u.email) linked_email
        from public.bowling_roster_profiles p left join neon_auth."user" u on u.id=p.claimed_user_id
        where p.competition_id=$1 order by p.active desc,lower(p.name)`,[competitionId]),
      pool.query(`select lower(u.email) email from public.bowling_memberships m join neon_auth."user" u on u.id=m.user_id
        where m.competition_id=$1 order by lower(u.email)`,[competitionId])
    ]);
    return response({profiles:profiles.rows,registeredEmails:members.rows.map(x=>x.email)});
  }
  if(route==='/roster/link-account'&&request.method==='POST'){
    const body=await bodyJson(request),competitionId=body.competitionId,profileId=body.profileId,email=cleanText(body.email,254).toLowerCase();
    if(!uuid.test(String(competitionId))||!uuid.test(String(profileId))||!await canManage(actor,competitionId))return response({error:'Manager access required'},403);
    const db=await pool.connect();try{
      await db.query('begin');
      const profile=(await db.query('select * from public.bowling_roster_profiles where id=$1 and competition_id=$2 for update',[profileId,competitionId])).rows[0];
      if(!profile){await db.query('rollback');return response({error:'Bowler profile not found'},404);}
      if(profile.claimed_user_id)await db.query('delete from public.bowling_user_bowler_links where user_id=$1 and competition_id=$2',[profile.claimed_user_id,competitionId]);
      if(!email){
        await db.query('update public.bowling_roster_profiles set claimed_user_id=null,email=null,updated_at=now() where id=$1',[profileId]);
        await db.query(`update public.bowling_competition_state set data=jsonb_set(data,'{bowlers}',
          (select jsonb_agg(case when item->>'id'=$2 or lower(trim(regexp_replace(item->>'name','\s+',' ','g')))=$3 then jsonb_set(item,'{email}',to_jsonb(''::text),true) else item end order by ordinality)
           from jsonb_array_elements(data->'bowlers') with ordinality entries(item,ordinality)),true),updated_at=now() where competition_id=$1`,[competitionId,profile.id,normalizedName(profile.name)]);
        await db.query('commit');return response({saved:true,unlinked:true});
      }
      const account=(await db.query('select id,lower(email) email from neon_auth."user" where lower(email)=$1',[email])).rows[0];
      if(!account){await db.query('rollback');return response({error:'No registered account uses that email'},404);}
      await db.query('update public.bowling_roster_profiles set claimed_user_id=null,email=null,updated_at=now() where competition_id=$1 and (claimed_user_id=$2 or lower(email)=$3) and id<>$4',[competitionId,account.id,account.email,profileId]);
      await db.query('delete from public.bowling_user_bowler_links where user_id=$1 and competition_id=$2',[account.id,competitionId]);
      await db.query('update public.bowling_roster_profiles set claimed_user_id=$1,email=$3,updated_at=now() where id=$2',[account.id,profileId,account.email]);
      const playerId=await syncPlayerIdForUser(db,account.id,competitionId,profileId);
      await db.query('insert into public.bowling_memberships(competition_id,user_id) values($1,$2) on conflict do nothing',[competitionId,account.id]);
      const current=(await db.query('select data from public.bowling_competition_state where competition_id=$1',[competitionId])).rows[0]?.data;
      const bowler=(current?.bowlers||[]).find(b=>b.id===profile.id||(profile.email&&String(b.email||'').toLowerCase()===String(profile.email).toLowerCase())||normalizedName(b.name)===normalizedName(profile.name));
      if(bowler){
        await db.query(`update public.bowling_competition_state set data=jsonb_set(data,'{bowlers}',
          (select jsonb_agg(case when item->>'id'=$2 then jsonb_set(item,'{email}',to_jsonb($3::text),true)
            when lower(coalesce(item->>'email',''))=$3 then jsonb_set(item,'{email}',to_jsonb(''::text),true) else item end order by ordinality)
           from jsonb_array_elements(data->'bowlers') with ordinality entries(item,ordinality)),true),updated_at=now() where competition_id=$1`,[competitionId,bowler.id,account.email]);
        await db.query(`insert into public.bowling_user_bowler_links(user_id,competition_id,bowler_id) values($1,$2,$3)
          on conflict(user_id,competition_id) do update set bowler_id=excluded.bowler_id,updated_at=now()`,[account.id,competitionId,bowler.id]);
      }
      await db.query('commit');return response({saved:true,linkedEmail:account.email,playerId});
    }catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }
  if(route==='/roster/import-preview'&&request.method==='POST'){
    const body=await bodyJson(request),competitionId=body.competitionId;if(!uuid.test(String(competitionId))||!await canManage(actor,competitionId))return response({error:'Manager access required'},403);
    const location=(await pool.query('select country,region from public.bowling_competitions where id=$1',[competitionId])).rows[0];if(!location?.country||!location?.region)return response({error:'Add the competition country and state / region in Edit details before importing a roster'},400);
    const existing=await rosterRows(competitionId),rows=Array.isArray(body.rows)?body.rows:[],seen=new Set(),preview=[];
    for(const raw of rows){const firstName=cleanText(raw.firstName,80),lastName=cleanText(raw.lastName,80),name=cleanText(`${firstName} ${lastName}`),key='n:'+normalizedName(name);if(!firstName||!lastName){preview.push({...raw,name,status:'invalid',reason:'Both Bowler First Name and Bowler Last Name are required'});continue;}if(seen.has(key)){preview.push({...raw,name,status:'invalid',reason:'Duplicate full name in the spreadsheet'});continue;}seen.add(key);const match=existing.find(p=>normalizedName(p.name)===normalizedName(name));const handicap=Math.max(0,Math.min(300,Number(raw.handicap||0))),clean={firstName,lastName,name,handicap,active:true};preview.push({...clean,status:match?(normalizedName(match.name)===normalizedName(name)&&Number(match.handicap)===handicap&&match.active?'unchanged':'updated'):'new',profileId:match?.id,membershipNumber:match?.membership_number||'',email:match?.email||''});}
    existing.filter(p=>p.active&&!preview.some(x=>x.profileId===p.id)).forEach(p=>preview.push({profileId:p.id,membershipNumber:p.membership_number,name:p.name,email:p.email,handicap:p.handicap,active:false,status:'deactivated'}));return response({preview});
  }
  if(route==='/roster/import'&&request.method==='POST'){
    const body=await bodyJson(request),competitionId=body.competitionId;if(!uuid.test(String(competitionId))||!await canManage(actor,competitionId)||!Array.isArray(body.rows)||body.rows.some(row=>row.status==='invalid'||(['new','updated'].includes(row.status)&&normalizedName(row.name).split(' ').length<2)))return response({error:'Every imported bowler must include a first and last name'},400);
    const db=await pool.connect();try{await db.query('begin');const before=await db.query('select to_jsonb(p) data from public.bowling_roster_profiles p where competition_id=$1',[competitionId]);const applied=body.rows.filter(x=>['new','updated','deactivated'].includes(x.status));for(const row of body.rows.filter(x=>['new','updated','unchanged','deactivated'].includes(x.status))){if(row.status==='deactivated')await db.query('update public.bowling_roster_profiles set active=false,updated_at=now() where id=$1 and competition_id=$2',[row.profileId,competitionId]);else if(row.profileId){const current=(await db.query('select membership_number from public.bowling_roster_profiles where id=$1 and competition_id=$2',[row.profileId,competitionId])).rows[0],playerId=current?.membership_number||await nextPlayerId(db,competitionId,true);await db.query(`update public.bowling_roster_profiles set membership_number=$3,name=$4,email=coalesce(nullif($5,''),email),handicap=$6,active=$7,updated_at=now() where id=$1 and competition_id=$2`,[row.profileId,competitionId,playerId,cleanText(row.name),cleanText(row.email,254).toLowerCase(),Number(row.handicap||0),row.active!==false]);}else await db.query(`insert into public.bowling_roster_profiles(competition_id,membership_number,name,email,handicap,active) values($1,$2,$3,nullif($4,''),$5,$6)`,[competitionId,await nextPlayerId(db,competitionId,true),cleanText(row.name),cleanText(row.email,254).toLowerCase(),Number(row.handicap||0),row.active!==false]);}const summary=applied.reduce((o,x)=>(o[x.status]=(o[x.status]||0)+1,o),{});const saved=await db.query(`insert into public.bowling_roster_imports(competition_id,imported_by,file_name,summary,before_snapshot) values($1,$2,$3,$4,$5) returning id`,[competitionId,actor.id,cleanText(body.fileName,240),summary,JSON.stringify(before.rows.map(x=>x.data))]);await db.query('commit');return response({saved:true,importId:saved.rows[0].id,summary});}catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }
  if(route==='/roster/imports'&&request.method==='GET'){
    const competitionId=url.searchParams.get('competition_id');if(!uuid.test(String(competitionId))||!await canManage(actor,competitionId))return response({error:'Manager access required'},403);return response((await pool.query('select id,file_name,summary,created_at,undone_at from public.bowling_roster_imports where competition_id=$1 order by created_at desc limit 25',[competitionId])).rows);
  }
  if(route==='/roster/import-undo'&&request.method==='POST'){
    const body=await bodyJson(request),competitionId=body.competitionId;if(!uuid.test(String(competitionId))||!await canManage(actor,competitionId))return response({error:'Manager access required'},403);const db=await pool.connect();try{await db.query('begin');const batch=(await db.query('select * from public.bowling_roster_imports where competition_id=$1 and undone_at is null order by created_at desc limit 1 for update',[competitionId])).rows[0];if(!batch){await db.query('rollback');return response({error:'No roster import to undo'},404);}await db.query('delete from public.bowling_roster_profiles where competition_id=$1',[competitionId]);for(const p of batch.before_snapshot)await db.query(`insert into public.bowling_roster_profiles(id,competition_id,membership_number,name,email,handicap,active,claimed_user_id,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[p.id,p.competition_id,p.membership_number,p.name,p.email,p.handicap,p.active,p.claimed_user_id,p.created_at,p.updated_at]);await db.query('update public.bowling_roster_imports set undone_at=now() where id=$1',[batch.id]);await db.query('commit');return response({undone:true});}catch(error){await db.query('rollback');throw error;}finally{db.release();}
  }
  if (route === '/session' && request.method === 'GET') {
    const sessionId=url.searchParams.get('id');
    if (!uuid.test(String(sessionId))) return response({ error: 'Invalid session ID' }, 400);
    const { rows }=await pool.query(`select id,competition_id,label,session_date,state,results,personal,bracket_details_purged_at
      from public.bowling_session_archives where id=$1`,[sessionId]);
    if(!rows.length) return response({error:'Session not found'},404);
    if(!await canAccess(actor,rows[0].competition_id))return response({error:'Competition access required'},403);
    let bowlerId=await resolveBowlerId(actor,rows[0].competition_id,rows[0].state);
    let personal=personalForBowler(rows[0].state,rows[0].results,bowlerId);
    if(rows[0].bracket_details_purged_at){const linked=(rows[0].state?.bowlers||[]).find(b=>b.id===bowlerId);personal=(Array.isArray(rows[0].personal)?rows[0].personal:[]).find(item=>String(item.email||'').toLowerCase()===String(linked?.email||'').toLowerCase())?.data||personal;}
    if(rows[0].state?.format==='delarosa-masters-v1') {
      const linkedBowler=(rows[0].state.bowlers||[]).find(b=>b.id===bowlerId);
      personal=(Array.isArray(rows[0].personal)?rows[0].personal:[]).find(item=>
        String(item.email||'').toLowerCase()===String(linkedBowler?.email||'').toLowerCase())?.data||null;
    }
    const results=resultsForViewer(rows[0].results||{},rows[0].state,await canManage(actor,rows[0].competition_id));
    return response({id:rows[0].id,competitionId:rows[0].competition_id,label:rows[0].label,
      date:rows[0].session_date,results,personal,bowlerId});
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
    if(!await canAccess(actor,body.competitionId))return response({error:'Competition access required'},403);
    await pool.query(`insert into public.bowling_user_bowler_links(user_id,competition_id,bowler_id) values($1,$2,$3)
      on conflict(user_id,competition_id) do update set bowler_id=excluded.bowler_id,updated_at=now()`,[actor.id,body.competitionId,body.bowlerId]);
    let personal=null;
    if(uuid.test(String(body.sessionId))) {
      const archive=await pool.query('select state,results,personal from public.bowling_session_archives where id=$1 and competition_id=$2',[body.sessionId,body.competitionId]);
      personal=personalForBowler(archive.rows[0]?.state,archive.rows[0]?.results,body.bowlerId);
      if(archive.rows[0]?.state?.format==='delarosa-masters-v1') {
        const linkedBowler=(archive.rows[0].state.bowlers||[]).find(b=>b.id===body.bowlerId);
        personal=(Array.isArray(archive.rows[0].personal)?archive.rows[0].personal:[]).find(item=>
          String(item.email||'').toLowerCase()===String(linkedBowler?.email||'').toLowerCase())?.data||null;
      }
    } else {
      const [state,results]=await Promise.all([
        pool.query('select data from public.bowling_competition_state where competition_id=$1',[body.competitionId]),
        pool.query('select data from public.bowling_results where competition_id=$1',[body.competitionId])]);
      personal=personalForBowler(state.rows[0]?.data,results.rows[0]?.data,body.bowlerId);
      if(state.rows[0]?.data?.format==='delarosa-masters-v1') {
        const linkedBowler=(state.rows[0].data.bowlers||[]).find(b=>b.id===body.bowlerId);
        personal=linkedBowler?.email?(await pool.query(
          'select data from public.bowling_personal_results where competition_id=$1 and email=lower($2)',
          [body.competitionId,linkedBowler.email])).rows[0]?.data||null:null;
      }
    }
    if(!personal&&((await pool.query('select data->>\'format\' format from public.bowling_competition_state where competition_id=$1',[body.competitionId])).rows[0]?.format==='delarosa-masters-v1'))
      return response({personal:null,bowlerId:body.bowlerId,linked:true});
    if(!personal)return response({error:'Bowler balance is not available'},404);
    return response({personal,bowlerId:body.bowlerId,linked:true});
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
    const { rows } = await pool.query('select data,updated_at from public.bowling_competition_state where competition_id=$1',[id]);
    return response(rows[0]?{...rows[0].data,_serverUpdatedAt:rows[0].updated_at.toISOString()}:null);
  }
  if (route === '/config' && request.method === 'POST') {
    if (!await canManage(actor,id)) return response({ error: 'Manager access required' }, 403);
    const body=await bodyJson(request);
    if(!body.config||typeof body.config!=='object'||Array.isArray(body.config))
      return response({error:'Invalid payout configuration'},400);
    await pool.query(`insert into public.bowling_competition_state(competition_id,data) values($1,jsonb_build_object('config',$2::jsonb))
      on conflict(competition_id) do update set data=jsonb_set(bowling_competition_state.data,'{config}',$2::jsonb,true),updated_at=now()`,[id,body.config]);
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
    if(!await canAccess(actor,id))return response({error:'Competition access required'},403);
    const [result,state] = await Promise.all([
      pool.query('select data from public.bowling_results where competition_id=$1',[id]),
      pool.query('select data from public.bowling_competition_state where competition_id=$1',[id])
    ]);
    let bowlerId=await resolveBowlerId(actor,id,state.rows[0]?.data);
    const resultData=effectiveResults(state.rows[0]?.data,result.rows[0]?.data||{});
    let personalData=personalForBowler(state.rows[0]?.data,resultData,bowlerId);
    if(state.rows[0]?.data?.format==='delarosa-masters-v1') {
      const linkedBowler=(state.rows[0].data.bowlers||[]).find(b=>b.id===bowlerId);
      personalData=linkedBowler?.email?(await pool.query(
        'select data from public.bowling_personal_results where competition_id=$1 and email=lower($2)',
        [id,linkedBowler.email])).rows[0]?.data||null:null;
    }
    return response({ results: resultsForViewer(resultData,state.rows[0]?.data,await canManage(actor,id)), personal: personalData, bowlerId });
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
      const previous=await db.query('select data,updated_at from public.bowling_competition_state where competition_id=$1 for update',[id]);
      const previousData=previous.rows[0]?.data||{},persistedById=new Map((previousData.bowlers||[]).map(b=>[b.id,b]));
      const clientRevision=body.state._serverUpdatedAt;
      const startingNewSession=body.state._startNewSession===true;
      if(clientRevision&&new Date(clientRevision).getTime()!==new Date(previous.rows[0].updated_at).getTime()){
        await db.query('rollback');return response({error:'This session changed in another tab or device. Reload before saving so newer brackets and scores are not overwritten.'},409);
      }
      const priorBracketCount=['hdcp','scratch'].reduce((n,key)=>n+(previousData.brackets?.[key]?.length||0),0);
      const nextBracketCount=['hdcp','scratch'].reduce((n,key)=>n+(body.state.brackets?.[key]?.length||0),0);
      if(!clientRevision&&previousData.generated&&priorBracketCount>0&&(!body.state.generated||nextBracketCount===0)){
        await db.query('rollback');return response({error:'Generated brackets are already saved in Neon. Reload before changing them.'},409);
      }
      delete body.state._serverUpdatedAt;
      delete body.state._startNewSession;
      if(previousData.saturdayLocked&&!startingNewSession){
        const incomingById=new Map((body.state.bowlers||[]).map(b=>[b.id,b]));
        const saturdayKeys=['satEarly','satLate','scratchEarly','scratchLate'];
        const saturdayConfig=['bracketBuyin','bracketFirst','bracketSecond','scratchBracketBuyin','scratchBracketFirst','scratchBracketSecond','satHighBuyin','satHighPayout'];
        const changedLockedData=body.state.saturdayLocked!==true||
          saturdayKeys.some(key=>JSON.stringify(previousData.brackets?.[key]||[])!==JSON.stringify(body.state.brackets?.[key]||[]))||
          saturdayConfig.some(key=>Number(previousData.config?.[key]||0)!==Number(body.state.config?.[key]||0))||
          (previousData.bowlers||[]).some(old=>{const next=incomingById.get(old.id);return !next||old.name!==next.name||Number(old.handicap||0)!==Number(next.handicap||0)||
            ['satEarly','satLate','scratchEarly','scratchLate','satHigh'].some(key=>JSON.stringify(old.events?.[key]||0)!==JSON.stringify(next.events?.[key]||0))||
            [0,1,2,3].some(index=>JSON.stringify(old.scores?.[index]??null)!==JSON.stringify(next.scores?.[index]??null));})||
          (body.state.bowlers||[]).some(next=>!persistedById.has(next.id)&&([0,1,2,3].some(index=>next.scores?.[index]!=null)||['satEarly','satLate','scratchEarly','scratchLate','satHigh'].some(key=>next.events?.[key])));
        if(changedLockedData){await db.query('rollback');return response({error:'Saturday scores and brackets are locked. Reload and add Sunday information only.'},409);}
      }
      const scoreEntries=scores=>Array.isArray(scores)
        ? scores.map((value,index)=>[String(index),value])
        : Object.entries(scores&&typeof scores==='object'?scores:{});
      const scoreValue=(scores,key)=>Array.isArray(scores)?scores[Number(key)]:scores?.[key];
      const clearsSavedScore=body.state.bowlers.some(b=>{
        const old=persistedById.get(b.id);
        return scoreEntries(old?.scores).some(([key,score])=>score!==null&&score!==''&&score!==undefined&&
          (scoreValue(b.scores,key)===null||scoreValue(b.scores,key)===''||scoreValue(b.scores,key)===undefined));
      });
      if(clearsSavedScore&&!startingNewSession){
        await db.query('rollback');
        return response({error:'Newer scores are already saved. Reload the tournament before making more changes.'},409);
      }
      const oldById=new Map((previous.rows[0]?.data?.bowlers||[]).map(b=>[b.id,JSON.stringify(b.scores)]));
      changed=body.state.bowlers.filter(b=>oldById.has(b.id)&&oldById.get(b.id)!==JSON.stringify(b.scores));
      const savedState=await db.query(`insert into public.bowling_competition_state (competition_id,data) values ($1,$2)
        on conflict (competition_id) do update set data=excluded.data,updated_at=now() returning updated_at`,[id,body.state]);
      await db.query(`insert into public.bowling_results (competition_id,data) values ($1,$2)
        on conflict (competition_id) do update set data=excluded.data,updated_at=now()`,[id,body.results]);
      await db.query('delete from public.bowling_personal_results where competition_id=$1',[id]);
      for (const item of body.personal) {
        if (typeof item.email !== 'string' || !item.email.trim() || !item.data) continue;
        await db.query('insert into public.bowling_personal_results (competition_id,email,data) values ($1,$2,$3)',
          [id,item.email.trim().toLowerCase(),item.data]);
      }
      await ensureRosterProfiles(db,id,body.state.bowlers);
      await syncLeagueBracketScores(db,id,body.state,actor.id,startingNewSession);
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
      return response({ saved: true,updatedAt:savedState.rows[0].updated_at.toISOString() });
    } catch (error) {
      await db.query('rollback');
      throw error;
    } finally { db.release(); }
  }
  return response({ error: 'Not found' }, 404);
}

export default { async fetch(request) {
  let result;
  try { result = await handler(request); }
  catch (error) { console.error(error); result = response({ error: error.status ? error.message : 'Server error' }, error.status || 500); }
  const origin=request.headers.get('origin');
  if(origin&&allowedOrigins.has(origin))result.headers.set('access-control-allow-origin',origin);
  return result;
} };

