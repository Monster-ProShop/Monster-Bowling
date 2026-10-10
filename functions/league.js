import { uuid, validateState, mappedBracketGames, validateLeagueConfiguration, generateLeagueSchedule } from './league-model.mjs';

const issue = (message, status=400) => Object.assign(new Error(message), {status});
const profilesFor = async (db, id) => (await db.query('select id,name,email,membership_number,handicap,active,claimed_user_id from public.bowling_roster_profiles where competition_id=$1 order by lower(name)', [id])).rows;
const enrolled = state => new Set((state.teams || []).flatMap(t => t.players.map(p => p.profileId)));
const checkRevision = (row, body) => { if (body.revision !== row.revision) throw issue('This session changed on another device. Refresh before saving.',409); };

export async function syncLeagueBracketScores(db, competitionId, state, actorId, startingNewSession=false) {
  const session = (await db.query('select * from public.bowling_league_sessions where competition_id=$1 and brackets_linked for update',[competitionId])).rows[0];
  if (!session) return null;
  if (startingNewSession) {
    await db.query('update public.bowling_league_sessions set brackets_linked=false,revision=revision+1,updated_at=now() where id=$1',[session.id]);
    return {unlinked:true};
  }
  const mapping = mappedBracketGames(state,await profilesFor(db,competitionId),enrolled(session.state),Number(session.state.config.totalGames));
  for (const game of mapping.games) {
    const old = (await db.query('select scratch,source from public.bowling_league_games where session_id=$1 and profile_id=$2 and game_number=$3',[session.id,game.profileId,game.gameNumber])).rows[0];
    if (old?.source === 'league' && old.scratch !== game.scratch) throw issue('A league score conflicts with a bracket score. Correct the score before linking.',409);
    await db.query(`insert into public.bowling_league_games(competition_id,session_id,profile_id,game_number,scratch,source,updated_by)
      values($1,$2,$3,$4,$5,'brackets',$6) on conflict(session_id,profile_id,game_number)
      do update set scratch=excluded.scratch,source='brackets',updated_by=excluded.updated_by,updated_at=now()`,[competitionId,session.id,game.profileId,game.gameNumber,game.scratch,actorId]);
  }
  await db.query('update public.bowling_league_sessions set revision=revision+1,updated_at=now() where id=$1',[session.id]);
  return mapping;
}

export async function leagueRoute({request,url,route,actor,pool,canManage,canAccess,bodyJson,response}) {
  if (!actor) return response({error:'Sign in and verify your email first'},401);
  try {
    const body = request.method === 'GET' ? {} : await bodyJson(request);
    const id = url.searchParams.get('competition_id') || body.competitionId;
    if (!uuid.test(String(id))) throw issue('Choose a valid competition');
    if (!await canAccess(actor,id)) throw issue('Competition access required',403);
    const manager = await canManage(actor,id);
    if (request.method !== 'GET' && route !== '/league/claim' && !manager) throw issue('Manager access required',403);
    if (route === '/league/roster' && request.method === 'GET') {
      const profiles = await profilesFor(pool,id);
      return response(profiles.map(p => ({id:p.id,name:p.name,membership_number:p.membership_number,handicap:p.handicap,active:p.active,
        linkedToMe:p.claimed_user_id===actor.id,eligible:p.claimed_user_id===actor.id || (!p.claimed_user_id && p.email?.toLowerCase()===actor.email),...(manager?{email:p.email}:{})})));
    }
    if (route === '/league/roster' && request.method === 'POST') {
      const name = String(body.name||'').trim(), email=String(body.email||'').trim().toLowerCase();
      if (!name || name.length>120 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw issue('Enter a name and a valid login email');
      const row = (await pool.query('insert into public.bowling_roster_profiles(competition_id,name,email) values($1,$2,$3) returning id',[id,name,email||null])).rows[0];
      return response(row,201);
    }
    if (route === '/league/configuration' && request.method === 'GET') {
      const row=(await pool.query('select configuration,revision,updated_at from public.bowling_league_configurations where competition_id=$1',[id])).rows[0];
      return response(row||{configuration:null,revision:0});
    }
    if (route === '/league/configuration' && request.method === 'POST') {
      const configuration=validateLeagueConfiguration(body.configuration,await profilesFor(pool,id));
      const row=(await pool.query(`insert into public.bowling_league_configurations(competition_id,configuration,updated_by) values($1,$2,$3)
        on conflict(competition_id) do update set configuration=excluded.configuration,updated_by=excluded.updated_by,updated_at=now(),revision=bowling_league_configurations.revision+1
        returning configuration,revision,updated_at`,[id,configuration,actor.id])).rows[0];
      return response(row);
    }
    if (route === '/league/generate-schedule' && request.method === 'POST') {
      const db=await pool.connect();
      try{
        await db.query('begin');
        const saved=(await db.query('select configuration from public.bowling_league_configurations where competition_id=$1 for update',[id])).rows[0];
        if(!saved)throw issue('Save the league configuration first');
        const games=await db.query('select 1 from public.bowling_league_games where competition_id=$1 limit 1',[id]);
        if(games.rowCount)throw issue('The schedule cannot be regenerated after scores have been entered',409);
        const schedule=generateLeagueSchedule(saved.configuration);
        await db.query('delete from public.bowling_league_sessions where competition_id=$1',[id]);
        for(const week of schedule){
          const state={config:{totalGames:saved.configuration.gamesPerBowler},teams:[],matches:week.matches};
          await db.query(`insert into public.bowling_league_sessions(competition_id,label,session_date,state,week_number,position_round,created_by)
            values($1,$2,$3,$4,$5,$6,$7)`,[id,week.label,week.date,state,week.number,week.positionRound,actor.id]);
        }
        await db.query('commit');return response({generated:schedule.length,schedule},201);
      }catch(error){await db.query('rollback');throw error;}finally{db.release();}
    }
    if (route === '/league/claim' && request.method === 'POST') {
      if (!uuid.test(String(body.profileId)) || body.confirm!==true) throw issue('Confirm your bowler selection');
      const rows = await pool.query(`update public.bowling_roster_profiles set claimed_user_id=$1,updated_at=now()
        where competition_id=$2 and id=$3 and (claimed_user_id=$1 or (claimed_user_id is null and lower(email)=$4)) returning id`,[actor.id,id,body.profileId,actor.email]);
      if (!rows.rowCount) throw issue('The bowler email must match your verified login. Ask your manager to correct the roster.',403);
      return response({linked:true});
    }
    if (route === '/league/sessions' && request.method === 'GET') return response((await pool.query('select id,label,session_date,week_number,position_round,revision,brackets_linked from public.bowling_league_sessions where competition_id=$1 order by session_date,week_number',[id])).rows);
    if (route === '/league/sessions' && request.method === 'POST') {
      const label=String(body.label||'').trim();
      if (!label || label.length>120 || !/^\d{4}-\d{2}-\d{2}$/.test(body.date||'') || Number.isNaN(Date.parse(body.date))) throw issue('Enter a session name and date');
      const location=(await pool.query('select country,region,city,bowling_center from public.bowling_competitions where id=$1',[id])).rows[0];
      if (!location || Object.values(location).some(v=>!String(v||'').trim())) throw issue('Set country, state / region, city and bowling center first');
      return response((await pool.query('insert into public.bowling_league_sessions(competition_id,label,session_date,created_by) values($1,$2,$3,$4) returning id',[id,label,body.date,actor.id])).rows[0],201);
    }
    if (route === '/league/summary' && request.method === 'GET') {
      return response((await pool.query(`with rules as (
          select coalesce((configuration#>>'{handicap,global,percent}')::numeric,90) pct,coalesce((configuration#>>'{handicap,global,base}')::numeric,220) base,
            coalesce((configuration#>>'{handicap,global,minHandicap}')::numeric,(configuration#>>'{handicap,global,minAverage}')::numeric,0) min_hcp,
            coalesce((configuration#>>'{handicap,global,maxHandicap}')::numeric,(configuration#>>'{handicap,global,maxAverage}')::numeric,300) max_hcp
          from public.bowling_league_configurations where competition_id=$1
        ), per_session as (
          select profile_id,session_id,sum(scratch)::int series,count(*)::int series_games from public.bowling_league_games where competition_id=$1 group by profile_id,session_id
        ), totals as (
          select p.id,p.name,count(*)::int games,sum(g.scratch)::int pinfall,round(avg(g.scratch),2) average,max(g.scratch)::int high_game,max(ps.series)::int high_series,max(ps.series_games)::int series_games
          from public.bowling_league_games g join public.bowling_roster_profiles p on p.id=g.profile_id join per_session ps on ps.profile_id=g.profile_id and ps.session_id=g.session_id
          where g.competition_id=$1 group by p.id,p.name
        ) select t.*,greatest(coalesce(r.min_hcp,0),least(coalesce(r.max_hcp,300),floor((coalesce(r.base,220)-t.average)*coalesce(r.pct,90)/100)))::int handicap,
          (t.high_game+greatest(coalesce(r.min_hcp,0),least(coalesce(r.max_hcp,300),floor((coalesce(r.base,220)-t.average)*coalesce(r.pct,90)/100))))::int high_game_handicap,
          (t.high_series+greatest(coalesce(r.min_hcp,0),least(coalesce(r.max_hcp,300),floor((coalesce(r.base,220)-t.average)*coalesce(r.pct,90)/100)))*t.series_games)::int high_series_handicap
        from totals t left join rules r on true order by t.average desc,t.pinfall desc,t.name`,[id])).rows);
    }
    const sessionId=url.searchParams.get('session_id')||body.sessionId;
    if (!uuid.test(String(sessionId))) throw issue('Choose a session');
    if (route === '/league/session' && request.method === 'GET') {
      const row=(await pool.query('select id,competition_id,label,session_date,week_number,position_round,state,revision,brackets_linked from public.bowling_league_sessions where id=$1 and competition_id=$2',[sessionId,id])).rows[0];
      if (!row) throw issue('Session not found',404);
      const games=(await pool.query('select profile_id,game_number,scratch,source from public.bowling_league_games where session_id=$1',[sessionId])).rows;
      return response({...row,canManage:manager,games});
    }
    const db=await pool.connect();
    try {
      await db.query('begin');
      // Match the lock order of the brackets save route to avoid deadlocks.
      const bracket=route==='/league/link-brackets' ? (await db.query('select data from public.bowling_competition_state where competition_id=$1 for update',[id])).rows[0] : null;
      const row=(await db.query('select * from public.bowling_league_sessions where id=$1 and competition_id=$2 for update',[sessionId,id])).rows[0];
      if (!row) throw issue('Session not found',404);
      checkRevision(row,body);
      let result={saved:true};
      if (route==='/league/session' && request.method==='POST') {
        const profiles=await profilesFor(db,id);
        validateState(body.state,profiles);
        // Store only tournament fields; never duplicate roster emails or account data.
        const state={config:body.state.config,teams:body.state.teams.map(t=>({id:t.id,name:t.name,division:t.division||'',players:t.players.map(p=>({profileId:p.profileId,name:profiles.find(x=>x.id===p.profileId).name,division:p.division||'',avg:p.avg||''}))})),matches:body.state.matches};
        state.matches=state.matches.map(m=>({id:m.id,round:m.round,teamA:state.teams.find(t=>t.id===m.teamA.id),teamB:state.teams.find(t=>t.id===m.teamB.id)}));
        if(state.matches.some(m=>!m.teamA||!m.teamB))throw issue('Invalid match teams');
        const saved=(await db.query('select distinct profile_id,game_number from public.bowling_league_games where session_id=$1',[sessionId])).rows;
        if(saved.some(g=>!enrolled(state).has(g.profile_id)||g.game_number>Number(state.config.totalGames)))throw issue('Cannot remove bowlers or games that already have scores',409);
        if(row.brackets_linked)throw issue('Unlink brackets before changing the session roster or setup',409);
        await db.query('update public.bowling_league_sessions set state=$2 where id=$1',[sessionId,state]);
      } else if(route==='/league/scores' && request.method==='POST') {
        const ids=enrolled(row.state);
        if(!Array.isArray(body.games)||body.games.length>2400)throw issue('Invalid scores');
        for(const game of body.games){
          if(!ids.has(game.profileId)||!Number.isInteger(game.gameNumber)||game.gameNumber<1||game.gameNumber>Number(row.state.config.totalGames)||!Number.isInteger(game.scratch)||game.scratch<0||game.scratch>300)throw issue('Scores must be whole numbers from 0 to 300 for a registered session bowler');
          const old=(await db.query('select source from public.bowling_league_games where session_id=$1 and profile_id=$2 and game_number=$3',[sessionId,game.profileId,game.gameNumber])).rows[0];
          if(row.brackets_linked&&old?.source==='brackets')throw issue('Edit linked bracket scores in Brackets, then refresh this session',409);
          await db.query(`insert into public.bowling_league_games(competition_id,session_id,profile_id,game_number,scratch,source,updated_by) values($1,$2,$3,$4,$5,'league',$6)
            on conflict(session_id,profile_id,game_number) do update set scratch=excluded.scratch,source='league',updated_by=excluded.updated_by,updated_at=now()`,[id,sessionId,game.profileId,game.gameNumber,game.scratch,actor.id]);
        }
      } else if(route==='/league/link-brackets'&&request.method==='POST'){
        if(body.confirm!==true||body.date!==String(row.session_date instanceof Date?row.session_date.toISOString().slice(0,10):row.session_date))throw issue('Confirm the exact session date before linking');
        if(!bracket?.data?.bowlers?.length)throw issue('No current bracket roster exists for this competition');
        await db.query('update public.bowling_league_sessions set brackets_linked=true where id=$1',[sessionId]);
        result=await syncLeagueBracketScores(db,id,bracket.data,actor.id);
      } else if(route==='/league/unlink-brackets'&&request.method==='POST'){
        await db.query('update public.bowling_league_sessions set brackets_linked=false where id=$1',[sessionId]);
      } else throw issue('Not found',404);
      const updated=(await db.query('update public.bowling_league_sessions set revision=revision+1,updated_at=now() where id=$1 returning revision',[sessionId])).rows[0];
      await db.query('commit');return response({...result,...updated});
    }catch(error){await db.query('rollback');throw error;}finally{db.release();}
  } catch(error) {
    if(error.code==='23505')return response({error:'That email, bowler link, or active bracket session already exists.'},409);
    if(error.status||error.message?.startsWith('Invalid')||error.message?.startsWith('Choose'))return response({error:error.message},error.status||400);
    throw error;
  }
}
