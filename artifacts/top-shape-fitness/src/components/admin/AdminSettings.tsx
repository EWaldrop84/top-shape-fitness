import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminSettings() {
  // Backfill state
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  // Clear payroll state
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillResult(null);
    setBackfillError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/backfill-recurring", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json() as { series_linked?: number; sessions_generated?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setBackfillResult(
        `Done — ${json.sessions_generated ?? 0} new session${(json.sessions_generated ?? 0) !== 1 ? "s" : ""} generated`
      );
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBackfilling(false);
    }
  }

  async function handleClearPayroll() {
    setClearing(true);
    setClearResult(null);
    setClearError(null);
    try {
      const { error } = await supabase.from("payroll_sessions").delete().not("id", "is", null);
      if (error) throw new Error(error.message);
      setClearResult("All payroll session records deleted.");
    } catch (err) {
      setClearError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  return (
    <main className="flex-1 p-4 md:p-6 overflow-y-auto">
      <div className="max-w-xl space-y-5">

        {/* ── Recurring Sessions ────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-[#2A255D] tracking-wide uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>
              Recurring Sessions
            </h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              Generate the next 52 weeks of future occurrences for all existing recurring sessions.
              Run this once after importing sessions from Google Calendar.
            </p>
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#06A29E] hover:bg-[#05918d] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition"
            >
              {backfilling ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                  </svg>
                  Generate Future Sessions
                </>
              )}
            </button>
            {backfillResult && (
              <p className="text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2.5">
                ✓ {backfillResult}
              </p>
            )}
            {backfillError && (
              <p className="text-xs font-medium text-red-700 bg-red-50 rounded-lg px-3 py-2.5">
                {backfillError}
              </p>
            )}
          </div>
        </section>

        {/* ── Database ──────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-[#2A255D] tracking-wide uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>
              Database
            </h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            {!confirmClear ? (
              <button
                onClick={() => { setConfirmClear(true); setClearResult(null); setClearError(null); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium transition"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
                Clear All Payroll Sessions
              </button>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                <p className="text-xs text-red-700 leading-relaxed font-medium">
                  This will delete all payroll session records. Appointments are not affected. Continue?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClearPayroll}
                    disabled={clearing}
                    className="flex-1 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold transition"
                  >
                    {clearing ? "Deleting…" : "Yes, Delete All"}
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    disabled={clearing}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {clearResult && (
              <p className="text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2.5">
                ✓ {clearResult}
              </p>
            )}
            {clearError && (
              <p className="text-xs font-medium text-red-700 bg-red-50 rounded-lg px-3 py-2.5">
                {clearError}
              </p>
            )}
          </div>
        </section>

        {/* ── App Info ──────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-[#2A255D] tracking-wide uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>
              App Info
            </h2>
          </div>
          <div className="px-5 py-4">
            <dl className="space-y-3">
              {[
                { label: "App version", value: "1.0.0" },
                { label: "Supabase project", value: "nhaescbzxxgowflgrgll" },
                { label: "Environment", value: "Production" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-xs text-gray-400">{label}</dt>
                  <dd className="text-xs font-medium text-[#2A255D]" style={{ fontFamily: "'DM Mono', monospace" }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

      </div>
    </main>
  );
}
