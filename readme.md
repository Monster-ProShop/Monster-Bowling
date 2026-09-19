# Monster Bowling Manager

Open `index.html` in a browser, or use the repository's GitHub Pages site. No build step or server is required.

## Tournament workflow

1. On **Registration & configuration**, set each buy-in and the payout percentages, then register bowlers. Handicap and scratch bracket entries each have their own requested count. High Game Pot and Quiniela are yes/no entries.
2. Generate brackets after the roster is final. Each bracket has eight different bowlers. Entries that cannot be placed in a complete bracket remain pending and are not charged. Changing the roster clears the draw, so generate again.
3. Enter three scratch game scores per bowler. Blank means unbowled; zero is a valid score.
4. Open **Reports & payouts** to see each bowler's charges, awards, and the total awarded. Print the report from the browser.

Handicap bracket scores add the bowler's handicap to each game. Each bracket's first and second place payouts use the percentages set for its eight entry buy-ins. Ties in a round advance together. Final ties share the money for the places they occupy.

The High Game Pot uses each entrant's highest single game **with handicap**. The top score takes the configured percentage of the pot; tied winners split it. Quiniela uses **scratch** high game and scratch three-game series among Quiniela entrants. Its first and second place percentages are configured separately for high game and high series. Ties share the payouts for the occupied places.

Payouts are provisional until all three games are entered for every participant in that event. Unallocated portions of each pool stay with the tournament. Dollar amounts are rounded to cents.

## Storage

Tournament data is saved in the current browser's local storage. It is not synced across devices or users, and clearing browser data removes it. GitHub stores the application code, not tournament registrations.

