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
