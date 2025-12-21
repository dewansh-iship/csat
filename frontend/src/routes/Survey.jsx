import React, { useEffect, useMemo, useState } from "react";
import { getJSON, postJSON } from "../api";

const IMPORTANCE = ["HIGH", "MEDIUM", "LOW"];

const SECTION_COLORS = {
  "Shipboard Management": "ring-sky-200 bg-sky-50/40",
  "Cargo": "ring-amber-200 bg-amber-50/40",
  "Operations": "ring-indigo-200 bg-indigo-50/40",
  "Vessel Maintenance": "ring-emerald-200 bg-emerald-50/40",
  "Dry-docking": "ring-rose-200 bg-rose-50/40",
  "Responsiveness": "ring-cyan-200 bg-cyan-50/40",
  "Operating costs": "ring-orange-200 bg-orange-50/40",
  "Reporting": "ring-violet-200 bg-violet-50/40",
  "Overall": "ring-slate-300 bg-slate-50/40",
  "Trust": "ring-teal-200 bg-teal-50/40",
};

const SECTION_ACCENT = {
  "Shipboard Management": "bg-sky-300",
  "Cargo": "bg-amber-300",
  "Operations": "bg-indigo-300",
  "Vessel Maintenance": "bg-emerald-300",
  "Dry-docking": "bg-rose-300",
  "Responsiveness": "bg-cyan-300",
  "Operating costs": "bg-orange-300",
  "Reporting": "bg-violet-300",
  "Overall": "bg-slate-300",
  "Trust": "bg-teal-300",
};

function group(questions) {
  const out = { ONBOARD: {}, ASHORE: {} };
  for (const q of questions) {
    if (!out[q.section][q.serviceArea]) out[q.section][q.serviceArea] = [];
    out[q.section][q.serviceArea].push(q);
  }
  return out;
}

function clamp(n, a, b) {
  const v = Number(n);
  if (Number.isNaN(v)) return a;
  return Math.max(a, Math.min(b, v));
}

function scoreLabel(v) {
  const n = clamp(v, 0, 5);
  if (n <= 2) return "Low";
  if (n === 3) return "Acceptable";
  return "High";
}

function Slider({ value, onChange, disabled }) {
  const v = clamp(value ?? 3, 0, 5);
  // (A) Softer glow color and intensity based on value (stepped)
  // 0–1 coral, 2 amber, 3 orange, 4 green, 5 deep green
  const glow =
    v <= 1 ? "248 113 113" :     // coral
    v === 2 ? "245 158 11" :     // amber
    v === 3 ? "249 115 22" :     // orange
    v === 4 ? "34 197 94" :      // green
    "22 163 74";                // deep green (5)

  // (B) Track fill (stepped) — avoid heavy red dominance
  // 0–1: coral only
  // 2: coral → amber
  // 3: amber → orange (no green)
  // 4: orange → green
  // 5: green → deep green
  const fill =
    v <= 1
      ? "linear-gradient(90deg, rgba(248,113,113,0.95) 0%, rgba(248,113,113,0.95) 100%)"
      : v === 2
        ? "linear-gradient(90deg, rgba(248,113,113,0.55) 0%, rgba(248,113,113,0.55) 55%, rgba(245,158,11,0.95) 100%)"
        : v === 3
          ? "linear-gradient(90deg, rgba(245,158,11,0.70) 0%, rgba(245,158,11,0.70) 55%, rgba(249,115,22,0.95) 100%)"
          : v === 4
            ? "linear-gradient(90deg, rgba(249,115,22,0.65) 0%, rgba(249,115,22,0.65) 45%, rgba(34,197,94,0.95) 100%)"
            : "linear-gradient(90deg, rgba(34,197,94,0.70) 0%, rgba(34,197,94,0.70) 55%, rgba(22,163,74,0.98) 100%)";

  // Slightly softer glow overall
  const glowA = v <= 1 ? 0.16 : v === 2 ? 0.14 : v === 3 ? 0.13 : v === 4 ? 0.12 : 0.14;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>0</span>
        <span className="font-semibold text-slate-900">{v} / 5 • {scoreLabel(v)}</span>
        <span>5</span>
      </div>

      <input
        type="range"
        min="0"
        max="5"
        step="1"
        value={v}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sat-range w-full"
        style={{
          "--pct": `${(v / 5) * 100}%`,
          "--fill": fill,
          "--glow": glow,
          "--glowA": glowA,
        }}
        aria-label="Satisfaction slider"
      />

      <style>{`
        .sat-range {
          -webkit-appearance: none;
          appearance: none;
          height: 24px;
          background: transparent;
          cursor: pointer;
        }

        /* Track — Safari/Chrome */
        .sat-range::-webkit-slider-runnable-track {
          height: 10px;
          border-radius: 999px;
          /* Base track (always neutral) + Filled track (colored) */
          background:
            linear-gradient(180deg, rgba(15,23,42,0.10), rgba(15,23,42,0.06)) 0 0/100% 100% no-repeat,
            var(--fill) 0 0/var(--pct) 100% no-repeat;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.70),
            inset 0 0 0 1px rgba(15,23,42,0.06);
        }

        /* Thumb — Safari/Chrome */
        .sat-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(255,255,255,0.95);
          border: 1px solid rgba(15,23,42,0.18);
          box-shadow:
            0 10px 22px rgba(0,0,0,0.18),
            0 0 0 0 rgba(var(--glow), 0),
            inset 0 1px 0 rgba(255,255,255,0.9);
          margin-top: -6px;
        }

        .sat-range:hover::-webkit-slider-thumb {
          box-shadow:
            0 10px 22px rgba(0,0,0,0.18),
            0 0 0 10px rgba(var(--glow), calc(var(--glowA) * 0.65)),
            0 0 22px rgba(var(--glow), var(--glowA)),
            inset 0 1px 0 rgba(255,255,255,0.9);
        }

        .sat-range:active::-webkit-slider-thumb {
          box-shadow:
            0 12px 26px rgba(0,0,0,0.22),
            0 0 0 12px rgba(var(--glow), var(--glowA)),
            0 0 28px rgba(var(--glow), calc(var(--glowA) + 0.05)),
            inset 0 1px 0 rgba(255,255,255,0.9);
        }

        /* Track — Firefox */
        .sat-range::-moz-range-track {
          height: 10px;
          border-radius: 999px;
          /* Base track (always neutral) + Filled track (colored) */
          background:
            linear-gradient(180deg, rgba(15,23,42,0.10), rgba(15,23,42,0.06)) 0 0/100% 100% no-repeat,
            var(--fill) 0 0/var(--pct) 100% no-repeat;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.70),
            inset 0 0 0 1px rgba(15,23,42,0.06);
        }

        .sat-range::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(255,255,255,0.95);
          border: 1px solid rgba(15,23,42,0.18);
          box-shadow:
            0 10px 22px rgba(0,0,0,0.18),
            0 0 0 0 rgba(var(--glow), 0),
            inset 0 1px 0 rgba(255,255,255,0.9);
        }

        .sat-range:hover::-moz-range-thumb {
          box-shadow:
            0 10px 22px rgba(0,0,0,0.18),
            0 0 0 10px rgba(var(--glow), calc(var(--glowA) * 0.65)),
            0 0 22px rgba(var(--glow), var(--glowA)),
            inset 0 1px 0 rgba(255,255,255,0.9);
        }

        .sat-range:active::-moz-range-thumb {
          box-shadow:
            0 12px 26px rgba(0,0,0,0.22),
            0 0 0 12px rgba(var(--glow), var(--glowA)),
            0 0 28px rgba(var(--glow), calc(var(--glowA) + 0.05)),
            inset 0 1px 0 rgba(255,255,255,0.9);
        }

        .sat-range:disabled { cursor: not-allowed; opacity: 0.6; }
        .sat-range:disabled::-webkit-slider-runnable-track,
        .sat-range:disabled::-moz-range-track {
          background: rgba(15,23,42,0.10);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.55);
        }
      `}</style>
    </div>
  );
}

export default function Survey() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Email-only submission (no OTP)
  const [email, setEmail] = useState("");
  const [remark, setRemark] = useState("");
  const [attachment, setAttachment] = useState(null);

  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [meta, setMeta] = useState({ vessel: "", customerOwner: "", contact: "", position: "" });
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const res = await getJSON("/questions");
        const qs = res.questions || [];
        setQuestions(qs);

        // ✅ initialize defaults for all questions so scoring is never 0 by accident
        const initial = {};
        for (const q of qs) {
          initial[q.code] = { relevant: true, importance: "MEDIUM", satisfaction: 3 };
        }
        setAnswers(initial);
      } catch (e) {
        alert(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const grouped = useMemo(() => group(questions), [questions]);

  function setA(code, patch) {
    setAnswers((prev) => ({
      ...prev,
      [code]: { ...(prev[code] || { relevant: true, satisfaction: 3, importance: "MEDIUM" }), ...patch },
    }));
  }

  async function submit() {
    if (!email) { alert("Please enter your email."); return; }

    setBusy(true);
    try {
      const payloadAnswers = questions.map((q) => {
        const a = answers[q.code] || { relevant: true, importance: "MEDIUM", satisfaction: 3 };
        if (a.relevant && (!a.importance || a.satisfaction === undefined || a.satisfaction === null)) {
          throw new Error(`Select Importance & Satisfaction for ${q.code}`);
        }
        return {
          code: q.code,
          relevant: !!a.relevant,
          importance: a.relevant ? a.importance : undefined,
          satisfaction: a.relevant ? Number(a.satisfaction) : undefined,
        };
      });

      const fd = new FormData();
      fd.append("email", email.trim().toLowerCase());
      fd.append("meta", JSON.stringify(meta));
      fd.append("answers", JSON.stringify(payloadAnswers));
      if (remark.trim()) fd.append("remark", remark.trim());
      if (attachment) fd.append("file", attachment);

      const res = await fetch(`${import.meta.env.VITE_API_BASE}/submit`, {
        method: "POST",
        headers: { "X-Email": email.trim().toLowerCase() },
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Submit failed");

      alert(`Submitted. Overall score: ${data.scores.overall}%`);
      setSubmitted(false);
      setRemark("");
      setAttachment(null);
    } catch (e) {
      alert(e.message || "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="glass noise p-6">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="glass noise p-8 shimmer">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
              Customer Satisfaction Survey
            </div>
            <div className="mt-2 text-slate-600">
              White liquid-glass UI • Email-only submission • Slider 0–5 (0–2 Low, 3 Acceptable, 4–5 High)
            </div>
          </div>
        </div>
      </div>


      <div className="glass noise p-6 space-y-3">
        <div className="text-lg font-semibold text-slate-900">Step 2 — Details (optional)</div>
        <div className="grid md:grid-cols-2 gap-3">
          {[
            ["vessel", "Vessel"],
            ["customerOwner", "Customer / Owner"],
            ["contact", "Contact"],
            ["position", "Position"],
          ].map(([k, label]) => (
            <div key={k}>
              <div className="text-xs text-slate-600 mb-1">{label}</div>
              <input
                className="input"
                value={meta[k]}
                onChange={(e) => setMeta((m) => ({ ...m, [k]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </div>

      <Section title="Onboard" grouped={grouped.ONBOARD} answers={answers} setA={setA} />
      <Section title="Ashore" grouped={grouped.ASHORE} answers={answers} setA={setA} />

      <div className="glass noise p-6 space-y-5">
        <div className="text-xl font-semibold text-slate-900">Final Submission</div>

        <div>
          <div className="text-xs text-slate-600 mb-1">Comment / Remark (optional)</div>
          <textarea
            className="input min-h-[120px]"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="Any additional comments or suggestions..."
          />
        </div>

        <div>
          <div className="text-xs text-slate-600 mb-1">Attach file or photo (optional)</div>
          <input
            type="file"
            accept="image/*,.pdf,.doc,.docx"
            onChange={(e) => setAttachment(e.target.files?.[0] || null)}
          />
          {attachment && (
            <div className="mt-1 text-xs text-slate-500">
              Selected: <b>{attachment.name}</b> ({Math.round(attachment.size / 1024)} KB)
            </div>
          )}
        </div>

        <div className="border-t border-black/10 pt-4 grid md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <div className="text-xs text-slate-600 mb-1">Email</div>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>
          <button className="btn" onClick={submit} disabled={busy || !email}>
            {busy ? "Submitting..." : "Submit Survey"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, grouped, answers, setA }) {
  const areas = Object.keys(grouped || {});
  return (
    <div className="glass noise p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-2xl font-semibold text-slate-900">{title}</div>
        <div className="text-slate-600 text-sm">Satisfaction slider: 0–2 Low, 3 Acceptable, 4–5 High</div>
      </div>

      {areas.map((area) => (
        <div
          key={area}
          className={
            "rounded-3xl overflow-hidden ring-1 " +
            (SECTION_COLORS[area] || "ring-black/10 bg-white/40")
          }
        >
          <div className="px-4 py-3 bg-black/5 flex items-center justify-between">
            <div className="font-semibold text-slate-900">{area}</div>
          </div>

          <div className="divide-y divide-black/10">
            {(grouped[area] || []).map((q) => {
              const a = answers[q.code] || { relevant: true, satisfaction: 3, importance: "MEDIUM" };
              return (
                <div
                  key={q.code}
                  className="p-4 grid lg:grid-cols-12 gap-3 relative"
                >
                  <div
                    className={
                      "absolute left-0 top-3 bottom-3 w-1 rounded-full shadow-sm " +
                      (SECTION_ACCENT[area] || "bg-slate-300")
                    }
                  ></div>
                  <div className="lg:col-span-6">
                    <div className="text-xs text-slate-600">{q.code}</div>
                    <div className="font-medium text-slate-900">{q.text}</div>
                  </div>

                  <div className="lg:col-span-2">
                    <div className="text-xs text-slate-600 mb-1">Relevant</div>
                    <select
                      className="select"
                      value={a.relevant ? "Y" : "N"}
                      onChange={(e) => setA(q.code, { relevant: e.target.value === "Y" })}
                    >
                      <option value="Y">Yes</option>
                      <option value="N">No</option>
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <div className="text-xs text-slate-600 mb-1">Importance</div>
                    <select
                      className="select"
                      disabled={!a.relevant}
                      value={a.importance || ""}
                      onChange={(e) => setA(q.code, { importance: e.target.value })}
                    >
                      <option value="">Select</option>
                      {IMPORTANCE.map((x) => (
                        <option key={x} value={x}>{x}</option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <div className="text-xs text-slate-600 mb-1">Satisfaction</div>
                    <Slider value={a.satisfaction} disabled={!a.relevant} onChange={(v) => setA(q.code, { satisfaction: v })} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
