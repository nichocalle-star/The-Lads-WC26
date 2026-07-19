import Link from "next/link";

// The final-bet minimum (poll result: 25 won). Everyone must bet at least this
// on the World Cup Final; anyone who doesn't is docked the amount anyway.
export default function FinalBetAnnouncement() {
  return (
    <div className="bg-[#0b1d12] border border-[#2a5c3d] rounded-2xl overflow-hidden">
      <div className="flex h-[3px]"><div className="flex-1 bg-[#0a7a3d]" /><div className="flex-1 bg-[#ffd166]" /><div className="flex-1 bg-[#c8102e]" /></div>

      <div className="px-[18px] pt-4 pb-1 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-[30px] h-[30px] rounded-full bg-[#10301c] flex items-center justify-center shrink-0">📣</span>
          <div>
            <p className="text-[15px] font-semibold text-[#f0f7f2]">Rule: everyone bets the Final</p>
            <p className="text-xs text-[#6fae87] mt-0.5">The poll is in — the minimum is <span className="text-[#ffd166] font-medium">25 points</span>.</p>
          </div>
        </div>
        <span className="text-[10px] tracking-wider text-[#06230f] bg-[#ffd166] rounded px-2 py-[3px] shrink-0 font-semibold">NEW RULE</span>
      </div>

      <div className="px-[18px] pt-2 pb-3 space-y-1.5 text-[13px] text-[#cfe6d8] leading-relaxed">
        <p>Every player <span className="text-[#f0f7f2] font-medium">must bet at least 25 points on the World Cup Final.</span></p>
        <p className="text-[#e0b063]">⚠️ If you don&apos;t place a bet on the Final, <span className="font-medium">25 points will be deducted from your score anyway</span> — so you may as well have a shot at winning them.</p>
        <p className="text-[#9ec9ad]">If you have fewer than 25 points, you go <span className="text-[#f0f7f2]">all in</span> with everything you&apos;ve got.</p>
      </div>

      <Link href="/gamblers-corner"
        className="flex items-center justify-between px-[18px] py-3 border-t border-[#16301f] hover:bg-[#0e2517] transition-colors">
        <span className="text-[13px] text-[#9ec9ad]">Betting opens 24h before kickoff (Jul 18)</span>
        <span className="text-[#2bd97a] text-sm font-medium">Bet on the Final →</span>
      </Link>
    </div>
  );
}
