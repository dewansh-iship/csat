import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, Link, useNavigate } from "react-router-dom";
import { getJSON } from "../api";

function clamp(n,a,b){ return Math.max(a, Math.min(b, Number(n)||0)); }

function mapToLabel0to5(v) {
  const n = clamp(v,0,5);
  if (n <= 2) return "Low";
  if (n === 3) return "Acceptable";
  return "High";
}

function fileUrl(file_path) {
  if (!file_path) return null;
  const base = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  return `${base}${file_path}`;
}

export default function AdminView() {
  const { id } = useParams();
  const loc = useLocation();
  const nav = useNavigate();
  const token = (loc.state && loc.state.token) || localStorage.getItem("admin_token") || "";

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await getJSON(`/admin/submissions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        setData(res);
      } catch (e) {
        setErr(e.message);
      }
    })();
  }, [id]);

  const byCode = useMemo(() => {
    const m = new Map();
    for (const a of (data?.answers || [])) m.set(a.code, a);
    return m;
  }, [data]);

  if (!token) {
    return (
      <div className="glass p-6">
        <div className="font-semibold">Missing admin token</div>
        <Link className="btn2 mt-3 inline-block" to="/admin">Go to Login</Link>
      </div>
    );
  }

  if (err) return <div className="glass p-6">Error: {err}</div>;
  if (!data) return <div className="glass p-6">Loading...</div>;

  const s = data.scores || {};
  return (
    <div className="space-y-4">
      <div className="glass p-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-2xl font-semibold text-slate-900">Submission #{data.id}</div>
          <div className="text-slate-600 text-sm">{data.email} • {new Date(data.created_at).toLocaleString()}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn2" onClick={() => nav(-1)}>Back</button>
          <Link className="btn2" to="/admin">Dashboard</Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="kpi p-5">
          <div className="text-slate-600 text-sm">Overall</div>
          <div className="text-3xl font-semibold text-slate-900">{(s.overall||0).toFixed(2)}%</div>
        </div>
        <div className="kpi p-5">
          <div className="text-slate-600 text-sm">Onboard</div>
          <div className="text-3xl font-semibold text-slate-900">{(s.onboard||0).toFixed(2)}%</div>
        </div>
        <div className="kpi p-5">
          <div className="text-slate-600 text-sm">Ashore</div>
          <div className="text-3xl font-semibold text-slate-900">{(s.ashore||0).toFixed(2)}%</div>
        </div>
      </div>

      <div className="glass p-6 space-y-4">
        <div>
          <div className="font-semibold text-slate-900">Remark</div>
          <div className="text-slate-700 text-sm whitespace-pre-wrap mt-2">
            {data.remark ? data.remark : "—"}
          </div>
        </div>

        <div>
          <div className="font-semibold text-slate-900">Attachment</div>
          {data.file_path ? (
            <a
              className="btn2 inline-flex mt-2"
              href={fileUrl(data.file_path)}
              target="_blank"
              rel="noreferrer"
            >
              Open / Download
            </a>
          ) : (
            <div className="text-slate-500 text-sm mt-2">—</div>
          )}
        </div>
      </div>

      <div className="glass p-6">
        <div className="font-semibold text-slate-900 mb-3">Meta</div>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          {Object.entries(data.meta || {}).map(([k,v]) => (
            <div key={k} className="p-3 rounded-2xl border border-black/10 bg-white/60">
              <div className="text-slate-600 text-xs">{k}</div>
              <div className="font-semibold">{String(v || "")}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass p-6">
        <div className="font-semibold text-slate-900 mb-3">Answers</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-600">
              <tr>
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Question</th>
                <th className="text-left p-2">Relevant</th>
                <th className="text-left p-2">Importance</th>
                <th className="text-left p-2">Slider</th>
                <th className="text-left p-2">Label</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              {data.questions.map(q => {
                const a = byCode.get(q.code) || {};
                return (
                  <tr key={q.code} className="hover:bg-black/5">
                    <td className="p-2 font-semibold">{q.code}</td>
                    <td className="p-2">{q.text}</td>
                    <td className="p-2">{a.relevant ? "Yes" : "No"}</td>
                    <td className="p-2">{a.importance || "-"}</td>
                    <td className="p-2">{a.satisfaction ?? "-"}</td>
                    <td className="p-2">{a.satisfaction === undefined ? "-" : mapToLabel0to5(a.satisfaction)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass p-6">
        <div className="font-semibold text-slate-900 mb-2">Breakdown by Service Area</div>
        <div className="grid md:grid-cols-2 gap-3">
          {Object.entries(s.breakdown || {}).map(([k,v]) => (
            <div key={k} className="p-4 rounded-3xl border border-black/10 bg-white/60">
              <div className="text-slate-600 text-xs">{v.section}</div>
              <div className="font-semibold text-slate-900">{k}</div>
              <div className="text-2xl font-semibold mt-1">{(v.percent||0).toFixed(2)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
