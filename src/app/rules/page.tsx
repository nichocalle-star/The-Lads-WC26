export default function RulesPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold">How It Works</h1>
        <p className="text-gray-400 mt-2">Everything you need to know about predicting, scoring, and the Points Exchange.</p>
      </div>

      {/* Scoring table */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-green-400">Scoring System</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Round</th>
                <th className="text-center px-4 py-3">Correct pick</th>
                <th className="text-center px-4 py-3">Exact score</th>
                <th className="text-center px-4 py-3">Max / match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[
                { round: "Group Stage", icon: "🌍", advance: 1, exact: 2, max: 2 },
                { round: "Round of 32", icon: "🔟", advance: 5, exact: 5, max: 10 },
                { round: "Round of 16", icon: "⚡", advance: 10, exact: 10, max: 20 },
                { round: "Quarter-Finals", icon: "🔥", advance: 20, exact: 20, max: 40 },
                { round: "Semi-Finals", icon: "🌟", advance: 40, exact: 40, max: 80 },
                { round: "3rd-Place Playoff", icon: "🥉", advance: 45, exact: 45, max: 90 },
                { round: "Final", icon: "🏆", advance: 50, exact: 50, max: 100 },
              ].map((row) => (
                <tr key={row.round} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <span className="mr-2">{row.icon}</span>{row.round}
                  </td>
                  <td className="px-4 py-3 text-center text-blue-400 font-semibold">+{row.advance}</td>
                  <td className="px-4 py-3 text-center text-green-400 font-semibold">+{row.exact}</td>
                  <td className="px-4 py-3 text-center text-gray-300 font-semibold">{row.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2 px-1 leading-relaxed">
          In the <span className="text-gray-300">group stage</span> these are either/or — an exact score already counts as the correct result, so the most a match can earn is 2.
          In the <span className="text-gray-300">knockouts</span> they <span className="text-gray-300">stack</span>: get the winner right for the first number, and nail the exact score for the second on top (e.g. up to 10 in the Round of 32).
        </p>
      </section>

      {/* Group Stage explained */}
      <section>
        <h2 className="text-xl font-semibold mb-1 text-green-400">Group Stage Scoring</h2>
        <p className="text-gray-400 text-sm mb-4">
          You predict the scoreline of every group match. Each match is scored on its own.
        </p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          <div className="px-4 py-3 flex items-start gap-3">
            <span className="text-green-400 font-bold shrink-0 mt-0.5">+2</span>
            <div>
              <p className="font-medium text-sm">Exact score</p>
              <p className="text-gray-400 text-sm">Your predicted scoreline matches the final score exactly.</p>
            </div>
          </div>
          <div className="px-4 py-3 flex items-start gap-3">
            <span className="text-blue-400 font-bold shrink-0 mt-0.5">+1</span>
            <div>
              <p className="font-medium text-sm">Correct result</p>
              <p className="text-gray-400 text-sm">You got the outcome right (home win, draw, or away win) but not the exact score.</p>
            </div>
          </div>
        </div>

        {/* Example */}
        <div className="mt-4 bg-gray-900 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Example — you predict Brazil 2–1 Ghana</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Final: Brazil 2–1 Ghana — exact</span>
              <span className="text-green-400 font-semibold">+2</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Final: Brazil 3–0 Ghana — right result, wrong score</span>
              <span className="text-blue-400 font-semibold">+1</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Final: Ghana 1–0 Brazil — wrong result</span>
              <span className="text-gray-500 font-semibold">0</span>
            </div>
          </div>
        </div>
      </section>

      {/* Knockout rounds explained */}
      <section>
        <h2 className="text-xl font-semibold mb-1 text-green-400">Knockout Scoring</h2>
        <p className="text-gray-400 text-sm mb-4">
          Your group predictions build your bracket. In the knockouts you&apos;re scored on the <span className="text-gray-300">teams you back to advance</span> and the scores you give them — not the exact bracket position.
        </p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          <div className="px-4 py-3 flex items-start gap-3">
            <span className="text-blue-400 font-bold shrink-0 mt-0.5">win</span>
            <div>
              <p className="font-medium text-sm">Correct winner</p>
              <p className="text-gray-400 text-sm">The team you backed actually wins its game that round — <span className="text-gray-300">whoever the opponent turns out to be</span>. Worth the round&apos;s first number (5, 10, 20, 40, 45, 50).</p>
            </div>
          </div>
          <div className="px-4 py-3 flex items-start gap-3">
            <span className="text-green-400 font-bold shrink-0 mt-0.5">+score</span>
            <div>
              <p className="font-medium text-sm">Exact score (stacks)</p>
              <p className="text-gray-400 text-sm">On top of the winner, you also nailed the winning scoreline — worth the round&apos;s second number.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 bg-gray-900 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Example — Round of 32, you predict Brazil to beat Japan 2–1</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Brazil beats <span className="text-gray-300">South Africa</span> 2–1 — winner + exact</span>
              <span className="text-green-400 font-semibold">+10</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Brazil beats South Africa 3–0 — winner only</span>
              <span className="text-blue-400 font-semibold">+5</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Brazil is knocked out</span>
              <span className="text-gray-500 font-semibold">0</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-800">
            You picked Japan as the opponent and it was actually South Africa — doesn&apos;t matter. Only the team you backed to win and the winning scoreline count.
          </p>
        </div>
      </section>

      {/* How predictions work */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-green-400">How Predictions Work</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {[
            ["Predictions lock at kickoff", "Once a match starts, your pick is locked in. Get your predictions in before kick-off."],
            ["Group standings feed the bracket", "Your predicted group standings automatically populate the knockout bracket — 1st in Group A becomes the Group A seed in the Round of 32."],
            ["Score entry determines the winner", "Enter the scoreline you expect and the winner is derived from it. A tie scoreline leaves that bracket slot ambiguous, so it earns no winner points."],
          ].map(([title, body]) => (
            <div key={title} className="px-4 py-3">
              <p className="font-medium text-sm">{title}</p>
              <p className="text-gray-400 text-sm mt-0.5">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Points Exchange (betting) */}
      <section>
        <h2 className="text-xl font-semibold mb-1 text-green-400">🎲 The Points Exchange</h2>
        <p className="text-gray-400 text-sm mb-4">
          In the Gambler&apos;s Corner you can <span className="text-gray-300">stake the points you&apos;ve earned</span> on upcoming matches. Wins and losses move your real leaderboard score.
        </p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          <div className="px-4 py-3">
            <p className="font-medium text-sm text-white">Match Winner — live DraftKings odds</p>
            <p className="text-gray-400 text-sm mt-0.5">Back home, draw, or away. Settles on the result after <span className="text-gray-300">90 minutes + stoppage time — not extra time or penalties</span>. A knockout that goes to extra time or a shootout was level at 90, so it settles as a <span className="text-gray-300">Draw</span>.</p>
          </div>
          <div className="px-4 py-3">
            <p className="font-medium text-sm text-white">Correct Score — flat 3×</p>
            <p className="text-gray-400 text-sm mt-0.5">Pick the exact <span className="text-gray-300">final scoreline</span>. Nail it and you win <span className="text-gray-300">3× your stake</span>; miss it and you lose your stake — no refunds.</p>
          </div>
          <div className="px-4 py-3">
            <p className="font-medium text-sm text-white">Limits</p>
            <p className="text-gray-400 text-sm mt-0.5">Max <span className="text-gray-300">10 points per bet</span>, and <span className="text-gray-300">one Match Winner bet + one Correct Score bet per game</span>. You can&apos;t stake more than your balance.</p>
          </div>
          <div className="px-4 py-3">
            <p className="font-medium text-sm text-white">When you can bet &amp; payouts</p>
            <p className="text-gray-400 text-sm mt-0.5">Betting opens <span className="text-gray-300">24 hours before kickoff</span> and locks when the match starts. Win and your stake returns with profit at the odds shown; lose and the stake is gone. Bets settle automatically at full time.</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2 px-1">
          ⚠️ For fun only — the bookmaker&apos;s margin (the house edge) is built into the Match Winner odds. Never wager more than you can afford to lose.
        </p>
      </section>
    </div>
  );
}
