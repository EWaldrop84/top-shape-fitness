import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

interface PayrollRow {
  id: string;
  session_date: string;
  duration_minutes: number;
  hours: number;
  color_code: "tomato" | "charcoal" | null;
  notes: string | null;
  trainer_id: string;
  trainerName: string;
  trainerColor: string;
  clientName: string;
  start_time: string;
}

interface TrainerGroup {
  trainer_id: string;
  trainerName: string;
  trainerColor: string;
  rows: PayrollRow[];
  totalSessions: number;
  totalHours: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const sun = new Date(d);
  sun.setDate(d.getDate() - day);
  sun.setHours(0, 0, 0, 0);
  return sun;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtHours(h: number): string {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(2)}h`;
}

const TRAINER_PALETTE: Record<string, string> = {
  cyan: "#06A29E", banana: "#F6C026", grape: "#8B5CF6", basil: "#16A34A", tomato: "#F97316",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminPayroll() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const weekEnd = addDays(weekStart, 6);
  const weekLabel = `${fmtDate(isoDate(weekStart))} – ${fmtDate(isoDate(weekEnd))}`;

  // ── Fetch payroll_sessions for the selected week ─────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payroll_sessions")
      .select(`
        id, session_date, duration_minutes, hours, color_code, notes, trainer_id,
        trainers!trainer_id(display_color, users!trainers_user_id_fkey(first_name, last_name)),
        appointments!appointment_id(start_time, clients!client_id(users!clients_user_id_fkey(first_name, last_name)))
      `)
      .gte("session_date", isoDate(weekStart))
      .lte("session_date", isoDate(weekEnd))
      .order("session_date");

    console.log("[Payroll] fetchData", {
      weekStart: isoDate(weekStart),
      weekEnd: isoDate(weekEnd),
      rowCount: data?.length ?? 0,
      error,
      rawData: data,
    });

    const parsed: PayrollRow[] = (data ?? []).map((r: any) => {
      const tu = r.trainers?.users ?? {};
      const cu = r.appointments?.clients?.users ?? {};
      return {
        id: r.id,
        session_date: r.session_date,
        duration_minutes: r.duration_minutes,
        hours: Number(r.hours),
        color_code: r.color_code,
        notes: r.notes,
        trainer_id: r.trainer_id,
        trainerName: [tu.first_name, tu.last_name].filter(Boolean).join(" ") || "Unknown Trainer",
        trainerColor: r.trainers?.display_color ?? "cyan",
        clientName: [cu.first_name, cu.last_name].filter(Boolean).join(" ") || "Unknown Client",
        start_time: r.appointments?.start_time ?? "00:00",
      };
    });

    setRows(parsed);
    setLoading(false);
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Sync completed appointments → payroll_sessions (direct Supabase, no API server) ──
  async function syncPayroll() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const weekStartISO = isoDate(weekStart);
      const weekEndISO   = isoDate(weekEnd);

      // Step 1: fetch completed appointments in the week
      const { data: appointments, error: apptErr } = await supabase
        .from("appointments")
        .select("id, trainer_id, appointment_date, duration_minutes")
        .eq("status", "completed")
        .gte("appointment_date", weekStartISO)
        .lte("appointment_date", weekEndISO);

      console.log("[Payroll] sync — appointments query", { weekStartISO, weekEndISO, count: appointments?.length ?? 0, apptErr });

      if (apptErr) { setSyncMsg("Error fetching appointments: " + apptErr.message); return; }
      if (!appointments || appointments.length === 0) {
        setSyncMsg("No completed sessions found for this week.");
        return;
      }

      // Step 2: find already-synced appointment_ids for this pay period
      const { data: existing, error: existErr } = await supabase
        .from("payroll_sessions")
        .select("appointment_id")
        .eq("pay_period_start", weekStartISO)
        .eq("pay_period_end", weekEndISO);

      if (existErr) { setSyncMsg("Error checking existing records: " + existErr.message); return; }

      const existingIds = new Set((existing ?? []).map((r: { appointment_id: string }) => r.appointment_id));

      // Step 3: filter out duplicates and build insert rows
      const toInsert = appointments
        .filter((a) => !existingIds.has(a.id))
        .map((a) => ({
          appointment_id:   a.id,
          trainer_id:       a.trainer_id,
          session_date:     a.appointment_date,
          duration_minutes: a.duration_minutes,
          hours:            Number((a.duration_minutes / 60).toFixed(2)),
          pay_period_start: weekStartISO,
          pay_period_end:   weekEndISO,
          color_code:       "tomato",
        }));

      console.log("[Payroll] sync — toInsert", { total: appointments.length, alreadyExist: existingIds.size, newRows: toInsert.length });

      if (toInsert.length === 0) {
        setSyncMsg("All sessions already synced.");
        await fetchData();
        return;
      }

      // Step 4: insert
      const { error: insertErr } = await supabase.from("payroll_sessions").insert(toInsert);
      if (insertErr) { setSyncMsg("Insert failed: " + insertErr.message); return; }

      setSyncMsg(`Synced ${toInsert.length} session${toInsert.length === 1 ? "" : "s"}.`);
      await fetchData();
    } finally {
      setSyncing(false);
    }
  }

  // ── Group by trainer ─────────────────────────────────────────────────────
  const trainerGroups: TrainerGroup[] = [];
  const trainerMap = new Map<string, TrainerGroup>();
  for (const row of rows) {
    if (!trainerMap.has(row.trainer_id)) {
      const group: TrainerGroup = {
        trainer_id: row.trainer_id,
        trainerName: row.trainerName,
        trainerColor: row.trainerColor,
        rows: [],
        totalSessions: 0,
        totalHours: 0,
      };
      trainerMap.set(row.trainer_id, group);
      trainerGroups.push(group);
    }
    const g = trainerMap.get(row.trainer_id)!;
    g.rows.push(row);
    g.totalSessions++;
    g.totalHours = Number((g.totalHours + row.hours).toFixed(2));
  }
  const grandSessions = trainerGroups.reduce((s, g) => s + g.totalSessions, 0);
  const grandHours = Number(trainerGroups.reduce((s, g) => s + g.totalHours, 0).toFixed(2));

  // ── CSV export ───────────────────────────────────────────────────────────
  function exportCSV() {
    const header = ["Trainer", "Date", "Time", "Client", "Duration (min)", "Hours", "Status", "Notes"];
    const lines = [header.join(",")];
    for (const g of trainerGroups) {
      for (const r of g.rows) {
        const status = r.color_code === "tomato" ? "Payment Due" : r.color_code === "charcoal" ? "Paid Cancellation" : "Completed";
        lines.push([
          `"${g.trainerName}"`,
          r.session_date,
          fmtTime(r.start_time),
          `"${r.clientName}"`,
          r.duration_minutes,
          r.hours,
          status,
          `"${r.notes ?? ""}"`,
        ].join(","));
      }
    }
    lines.push(["", "", "", "TOTAL", "", grandHours, "", ""].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payroll_${isoDate(weekStart)}_to_${isoDate(weekEnd)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Row color ────────────────────────────────────────────────────────────
  function rowStyle(colorCode: "tomato" | "charcoal" | null): string {
    if (colorCode === "tomato") return "bg-red-50 border-l-2 border-red-400";
    if (colorCode === "charcoal") return "bg-gray-100 border-l-2 border-gray-400 text-gray-500";
    return "bg-white";
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 md:p-6 overflow-y-auto">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* Prev week */}
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-500"
            title="Previous week"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-[#2A255D] min-w-[180px] text-center">{weekLabel}</span>
          {/* Next week */}
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-500"
            title="Next week"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="ml-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50 transition"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          {syncMsg && (
            <span className="text-xs text-[#06A29E] font-medium">{syncMsg}</span>
          )}
          <button
            onClick={syncPayroll}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#06A29E]/40 text-[#06A29E] text-xs font-medium hover:bg-[#06A29E]/5 transition disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
            {syncing ? "Syncing…" : "Sync Sessions"}
          </button>
          <button
            onClick={exportCSV}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2A255D] text-white text-xs font-medium hover:bg-[#2A255D]/90 transition disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> Payment due
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gray-400 inline-block" /> Paid cancellation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-white border border-gray-200 inline-block" /> Completed
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#06A29E] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
          <div className="w-12 h-12 rounded-xl bg-[#2A255D]/8 flex items-center justify-center">
            <svg className="w-6 h-6 text-[#2A255D]/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#2A255D]">No payroll records for this week</p>
          <p className="text-xs text-gray-400 max-w-xs">
            Click <strong>Sync Sessions</strong> to generate payroll records from completed appointments.
          </p>
        </div>
      )}

      {/* Trainer groups */}
      {!loading && trainerGroups.length > 0 && (
        <div className="space-y-6">
          {trainerGroups.map((group) => {
            const accent = TRAINER_PALETTE[group.trainerColor] ?? TRAINER_PALETTE.cyan;
            return (
              <div key={group.trainer_id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Trainer header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100"
                  style={{ borderLeftColor: accent, borderLeftWidth: 3 }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
                    <span className="font-semibold text-sm text-[#2A255D]">{group.trainerName}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span><span className="font-semibold text-[#2A255D]">{group.totalSessions}</span> sessions</span>
                    <span><span className="font-semibold text-[#2A255D]">{fmtHours(group.totalHours)}</span> total</span>
                  </div>
                </div>

                {/* Session rows */}
                <div className="divide-y divide-gray-50">
                  {/* Column headers */}
                  <div className="grid grid-cols-[90px_1fr_80px_60px_80px] gap-2 px-4 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                    <span>Date</span>
                    <span>Client</span>
                    <span>Time</span>
                    <span className="text-right">Min</span>
                    <span className="text-right">Hours</span>
                  </div>
                  {group.rows.map((row) => (
                    <div
                      key={row.id}
                      className={`grid grid-cols-[90px_1fr_80px_60px_80px] gap-2 px-4 py-2.5 text-xs items-center ${rowStyle(row.color_code)}`}
                    >
                      <span className="text-gray-600 font-medium">{fmtDate(row.session_date)}</span>
                      <span className="text-gray-800 truncate">{row.clientName}</span>
                      <span className="text-gray-500">{fmtTime(row.start_time)}</span>
                      <span className="text-right text-gray-600">{row.duration_minutes}</span>
                      <span className="text-right font-semibold text-[#2A255D]">{fmtHours(row.hours)}</span>
                    </div>
                  ))}

                  {/* Trainer summary row */}
                  <div className="grid grid-cols-[90px_1fr_80px_60px_80px] gap-2 px-4 py-2.5 bg-gray-50 text-xs font-semibold text-[#2A255D]">
                    <span>Subtotal</span>
                    <span>{group.totalSessions} sessions</span>
                    <span />
                    <span />
                    <span className="text-right">{fmtHours(group.totalHours)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Grand total */}
          <div className="bg-[#2A255D] rounded-xl px-5 py-4 flex items-center justify-between text-white">
            <span className="font-bold text-sm">Grand Total</span>
            <div className="flex items-center gap-6 text-sm">
              <span><span className="font-bold">{grandSessions}</span> <span className="text-white/60">sessions</span></span>
              <span><span className="font-bold">{fmtHours(grandHours)}</span> <span className="text-white/60">hours</span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
