# Monster Bowling Manager

Use the hosted app at `https://brackets.prodrillos.com`. The public site is served by GitHub Pages; a separate Neon project stores competitions, results, and verified accounts.

## Accounts and competitions

The verified account `monsterproshop@outlook.com` is the administrator. It can create leagues or tournaments from its dashboard, open each one, register bowlers, generate brackets, enter scores, and set buy-ins and payouts. Add each bowler's login email to their roster entry. Changes save to Neon for that competition.

Other users create an account with email and password, enter the emailed verification code, and select an available league or tournament when signing in. They can see that competition's results after their verified email matches a registered bowler. Each person sees only their own charges, winnings, and balance. The administrator controls registration and scoring.

## Tournament workflow

1. Choose **English** or **Español** in the top-right menu. On **Registration & configuration**, set each buy-in and the payout percentages, then register bowlers. Enter the maximum number of handicap and scratch brackets each bowler is willing to play. High Game Pot and Doubles can be selected.
2. Generate brackets after the roster is final. With eight or more event entrants, the draw makes the greatest possible number of eight-person brackets within everyone's stated maximum. With exactly seven entrants, it makes eight-slot brackets with one first-round bye each. Fewer than seven entrants cannot form a bracket. A bowler may be assigned fewer brackets than offered. Only assigned entrants are charged; a bye never pays. Changing the roster clears the draw, so generate again.
3. Enter three scratch game scores per bowler. Blank means unbowled; zero is a valid score.
4. Open **High Game** to generate standings for all entrants. Each game shows the score with handicap and circles its leader in green.
5. Open **Doubles / Parejas** to add each team by typing the names of two registered bowlers. The fields suggest names from the roster. A bowler may join multiple different teams and pays the individual buy-in for **each** team (three teams at $50 costs $150). An unpaired bowler is not charged. Both bowlers' scores, each combined game, and combined series are shown. Green circles mark combined game and series leaders.
6. Open **Reports & payouts** for a single summary row per bowler: itemized entry charges, total due, itemized awards, total won, signed balance for each event, and overall balance. Negative balances are red and positive balances are green. Print the report from the browser.

The Brackets screen displays each draw as a tournament tree. A blue circle marks a winner, and a red X marks a loser after the relevant game score is entered. A bye advances automatically. Each bracket can be downloaded as an SVG image.

Handicap bracket scores add the bowler's handicap to each game. Each bracket's first and second place payouts use the percentages set for its actual entrant buy-ins. Ties in a round advance together; a bowler facing a bye advances automatically. Final ties share the money for the places they occupy.

The High Game Pot uses each entrant's highest single game **with handicap**. The top score takes the configured percentage of the pot; tied winners split it. Doubles uses the sum of both partners' handicap scores in each game. The highest combined game and highest combined three-game series can each win a configurable portion of the Doubles pool; enable either prize or both. Each prize is split evenly between the two partners. Tied teams share the applicable prize. The Scoring tab shows combined totals for every registered team; a bowler's entered games are reused across all their teams.

Payouts are provisional until all three games are entered for every participant in that event. Unallocated portions of each pool stay with the tournament. Dollar amounts are rounded to cents.

## Storage and deployment

Competition data is saved in the independent Neon **Monster Bowling** project. GitHub stores application code, not tournament registrations. The database schema is in `neon/001_portal.sql`; the backend is the Neon Function in `functions/portal.js`. Build it with `npm install` and `npm run build:function`, then deploy `dist/portal.zip` to the Neon function `bowlingportal`. `portal-config.js` contains only public endpoint URLs; never place database passwords in browser files.

Cloudflare has a DNS-only CNAME from `brackets.prodrillos.com` to `monster-proshop.github.io`. GitHub Pages must also have `brackets.prodrillos.com` set as its custom domain. Neon Auth trusts this domain and requires email verification.

Use **Start New Competition** in Reports & payouts to download a JSON backup, then return to the dashboard and create another competition. That action does not erase saved competitions. The manager can restore a backup into an open competition.

