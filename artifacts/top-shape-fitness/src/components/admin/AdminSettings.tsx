import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface ReconcileRow {
  client_package_id: string;
  owner_name: string;
  package_name: string;
  old_sessions_used: number;
  old_sessions_remaining: number;
  new_sessions_used: number;
  new_sessions_remaining: number;
  delta: number;
}

export default function AdminSettings() {
  // ── Recurring Sessions state ──────────────────────────────────────────────
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  // ── Database state ────────────────────────────────────────────────────────
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);

  // ── Calendar Sync state ───────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ found: number; inserted: number; skipped: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ── Reconcile state ───────────────────────────────────────────────────────
  const [reconciling, setReconciling] = useState(false);
  const [reconcileRows, setReconcileRows] = useState<ReconcileRow[] | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [applyingReconcile, setApplyingReconcile] = useState(false);
  const [reconcileDone, setReconcileDone] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

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

  async function handleCalendarSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/sync-calendar", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json() as { found?: number; inserted?: number; skipped?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      setSyncResult({ found: json.found ?? 0, inserted: json.inserted ?? 0, skipped: json.skipped ?? 0 });
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSyncing(false);
    }
  }

  async function handleReconcilePreview() {
    setReconciling(true);
    setReconcileRows(null);
    setReconcileError(null);
    setReconcileDone(null);
    try {
      // 1. All active client_packages
      const { data: packages, error: pkgErr } = await supabase
        .from("client_packages")
        .select(`
          id, sessions_total, sessions_used, sessions_remaining, purchase_date, owner_client_id,
          packages!package_id(name),
          clients!owner_client_id(users!clients_user_id_fkey(first_name, last_name))
        `)
        .eq("is_active", true);
      if (pkgErr) throw new Error(pkgErr.message);

      const pkgList = (packages ?? []) as any[];
      const pkgIds = pkgList.map((p) => p.id);

      // 2. Shared members per package
      const { data: shares } = await supabase
        .from("client_package_shares")
        .select("client_package_id, shared_client_id")
        .in("client_package_id", pkgIds.length > 0 ? pkgIds : ["__none__"]);

      // 3. Build package → [client_ids] map
      const pkgClientMap = new Map<string, string[]>();
      for (const pkg of pkgList) {
        pkgClientMap.set(pkg.id, [pkg.owner_client_id]);
      }
      for (const share of (shares ?? []) as any[]) {
        const arr = pkgClientMap.get(share.client_package_id) ?? [];
        arr.push(share.shared_client_id);
        pkgClientMap.set(share.client_package_id, arr);
      }

      // 4. All completed appointments for all relevant clients
      const allClientIds = [...new Set([...pkgClientMap.values()].flat())];
      const { data: appts } = await supabase
        .from("appointments")
        .select("client_id, appointment_date")
        .in("client_id", allClientIds.length > 0 ? allClientIds : ["__none__"])
        .eq("status", "completed");

      const apptList = (appts ?? []) as { client_id: string; appointment_date: string }[];

      // 5. Compute expected counts and build diff rows
      const rows: ReconcileRow[] = [];
      for (const pkg of pkgList) {
        const clientIds = pkgClientMap.get(pkg.id) ?? [];
        const purchaseDate = pkg.purchase_date ?? "2000-01-01";
        const count = apptList.filter(
          (a) => clientIds.includes(a.client_id) && a.appointment_date >= purchaseDate,
        ).length;
        const newUsed = count;
        const newRemaining = Math.max(0, pkg.sessions_total - newUsed);
        const delta = newUsed - (pkg.sessions_used as number);
        if (delta === 0) continue;
        const u = pkg.clients?.users;
        const ownerName = [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "Unknown";
        rows.push({
          client_package_id: pkg.id,
          owner_name: ownerName,
          package_name: pkg.packages?.name ?? "Package",
          old_sessions_used: pkg.sessions_used,
          old_sessions_remaining: pkg.sessions_remaining,
          new_sessions_used: newUsed,
          new_sessions_remaining: newRemaining,
          delta,
        });
      }
      setReconcileRows(rows);
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setReconciling(false);
    }
  }

  async function handleReconcileApply() {
    if (!reconcileRows || reconcileRows.length === 0) return;
    setApplyingReconcile(true);
    setReconcileError(null);
    try {
      for (const row of reconcileRows) {
        const { error } = await supabase
          .from("client_packages")
          .update({ sessions_used: row.new_sessions_used, sessions_remaining: row.new_sessions_remaining })
          .eq("id", row.client_package_id);
        if (error) throw new Error(`${row.owner_name}: ${error.message}`);
      }
      setReconcileDone(`Applied ${reconcileRows.length} correction${reconcileRows.length !== 1 ? "s" : ""} successfully.`);
      setReconcileRows(null);
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setApplyingReconcile(false);
    }
  }

  // ── Spinner SVG helper ────────────────────────────────────────────────────
  const Spinner = () => (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );

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
              {backfilling ? <><Spinner />Generating…</> : (
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
            {backfillResult && <p className="text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2.5">✓ {backfillResult}</p>}
            {backfillError && <p className="text-xs font-medium text-red-700 bg-red-50 rounded-lg px-3 py-2.5">{backfillError}</p>}
          </div>
        </section>

        {/* ── Calendar & Credits ────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-[#2A255D] tracking-wide uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>
              Calendar & Credits
            </h2>
          </div>
          <div className="px-5 py-4 space-y-6">

            {/* ── Google Calendar Sync ───────────────────────────── */}
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-[#2A255D] mb-1">Sync Google Calendar → Supabase</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Pulls the next 52 weeks from each trainer's Google Calendar, matches events to clients by name,
                  and inserts missing appointments. Skips duplicates and block-time events.
                  Does <em>not</em> modify session credits.
                </p>
              </div>
              <button
                onClick={handleCalendarSync}
                disabled={syncing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1F73B1] hover:bg-[#1a62a0] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition"
              >
                {syncing ? <><Spinner />Syncing…</> : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                    Sync Google Calendar → Supabase
                  </>
                )}
              </button>
              {syncResult && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 space-y-0.5">
                  <p className="text-xs font-semibold text-emerald-700">✓ Sync complete</p>
                  <p className="text-xs text-emerald-600">
                    {syncResult.found} events scanned · {syncResult.inserted} inserted · {syncResult.skipped} skipped
                  </p>
                </div>
              )}
              {syncError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                  <p className="text-xs font-semibold text-red-700 mb-0.5">Sync failed</p>
                  <p className="text-xs text-red-600 break-words">{syncError}</p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100" />

            {/* ── Reconcile Session Credits ──────────────────────── */}
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-[#2A255D] mb-1">Reconcile Session Credits</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Recounts completed appointments per client (including shared-package members) since each
                  package's purchase date. Shows a before/after report for any packages where
                  sessions_used or sessions_remaining have drifted — requires a separate confirmation click before applying.
                </p>
              </div>

              {!reconcileRows ? (
                <button
                  onClick={handleReconcilePreview}
                  disabled={reconciling}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#2A255D] hover:bg-[#1e1a47] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition"
                >
                  {reconciling ? <><Spinner />Computing…</> : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                      Run Reconcile
                    </>
                  )}
                </button>
              ) : (
                <div className="space-y-3">
                  {reconcileRows.length === 0 ? (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                      <p className="text-xs font-semibold text-emerald-700">✓ All session credits are accurate — no corrections needed</p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-xs font-semibold text-amber-800">
                          {reconcileRows.length} package{reconcileRows.length !== 1 ? "s" : ""} need correction — review below, then confirm to apply
                        </p>
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-gray-100">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">Owner</th>
                              <th className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">Package</th>
                              <th className="text-center px-3 py-2 text-gray-400 font-medium whitespace-nowrap">Used (was→is)</th>
                              <th className="text-center px-3 py-2 text-gray-400 font-medium whitespace-nowrap">Δ</th>
                              <th className="text-center px-3 py-2 text-gray-400 font-medium whitespace-nowrap">Left (was→is)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {reconcileRows.map((row) => (
                              <tr key={row.client_package_id} className="bg-white hover:bg-gray-50/60">
                                <td className="px-3 py-2.5 font-medium text-[#2A255D] whitespace-nowrap">{row.owner_name}</td>
                                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{row.package_name}</td>
                                <td className="px-3 py-2.5 text-center tabular-nums whitespace-nowrap">
                                  <span className="text-gray-400">{row.old_sessions_used}</span>
                                  <span className="text-gray-300 mx-1.5">→</span>
                                  <span className="font-semibold text-[#2A255D]">{row.new_sessions_used}</span>
                                </td>
                                <td className="px-3 py-2.5 text-center font-bold tabular-nums whitespace-nowrap">
                                  <span className={row.delta > 0 ? "text-orange-600" : "text-emerald-600"}>
                                    {row.delta > 0 ? `+${row.delta}` : row.delta}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-center tabular-nums whitespace-nowrap">
                                  <span className="text-gray-400">{row.old_sessions_remaining}</span>
                                  <span className="text-gray-300 mx-1.5">→</span>
                                  <span className={`font-semibold ${row.new_sessions_remaining <= 2 ? "text-orange-600" : "text-[#2A255D]"}`}>
                                    {row.new_sessions_remaining}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleReconcileApply}
                          disabled={applyingReconcile}
                          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#2A255D] hover:bg-[#1e1a47] disabled:opacity-60 text-white text-xs font-semibold transition"
                        >
                          {applyingReconcile
                            ? "Applying…"
                            : `Confirm & Apply ${reconcileRows.length} Correction${reconcileRows.length !== 1 ? "s" : ""}`}
                        </button>
                        <button
                          onClick={() => { setReconcileRows(null); setReconcileError(null); setReconcileDone(null); }}
                          disabled={applyingReconcile}
                          className="px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-medium transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                  <button
                    onClick={handleReconcilePreview}
                    disabled={reconciling || applyingReconcile}
                    className="text-xs text-[#06A29E] hover:underline disabled:opacity-40 transition"
                  >
                    Re-run preview
                  </button>
                </div>
              )}

              {reconcileDone && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                  <p className="text-xs font-semibold text-emerald-700">✓ {reconcileDone}</p>
                </div>
              )}
              {reconcileError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                  <p className="text-xs text-red-600">{reconcileError}</p>
                </div>
              )}
            </div>
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
            {clearResult && <p className="text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2.5">✓ {clearResult}</p>}
            {clearError && <p className="text-xs font-medium text-red-700 bg-red-50 rounded-lg px-3 py-2.5">{clearError}</p>}
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
