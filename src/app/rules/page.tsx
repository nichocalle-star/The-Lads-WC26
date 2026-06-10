export default function RulesPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold">How It Works</h1>
        <p className="text-gray-400 mt-2">Everything you need to know about predicting and scoring.</p>
      </div>

      {/* Scoring table */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-green-400">Scoring System</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Round</th>
                <th className="text-center px-4 py-3">Advance</th>
                <th className="text-center px-4 py-3">Exact</th>
                <th className="text-center px-4 py-3">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[
                { round: "Group Stage", icon: "🌍", advance: 1, exact: 2, max: 96 },
                { round: "Round of 32", icon: "🔟", advance: 5, exact: 5, max: 160 },
                { round: "Round of 16", icon: "⚡", advance: 10, exact: 10, max: 160 },
                { round: "Quarter-Finals", icon: "🔥", advance: 20, exact: 20, max: 160 },
                { round: "Semi-Finals", icon: "🌟", advance: 40, exact: 40, max: 160 },
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
            <tfoot>
              <tr className="border-t border-gray-700 bg-gray-800/50">
                <td className="px-4 py-3 font-bold text-white" colSpan={3}>Total maximum</td>
                <td className="px-4 py-3 text-center font-bold text-green-400">836</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2 px-1">
          <span className="text-blue-400 font-medium">Advance</span> = team correctly predicted to qualify · <span className="text-green-400 font-medium">Exact</span> = team predicted in their precise position
        </p>
      </section>

      {/* Group Stage explained */}
      <section>
        <h2 className="text-xl font-semibold mb-1 text-green-400">Group Stage Scoring</h2>
        <p className="text-gray-400 text-sm mb-4">
          You predict the full standings (1st–4th) for each of the 12 groups. Every position can earn up to 2 points.
        </p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          <div className="px-4 py-3 flex items-start gap-3">
            <span className="text-blue-400 font-bold shrink-0 mt-0.5">+1</span>
            <div>
              <p className="font-medium text-sm">Advance point</p>
              <p className="text-gray-400 text-sm">The team you predicted for a qualifying position (1st or 2nd) actually qualifies, regardless of whether they finished 1st or 2nd.</p>
            </div>
          </div>
          <div className="px-4 py-3 flex items-start gap-3">
            <span className="text-green-400 font-bold shrink-0 mt-0.5">+2</span>
            <div>
              <p className="font-medium text-sm">Exact position point</p>
              <p className="text-gray-400 text-sm">The team you predicted finishes in the exact position you picked — 1st for 1st, 2nd for 2nd, 3rd for 3rd, 4th for 4th.</p>
            </div>
          </div>
        </div>

        {/* Example */}
        <div className="mt-4 bg-gray-900 border border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Example — Group A</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500 mb-2">Your prediction</p>
              <div className="space-y-1 text-sm">
                <div className="flex gap-2"><span className="text-gray-500 w-6">1st</span><span>Brazil</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-6">2nd</span><span>Portugal</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-6">3rd</span><span>Ghana</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-6">4th</span><span>Uruguay</span></div>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Actual result</p>
              <div className="space-y-1 text-sm">
                <div className="flex gap-2"><span className="text-gray-500 w-6">1st</span><span>Portugal</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-6">2nd</span><span>Brazil</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-6">3rd</span><span>Ghana</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-6">4th</span><span>Uruguay</span></div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Brazil predicted 1st → finished 2nd (still qualifies)</span>
              <span className="text-blue-400 font-semibold">+1</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Portugal predicted 2nd → finished 1st (still qualifies)</span>
              <span className="text-blue-400 font-semibold">+1</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Ghana predicted 3rd → finished exactly 3rd</span>
              <span className="text-green-400 font-semibold">+2</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Uruguay predicted 4th → finished exactly 4th</span>
              <span className="text-green-400 font-semibold">+2</span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-800 pt-2 font-semibold">
              <span>Total for this group</span>
              <span className="text-white">6 pts</span>
            </div>
          </div>
        </div>
      </section>

      {/* Knockout rounds explained */}
      <section>
        <h2 className="text-xl font-semibold mb-1 text-green-400">Knockout Round Scoring</h2>
        <p className="text-gray-400 text-sm mb-4">
          Advance and Exact are equal in knockout rounds — you earn points simply for picking the correct winner. No bonus for anything beyond getting the right team through.
        </p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {[
            { round: "Round of 32", pts: 5, note: "Pick the team that makes it to the Round of 16" },
            { round: "Round of 16", pts: 10, note: "Pick the team that makes it to the Quarter-Finals" },
            { round: "Quarter-Finals", pts: 20, note: "Pick the team that makes it to the Semi-Finals" },
            { round: "Semi-Finals", pts: 40, note: "Pick the team that makes it to the Final" },
            { round: "Final", pts: 50, note: "Pick the World Cup Champion" },
          ].map((row) => (
            <div key={row.round} className="px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-sm">{row.round}</p>
                <p className="text-gray-400 text-xs mt-0.5">{row.note}</p>
              </div>
              <span className="text-green-400 font-bold text-lg shrink-0">+{row.pts}</span>
            </div>
          ))}
        </div>
      </section>

      {/* How predictions work */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-green-400">How Predictions Work</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {[
            ["Predictions lock at kickoff", "Once a match starts, your pick is locked in. Get your predictions in before kick-off!"],
            ["Group standings feed the bracket", "Your predicted group standings automatically populate the knockout bracket. Mexico 1st in Group A? They show up as the Group A seed in the Round of 32."],
            ["Score entry determines the winner", "Enter the scoreline you expect — the winner is derived automatically from your score."],
          ].map(([title, body]) => (
            <div key={title} className="px-4 py-3">
              <p className="font-medium text-sm">{title}</p>
              <p className="text-gray-400 text-sm mt-0.5">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
