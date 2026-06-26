"use client";

import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const TZ = "America/New_York";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ }) + " ET";
}

const EXAMPLES = [
  { pts: "10", color: "#2bd97a", bg: "#0e2517", chipBg: "#10301c", text: "You pick Brazil 2–0 · Brazil wins 2–0", tag: "winner ✓ + exact ✓" },
  { pts: "5", color: "#ffd166", bg: "#0e2517", chipBg: "#2a230c", text: "You pick Brazil 2–0 · Brazil wins 1–0", tag: "winner ✓ · score ✗" },
  { pts: "0", color: "#e08a8a", bg: "#1d0e0e", chipBg: "#2a1010", text: "You pick Brazil to win · Brazil is knocked out", tag: "winner ✗" },
];
const SCALE = [
  { v: "10", l: "R32" }, { v: "20", l: "R16" }, { v: "40", l: "QF" }, { v: "80", l: "SF" }, { v: "100", l: "Final", hot: true },
];

// ── Deliberately unbeatable "feedback" prank ──────────────────────────────────
// Every path loops back. There is no success state, by design.
const PRANK_STEPS = [
  { kind: "confirm", q: "Submit your feedback?", yes: "Yes, submit", no: "Cancel" },
  { kind: "confirm", q: "Are you sure?", yes: "Yes, I'm sure", no: "Go back" },
  { kind: "confirm", q: "Are you really sure?", yes: "Absolutely", no: "Hmm, no" },
  { kind: "captcha", q: "Verify you're human — select every ⚽", grid: ["⚽","🍕","⚽","🚗","🌮","⚽","🐟","⚽","🎸"] },
  { kind: "confirm", q: "Just to be safe — confirm once more?", yes: "Confirm", no: "Cancel" },
  { kind: "captcha", q: "One more check — select every 🏆", grid: ["🥈","🏆","🍔","🏆","🚦","🏆","🧦","🏆","🎈"] },
  { kind: "confirm", q: "Are you absolutely, positively certain?", yes: "100% certain", no: "Not anymore" },
  { kind: "captcha", q: "Prove it again — select every 🥅", grid: ["🥅","🐕","🥅","☕","🥅","🎩","🥅","🛴","🥅"] },
];

function FeedbackPrank() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [step, setStep] = useState(-1); // -1 = not started
  const [captchaMsg, setCaptchaMsg] = useState("");

  function start() { setStep(0); setCaptchaMsg(""); }
  function advance() {
    setCaptchaMsg("");
    setStep((s) => (s + 1) % PRANK_STEPS.length); // wraps forever
  }
  function captchaClick() {
    setCaptchaMsg("Incorrect — please try again.");
  }

  const active = step >= 0 ? PRANK_STEPS[step] : null;

  return (
    <div style={{ borderTop: "0.5px solid #16301f", padding: "12px 18px 14px" }}>
      <p style={{ margin: 0, fontSize: 11, letterSpacing: 1.5, color: "#6fae87" }}>FEEDBACK</p>
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="mt-2 text-[12px] text-[#9ec9ad] hover:text-white border border-[#1d3a28] hover:border-[#2a5c3d] rounded-lg px-3 py-1.5 transition-colors">
          Have thoughts on the scoring? Tell us
        </button>
      ) : (
        <div className="mt-2 space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
            placeholder="Your feedback on the new scoring…"
            className="w-full bg-[#07140c] border border-[#1d3a28] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3d6b4f] focus:outline-none focus:border-[#2bd97a]" />
          <button onClick={start}
            className="bg-[#0a7a3d] hover:bg-[#0d9449] text-white font-medium text-sm px-4 py-1.5 rounded-lg transition-colors">
            Submit feedback
          </button>
        </div>
      )}

      {active && (
        <div className="mt-3" style={{ minHeight: 60, background: "rgba(0,0,0,0.35)", borderRadius: 10, padding: 14 }}>
          <div className="bg-[#0b1d12] border border-[#2a5c3d] rounded-xl p-4 max-w-sm mx-auto">
            <p className="text-sm text-[#f0f7f2] font-medium text-center mb-3">{active.q}</p>
            {active.kind === "confirm" ? (
              <div className="flex gap-2 justify-center">
                <button onClick={advance} className="bg-[#0a7a3d] hover:bg-[#0d9449] text-white text-sm px-4 py-1.5 rounded-lg">{active.yes}</button>
                <button onClick={advance} className="border border-[#1d3a28] text-[#9ec9ad] hover:bg-[#10301c] text-sm px-4 py-1.5 rounded-lg">{active.no}</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  {active.grid!.map((c, i) => (
                    <button key={i} onClick={captchaClick}
                      className="aspect-square text-2xl bg-[#10301c] hover:bg-[#143b24] border border-[#1d3a28] rounded-lg flex items-center justify-center">
                      {c}
                    </button>
                  ))}
                </div>
                <button onClick={advance} className="w-full mt-2 bg-[#0a7a3d] hover:bg-[#0d9449] text-white text-sm py-1.5 rounded-lg">Verify</button>
                {captchaMsg && <p className="text-[11px] text-red-400 text-center mt-1.5">{captchaMsg}</p>}
              </>
            )}
            <button onClick={() => { setStep(-1); setOpen(false); setText(""); }}
              className="block mx-auto mt-3 text-[11px] text-[#3d6b4f] hover:text-[#6fae87]">give up</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScoringAnnouncement({ uid, initialAckAt }: { uid: string; initialAckAt?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [ackAt, setAckAt] = useState<string | null>(initialAckAt ?? null);
  const [acking, setAcking] = useState(false);

  async function acknowledge() {
    if (acking) return;
    setAcking(true);
    const now = new Date().toISOString();
    try {
      await setDoc(doc(db, "users", uid), { scoringAckAt: now }, { merge: true });
      setAckAt(now);
    } finally {
      setAcking(false);
    }
  }

  if (collapsed) return null;

  return (
    <div className="bg-[#0b1d12] border border-[#2a5c3d] rounded-2xl overflow-hidden">
      <div className="flex h-[3px]">
        <div className="flex-1 bg-[#0a7a3d]" /><div className="flex-1 bg-[#c8102e]" /><div className="flex-1 bg-[#0a3161]" />
      </div>

      <div className="px-[18px] pt-4 pb-1.5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-[30px] h-[30px] rounded-full bg-[#10301c] flex items-center justify-center shrink-0 text-[#ffd166]">🔔</span>
          <div>
            <p className="text-base font-medium text-[#f0f7f2]">Knockout scoring starts Jun 28</p>
            <p className="text-xs text-[#6fae87] mt-0.5">The group stage is wrapping up — points get a lot bigger from here.</p>
          </div>
        </div>
        <span className="text-[10px] tracking-wider text-[#06230f] bg-[#2bd97a] rounded px-2 py-[3px] shrink-0">NEW</span>
      </div>

      {/* Round of 32 tiers */}
      <div className="px-[18px] pt-2.5 pb-1">
        <p className="text-[11px] tracking-[1.5px] text-[#7fd4a3] mb-2">ROUND OF 32 · UP TO 10 POINTS PER MATCH</p>
        <div className="flex gap-2.5">
          <div className="flex-1 bg-[#10301c] border border-[#1d3a28] rounded-[10px] px-3 py-2.5">
            <p className="text-xl font-medium text-[#2bd97a] m-0">+5</p>
            <p className="text-xs text-[#cfe6d8] mt-1">Pick the team that wins the match</p>
          </div>
          <div className="flex-1 bg-[#10301c] border border-[#1d3a28] rounded-[10px] px-3 py-2.5">
            <p className="text-xl font-medium text-[#2bd97a] m-0">+5</p>
            <p className="text-xs text-[#cfe6d8] mt-1">Nail the exact final score <span className="text-[#6fae87]">(stacks on top)</span></p>
          </div>
        </div>
        <p className="text-xs text-[#9ec9ad] mt-2.5 leading-relaxed">
          ℹ️ Only two things count: the team you backed to win, and the scoreline. The opponent doesn&apos;t — if your team wins, you score, even if you guessed the wrong rival.
        </p>
      </div>

      {/* Examples */}
      <div className="px-[18px] pt-3 pb-1">
        <p className="text-[11px] tracking-[1.5px] text-[#6fae87] mb-1.5">HOW IT PLAYS OUT</p>
        {EXAMPLES.map((e) => (
          <div key={e.pts} className="flex items-center gap-2.5 px-3 py-2 rounded-[9px] mb-1.5"
            style={{ background: e.bg, border: `0.5px solid ${e.pts === "0" ? "#4a2222" : "#1d3a28"}` }}>
            <span className="text-sm font-medium rounded-md px-2.5 py-[3px] min-w-[42px] text-center"
              style={{ color: e.color, background: e.chipBg }}>{e.pts}</span>
            <span className="text-[13px] text-[#f0f7f2]">{e.text}</span>
            <span className="ml-auto text-[11px]" style={{ color: e.color }}>{e.tag}</span>
          </div>
        ))}
      </div>

      {/* Scaling */}
      <div className="px-[18px] pt-3 pb-2">
        <p className="text-[11px] tracking-[1.5px] text-[#6fae87] mb-1.5">IT ONLY GETS BIGGER — MAX POINTS PER MATCH</p>
        <div className="flex gap-1.5 text-center">
          {SCALE.map((s) => (
            <div key={s.l} className="flex-1 rounded-lg py-1.5"
              style={{ background: s.hot ? "#1a2c12" : "#10301c", border: `0.5px solid ${s.hot ? "#2a5c3d" : "#1d3a28"}` }}>
              <p className="text-[15px] font-medium m-0" style={{ color: s.hot ? "#2bd97a" : "#f0f7f2" }}>{s.v}</p>
              <p className="text-[10px] mt-0.5" style={{ color: s.hot ? "#7fd4a3" : "#6fae87" }}>{s.l}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#6fae87] mt-2">Each tier is still winner + exact score — the values just double round to round. A perfect Final call is worth 10× an R32 match.</p>
      </div>

      {/* Acknowledge */}
      <div className="border-t border-[#16301f] px-[18px] py-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-[#3d6b4f]">Posted by The Lads · matchday update</p>
        {ackAt ? (
          <span className="text-[12px] text-[#2bd97a] flex items-center gap-1.5">✓ Acknowledged {fmtDate(ackAt)}</span>
        ) : (
          <button onClick={acknowledge} disabled={acking}
            className="bg-[#0a7a3d] hover:bg-[#0d9449] disabled:opacity-60 text-white font-medium text-[13px] px-4 py-1.5 rounded-lg transition-colors">
            {acking ? "Saving…" : "✓ I've read the new scoring"}
          </button>
        )}
      </div>

      <FeedbackPrank />

      {ackAt && (
        <button onClick={() => setCollapsed(true)}
          className="w-full text-[11px] text-[#3d6b4f] hover:text-[#6fae87] py-2 border-t border-[#16301f]">
          Hide this notice
        </button>
      )}
    </div>
  );
}
