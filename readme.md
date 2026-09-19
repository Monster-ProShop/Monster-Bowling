# Monster Bowling Manager

Open `index.html` in a browser, or use the repository's GitHub Pages site. No build step or server is required.

## Tournament workflow

1. On **Registration & configuration**, set each buy-in and the payout percentages, then register bowlers. Enter the maximum number of handicap and scratch brackets each bowler is willing to play. High Game Pot and Quiniela are yes/no entries.
2. Generate brackets after the roster is final. With eight or more event entrants, the draw makes the greatest possible number of eight-person brackets within everyone's stated maximum. With exactly seven entrants, it makes eight-slot brackets with one first-round bye each. Fewer than seven entrants cannot form a bracket. A bowler may be assigned fewer brackets than offered. Only assigned entrants are charged; a bye never pays. Changing the roster clears the draw, so generate again.
3. Enter three scratch game scores per bowler. Blank means unbowled; zero is a valid score.
4. Open **Reports & payouts** for a single summary row per bowler: itemized entry charges, total due, itemized awards, total won, and balance (winnings minus charges). Negative balances are red and positive balances are green. The bottom of the report totals charges, winnings, and combined balances. Print the report from the browser.

The Brackets screen displays each draw as a tournament tree. A blue circle marks a winner, and a red X marks a loser after the relevant game score is entered. A bye advances automatically. Each bracket can be downloaded as an SVG image.

Handicap bracket scores add the bowler's handicap to each game. Each bracket's first and second place payouts use the percentages set for its actual entrant buy-ins. Ties in a round advance together; a bowler facing a bye advances automatically. Final ties share the money for the places they occupy.

The High Game Pot uses each entrant's highest single game **with handicap**. The top score takes the configured percentage of the pot; tied winners split it. Quiniela uses **scratch** high game and scratch three-game series among Quiniela entrants. Its first and second place percentages are configured separately for high game and high series. Ties share the payouts for the occupied places.

Payouts are provisional until all three games are entered for every participant in that event. Unallocated portions of each pool stay with the tournament. Dollar amounts are rounded to cents.

## Storage

Tournament data is saved in the current browser's local storage. It is not synced across devices or users, and clearing browser data removes it. GitHub stores the application code, not tournament registrations.

