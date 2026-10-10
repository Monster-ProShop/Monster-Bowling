export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateState(state, profiles) {
  if (!state || !Array.isArray(state.teams) || !Array.isArray(state.matches) || !state.config) throw new Error('Invalid tournament data');
  const games = Number(state.config.totalGames);
  if (!Number.isInteger(games) || games < 1 || games > 24 || state.teams.length > 200) throw new Error('Choose 1–24 games and at most 200 teams');
  const valid = new Set(profiles.map(p => p.id)), seen = new Set();
  for (const team of state.teams) {
    if (typeof team.name !== 'string' || !team.name.trim() || team.name.length > 120 || !Array.isArray(team.players) || team.players.length > 12) throw new Error('Invalid team roster');
    for (const player of team.players) {
      if (!valid.has(player.profileId) || seen.has(player.profileId)) throw new Error('Choose each registered bowler only once per session');
      seen.add(player.profileId);
    }
  }
  return seen;
}
export function mappedBracketGames(state, profiles, enrolledIds, totalGames) {
  if (state?.format === 'delarosa-masters-v1') throw new Error('De La Rosa multi-day mapping must be configured before linking');
  const games = [], unmapped = [], seen = new Set();
  for (const bowler of state?.bowlers || []) {
    // Never infer identity from a display name.
    const candidates = profiles.filter(p => p.id === bowler.id ||
      (p.email && bowler.email && p.email.toLowerCase() === bowler.email.toLowerCase()) ||
      (p.membership_number && p.membership_number === bowler.membershipNumber));
    if (candidates.length !== 1 || !enrolledIds.has(candidates[0].id)) { unmapped.push(bowler.name); continue; }
    const profile = candidates[0];
    if (seen.has(profile.id)) throw new Error('Multiple bracket bowlers map to the same league profile');
    seen.add(profile.id);
    for (let game = 1; game <= Math.min(totalGames, 3); game++) {
      const value = Array.isArray(bowler.scores) ? bowler.scores[game-1] : bowler.scores?.['g'+game];
      if (value === null || value === undefined || value === '') continue;
      const scratch = Number(value);
      if (!Number.isInteger(scratch) || scratch < 0 || scratch > 300) throw new Error('Bracket scores must be integers from 0 to 300');
      games.push({ profileId: profile.id, gameNumber: game, scratch });
    }
  }
  return { games, unmapped, linkedProfiles: [...seen] };
}

const whole = (value, min, max, label) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return number;
};
const money = (value, label) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0 || number > 1000000) throw new Error(`${label} must be a positive amount`);
  return Number(number.toFixed(2));
};

export function validateLeagueConfiguration(input, profiles=[]) {
  const config = structuredClone(input || {});
  config.numberOfTeams = whole(config.numberOfTeams, 4, 48, 'Number of teams');
  if (config.numberOfTeams % 2) throw new Error('USBC schedules require an even number of teams');
  config.activeBowlers = whole(config.activeBowlers, 1, 12, 'Active bowlers');
  config.substituteBowlers = whole(config.substituteBowlers ?? 0, 0, 24, 'Substitute bowlers');
  config.numberOfSessions = whole(config.numberOfSessions, 1, 60, 'Number of sessions');
  config.gamesPerBowler = whole(config.gamesPerBowler, 1, 12, 'Games per bowler');
  config.startLane = whole(config.startLane ?? 1, 1, 199, 'Starting lane');
  config.startDate = String(config.startDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.startDate) || Number.isNaN(Date.parse(config.startDate))) throw new Error('Choose the first session date');
  config.positionRounds = [...new Set((config.positionRounds || []).map(Number))].sort((a,b)=>a-b);
  if (config.positionRounds.some(n=>!Number.isInteger(n)||n<1||n>config.numberOfSessions)) throw new Error('Position rounds must be valid session numbers');
  const divisions = value => (Array.isArray(value) ? value : []).map(v=>String(v).trim()).filter(Boolean);
  config.teamDivisions = divisions(config.teamDivisions);
  config.bowlerDivisions = divisions(config.bowlerDivisions);
  const points = config.points || {};
  config.points = {
    gameWin: money(points.gameWin ?? 1,'Game win points'), gameTie: money(points.gameTie ?? .5,'Game tie points'),
    seriesWin: money(points.seriesWin ?? 1,'Series win points'), seriesTie: money(points.seriesTie ?? .5,'Series tie points'),
    bonuses: (Array.isArray(points.bonuses)?points.bonuses:[]).map(b=>({concept:String(b.concept||'').trim(),points:money(b.points,'Bonus points')})).filter(b=>b.concept)
  };
  const normalizeHandicap = rule => {
    const normalized={percent:whole(rule?.percent ?? 90,0,100,'Handicap percent'),base:whole(rule?.base ?? 220,0,300,'Handicap base'),minHandicap:whole(rule?.minHandicap ?? rule?.minAverage ?? 0,0,300,'Minimum handicap'),maxHandicap:whole(rule?.maxHandicap ?? rule?.maxAverage ?? 300,0,300,'Maximum handicap')};
    if(normalized.minHandicap>normalized.maxHandicap)throw new Error('Minimum handicap cannot exceed maximum handicap');
    return normalized;
  };
  config.handicap = {global:normalizeHandicap(config.handicap?.global),divisions:{}};
  for (const name of config.bowlerDivisions) config.handicap.divisions[name]=normalizeHandicap(config.handicap?.divisions?.[name] || config.handicap.global);
  config.finances = {costPerGame:money(config.finances?.costPerGame,'Cost per game'),prizeFundPerSession:money(config.finances?.prizeFundPerSession,'Prize fund')};
  const validProfiles = new Set(profiles.map(p=>p.id));
  config.sponsorships = (Array.isArray(config.sponsorships)?config.sponsorships:[]).map(s=>({profileId:String(s.profileId||''),amountPerSession:money(s.amountPerSession,'Sponsored amount')})).filter(s=>s.amountPerSession>0);
  if (profiles.length && config.sponsorships.some(s=>!validProfiles.has(s.profileId))) throw new Error('Choose sponsored bowlers from the league roster');
  return config;
}

// The circle rotation produces a balanced USBC-style round robin. Lane pairs rotate
// independently so teams visit every assigned pair before the pattern repeats.
export function generateLeagueSchedule(configInput) {
  const config=validateLeagueConfiguration(configInput);
  const teams=Array.from({length:config.numberOfTeams},(_,i)=>i+1), rounds=config.numberOfTeams-1, rotation=[...teams];
  const cycle=[];
  for(let round=0;round<rounds;round++){
    const pairs=[];
    for(let i=0;i<config.numberOfTeams/2;i++){
      const pairIndex=(i+round)% (config.numberOfTeams/2);
      pairs.push({teamA:rotation[i],teamB:rotation[config.numberOfTeams-1-i],laneStart:config.startLane+pairIndex*2,laneEnd:config.startLane+pairIndex*2+1});
    }
    cycle.push(pairs);
    rotation.splice(1,0,rotation.pop());
  }
  const start=new Date(config.startDate+'T12:00:00Z');
  return Array.from({length:config.numberOfSessions},(_,index)=>{
    const number=index+1,date=new Date(start);date.setUTCDate(start.getUTCDate()+index*7);
    const positionRound=config.positionRounds.includes(number);
    return {number,date:date.toISOString().slice(0,10),label:`Week ${number}${positionRound?' · Position Round':''}`,positionRound,
      matches:positionRound?Array.from({length:config.numberOfTeams/2},(_,i)=>({positionA:i*2+1,positionB:i*2+2,laneStart:config.startLane+i*2,laneEnd:config.startLane+i*2+1})):cycle[index%cycle.length]};
  });
}
