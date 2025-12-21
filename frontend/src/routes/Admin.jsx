import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getJSON, postJSON } from "../api";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

function clamp(n, a, b){ return Math.max(a, Math.min(b, Number(n)||0)); }
function fmtDate(ms){ try { return new Date(ms).toLocaleDateString(); } catch { return ""; } }

function pct(v){ return `${(Number(v)||0).toFixed(0)}%`; }

function overallBucket(v){
  const n = clamp(v, 0, 100);
  // Keep it intuitive for admin
  if (n < 40) return "Low";
  if (n < 70) return "Acceptable";
  return "High";
}

function Donut({ values }) {
  const data = [
    { name: "Low", value: values.filter(v => overallBucket(v) === "Low").length },
    { name: "Acceptable", value: values.filter(v => overallBucket(v) === "Acceptable").length },
    { name: "High", value: values.filter(v => overallBucket(v) === "High").length },
  ].filter(d => d.value > 0);

  const COLORS = ["#ef4444", "#eab308", "#22c55e"]; // subtle semantic

  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
            {data.map((_, idx) => (
              <Cell key={`c-${idx}`} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeekdayBars({ items }) {
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const counts = new Array(7).fill(0);
  for (const it of items) {
    const d = new Date(it.created_at);
    counts[d.getDay()] += 1;
  }
  const data = days.map((day, i) => ({ day, count: counts[i] }));

  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Sparkline({ data }) {
    const safe = Array.isArray(data) ? data.filter(d => d && typeof d.overall !== "undefined") : [];
  const hasEnough = safe.length >= 2;

  const CustomTip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const v = payload[0]?.value;
    return (
      <div className="rounded-2xl border border-black/10 bg-white/80 backdrop-blur-xl px-3 py-2 shadow-lg">
        <div className="text-[11px] text-slate-600">{label || ""}</div>
        <div className="text-sm font-semibold text-slate-900">Overall: {pct(v)}</div>
      </div>
    );
  };

  return (
        <div className="rounded-3xl border border-black/10 bg-white/50 backdrop-blur-xl p-4">
      {!hasEnough ? (
        <div className="h-24 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-600">Not enough data yet</div>
            <div className="text-lg font-semibold text-slate-900">Submit 2+ surveys</div>
          </div>
          <div className="text-3xl font-semibold text-slate-900">
            {safe.length ? pct(safe[safe.length - 1].overall) : "—"}
          </div>
        </div>
      ) : (
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={safe} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
              <Tooltip content={<CustomTip />} cursor={{ strokeDasharray: "3 3" }} />
              {/* subtle baseline grid */}
              <CartesianGrid vertical={false} strokeDasharray="3 6" />
              <Line
                type="monotone"
                dataKey="overall"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      className={"px-4 py-2 rounded-2xl font-semibold border transition " + (active
        ? "bg-slate-900 text-white border-slate-900"
        : "bg-white/60 text-slate-900 border-black/10 hover:bg-white")}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function Histogram({ values }) {
  const bins = 10;
  const counts = new Array(bins).fill(0);
  for (const v0 of values) {
    const v = clamp(v0, 0, 100);
    const idx = Math.min(bins - 1, Math.floor(v / 10));
    counts[idx] += 1;
  }
  const data = counts.map((c, i) => ({ bin: `${i*10}-${i*10+9}`, count: c }));
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bin" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem("admin_token") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [items, setItems] = useState([]);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("overview");

  async function login() {
    try {
      const res = await postJSON("/admin/login", { email, password });
      localStorage.setItem("admin_token", res.token);
      setToken(res.token);
      await load(res.token);
    } catch (e) {
      alert(e.message);
    }
  }

  async function load(t = token) {
    if (!t) return;
    setLoading(true);
    try {
      const res = await getJSON("/admin/submissions", { headers: { Authorization: `Bearer ${t}` } });
      setItems(res.items || []);
      const s = await getJSON("/admin/stats", { headers: { Authorization: `Bearer ${t}` } });
      setSeries(s.series || []);
    } catch (e) {
      alert(e.message);
      localStorage.removeItem("admin_token");
      setToken("");
    } finally {
      setLoading(false);
    }
  }

  async function deleteSubmission(id) {
    if (!id) return;
    const ok = window.confirm("Delete this submission? This cannot be undone.");
    if (!ok) return;

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/admin/submissions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Delete failed");

      // Optimistic UI update
      setItems((prev) => prev.filter((x) => x.id !== id));
      // refresh stats/series to keep charts consistent
      await load(token);
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  }

  function logout() {
    localStorage.removeItem("admin_token");
    setToken("");
    setItems([]);
    setSeries([]);
  }

  useEffect(() => { if (token) load(token); }, []);

  if (!token) {
    return (
      <div className="max-w-xl mx-auto glass p-6 space-y-3">
        <div className="text-2xl font-semibold text-slate-900">Admin Login</div>
        <div className="text-slate-600 text-sm">Use credentials from backend/.env</div>
        <div>
          <div className="text-xs text-slate-600 mb-1">Email</div>
          <input className="input" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-slate-600 mb-1">Password</div>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <button className="btn" onClick={login} disabled={!email || !password}>Login</button>
      </div>
    );
  }

  const kpis = useMemo(() => {
    const n = items.length;
    const avg = n ? items.reduce((s, x) => s + (x.scores?.overall || 0), 0) / n : 0;
    const avgOn = n ? items.reduce((s, x) => s + (x.scores?.onboard || 0), 0) / n : 0;
    const avgAs = n ? items.reduce((s, x) => s + (x.scores?.ashore || 0), 0) / n : 0;
    const best = n ? Math.max(...items.map(x => Number(x.scores?.overall) || 0)) : 0;
    const worst = n ? Math.min(...items.map(x => Number(x.scores?.overall) || 0)) : 0;

    const dist = items.map(x => Number(x.scores?.overall) || 0);

    const trend = series.map(p => ({
      date: fmtDate(p.t),
      overall: p.overall,
      onboard: p.onboard,
      ashore: p.ashore
    }));

    return { n, avg, avgOn, avgAs, best, worst, dist, trend };
  }, [items, series]);

  return (
    <div className="space-y-4">
      <div className="glass p-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-2xl font-semibold text-slate-900">Admin Dashboard</div>
          <div className="text-slate-600 text-sm">
            Submissions: {kpis.n} • Avg Overall: {kpis.avg.toFixed(2)}% • Logged in
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn2" onClick={() => load()}>Refresh</button>
          <button className="btn2" onClick={logout}>Logout</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabButton active={view === "overview"} onClick={() => setView("overview")}>Overview</TabButton>
        <TabButton active={view === "trends"} onClick={() => setView("trends")}>Trends</TabButton>
        <TabButton active={view === "distribution"} onClick={() => setView("distribution")}>Distribution</TabButton>
        <TabButton active={view === "insights"} onClick={() => setView("insights")}>Insights</TabButton>
        <TabButton active={view === "table"} onClick={() => setView("table")}>Table</TabButton>
      </div>

      {loading && <div className="glass p-6">Loading...</div>}

      {!loading && view === "overview" && (
        <>
          <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-3">
            <div className="kpi p-5">
              <div className="text-slate-600 text-sm">Average Overall</div>
              <div className="text-3xl font-semibold text-slate-900">{kpis.avg.toFixed(2)}%</div>
            </div>
            <div className="kpi p-5">
              <div className="text-slate-600 text-sm">Average Onboard</div>
              <div className="text-3xl font-semibold text-slate-900">{kpis.avgOn.toFixed(2)}%</div>
            </div>
            <div className="kpi p-5">
              <div className="text-slate-600 text-sm">Average Ashore</div>
              <div className="text-3xl font-semibold text-slate-900">{kpis.avgAs.toFixed(2)}%</div>
            </div>
            <div className="kpi p-5">
              <div className="text-slate-600 text-sm">Best / Worst</div>
              <div className="text-xl font-semibold text-slate-900">{kpis.best.toFixed(0)}% / {kpis.worst.toFixed(0)}%</div>
            </div>
          </div>

          <div className="chart p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-slate-900">Trend (All submissions)</div>
              <div className="text-slate-600 text-sm">Overall / Onboard / Ashore</div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={kpis.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Area type="monotone" dataKey="overall" />
                  <Area type="monotone" dataKey="onboard" />
                  <Area type="monotone" dataKey="ashore" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <div className="chart p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-slate-900">Quick Sparkline</div>
                <div className="text-slate-600 text-sm">Overall only</div>
              </div>
              <Sparkline data={kpis.trend} />
              <div className="text-slate-600 text-xs mt-2">Shows how overall score changes across submissions.</div>
            </div>

            <div className="chart p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-slate-900">Quality Split</div>
                <div className="text-slate-600 text-sm">Low / Acceptable / High</div>
              </div>
              <Donut values={kpis.dist} />
              <div className="text-slate-600 text-xs">Buckets based on overall % (Low&lt;40, Acceptable 40–69, High≥70).</div>
            </div>
          </div>
        </>
      )}

      {!loading && view === "trends" && (
        <div className="grid lg:grid-cols-2 gap-3">
          <div className="chart p-5">
            <div className="font-semibold text-slate-900 mb-2">Overall Trend</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={kpis.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Area type="monotone" dataKey="overall" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="chart p-5">
            <div className="font-semibold text-slate-900 mb-3">Latest Submissions</div>
            <div className="space-y-2">
              {items.slice(0, 12).map(it => (
                <div key={it.id} className="flex items-center justify-between p-3 rounded-2xl border border-black/10 bg-white/60">
                  <div className="text-sm">
                    <div className="font-semibold">{it.email}</div>
                    <div className="text-slate-600 text-xs">{new Date(it.created_at).toLocaleString()}</div>
                    <div className="text-slate-500 text-[11px] mt-1">
                      {it.remark ? "📝 Remark" : ""}{it.remark && it.file_path ? " • " : ""}{it.file_path ? "📎 Attachment" : ""}
                      {!it.remark && !it.file_path ? "—" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{(it.scores?.overall || 0).toFixed(0)}%</div>
                    <Link className="btn2" to={`/admin/view/${it.id}`} state={{ token }}>View</Link>
                    <button
                      className="btn2"
                      type="button"
                      onClick={() => deleteSubmission(it.id)}
                      title="Delete submission"
                      style={{ borderColor: "rgba(239,68,68,0.35)", color: "#b91c1c" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && view === "distribution" && (
        <div className="chart p-5">
          <div className="font-semibold text-slate-900 mb-2">Overall Distribution</div>
          <Histogram values={kpis.dist} />
          <div className="text-slate-600 text-xs mt-2">Buckets: 0–9, 10–19, …, 90–100</div>
        </div>
      )}

      {!loading && view === "insights" && (
        <div className="grid lg:grid-cols-2 gap-3">
          <div className="chart p-5">
            <div className="font-semibold text-slate-900 mb-2">Weekday Activity</div>
            <WeekdayBars items={items} />
            <div className="text-slate-600 text-xs mt-2">When users submit surveys (local time).</div>
          </div>

          <div className="chart p-5">
            <div className="font-semibold text-slate-900 mb-2">Submission Health</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="kpi p-4">
                <div className="text-slate-600 text-sm">Latest</div>
                <div className="text-2xl font-semibold text-slate-900">{items[0] ? pct(items[0].scores?.overall || 0) : "—"}</div>
                <div className="text-slate-600 text-xs">Most recent overall</div>
              </div>
              <div className="kpi p-4">
                <div className="text-slate-600 text-sm">Median</div>
                <div className="text-2xl font-semibold text-slate-900">{
                  kpis.dist.length
                    ? pct([...kpis.dist].sort((a,b)=>a-b)[Math.floor(kpis.dist.length/2)])
                    : "—"
                }</div>
                <div className="text-slate-600 text-xs">Typical overall</div>
              </div>
              <div className="kpi p-4">
                <div className="text-slate-600 text-sm">Low Count</div>
                <div className="text-2xl font-semibold text-slate-900">{kpis.dist.filter(v => overallBucket(v)==="Low").length}</div>
                <div className="text-slate-600 text-xs">Overall &lt; 40%</div>
              </div>
              <div className="kpi p-4">
                <div className="text-slate-600 text-sm">High Count</div>
                <div className="text-2xl font-semibold text-slate-900">{kpis.dist.filter(v => overallBucket(v)==="High").length}</div>
                <div className="text-slate-600 text-xs">Overall ≥ 70%</div>
              </div>
            </div>

            <div className="mt-4 p-4 rounded-2xl border border-black/10 bg-white/60">
              <div className="text-slate-600 text-xs">Tip</div>
              <div className="text-slate-900 font-semibold">Use Distribution + Quality Split to spot drift</div>
              <div className="text-slate-600 text-sm">If Low bucket rises, drill into the table and open the worst submissions.</div>
            </div>
          </div>
        </div>
      )}

      {!loading && view === "table" && (
        <div className="chart p-5 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-600">
              <tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Overall</th>
                <th className="text-left p-2">Onboard</th>
                <th className="text-left p-2">Ashore</th>
                <th className="text-left p-2">Remark</th>
                <th className="text-left p-2">Attachment</th>
                <th className="text-left p-2">Open</th>
                <th className="text-left p-2">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              {items.length ? items.map(it => (
                <tr key={it.id} className="hover:bg-black/5">
                  <td className="p-2">{new Date(it.created_at).toLocaleString()}</td>
                  <td className="p-2">{it.email}</td>
                  <td className="p-2 font-semibold">{(it.scores?.overall || 0).toFixed(0)}%</td>
                  <td className="p-2">{(it.scores?.onboard || 0).toFixed(0)}%</td>
                  <td className="p-2">{(it.scores?.ashore || 0).toFixed(0)}%</td>
                  <td className="p-2 text-slate-700">
                    {it.remark ? (it.remark.length > 60 ? it.remark.slice(0, 60) + "…" : it.remark) : "—"}
                  </td>
                  <td className="p-2">
                    {it.file_path ? (
                      <a
                        className="text-slate-900 underline"
                        href={`${import.meta.env.VITE_API_BASE}${it.file_path}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View File
                      </a>
                    ) : "—"}
                  </td>
                  <td className="p-2">
                    <Link className="btn2" to={`/admin/view/${it.id}`} state={{ token }}>View</Link>
                  </td>
                  <td className="p-2">
                    <button
                      className="btn2"
                      type="button"
                      onClick={() => deleteSubmission(it.id)}
                      style={{ borderColor: "rgba(239,68,68,0.35)", color: "#b91c1c" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td className="p-2" colSpan="9">No submissions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
