import React from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import Survey from "./Survey";
import Admin from "./Admin";
import AdminView from "./AdminView";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-white/50 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
  <img
    src="/logo.png"
    alt="UMMS"
    className="h-12 w-auto object-contain"
  />
  <div className="leading-tight">
    <div className="font-semibold tracking-tight">
      UMMS – CSAT Survey
    </div>
    <div className="text-xs text-slate-500">
      Version 1
    </div>
  </div>
</div>

          <div className="flex gap-2">
            <Link className="btn2" to="/survey">User</Link>
            <Link className="btn2" to="/admin">Admin</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/survey" replace />} />
          <Route path="/survey" element={<Survey />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/view/:id" element={<AdminView />} />
          <Route path="*" element={<Navigate to="/survey" replace />} />
        </Routes>
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-6 text-sm text-slate-500">
        © {new Date().getFullYear()} UMMS CSAT Survey • Version 1 - Copyrights Reserved @UMMS
      </footer>
    </div>
  );
}
