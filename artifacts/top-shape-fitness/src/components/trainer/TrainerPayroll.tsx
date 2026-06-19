import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { PayrollSession } from "@/types";

interface TrainerPayrollProps {
  trainerId: string;
}

function getWeekStart(d: Date): Date {
  const result = new Date(d);
  result.setDate(result.getDate() - result.getDay());
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

const COLOR_STYLE = {
  tomato:   { bg: "bg-red-50",   border: "border-l-red-400",   text: "text-red-700",   label: "Payment Due" },
  charcoal: { bg: "bg-gray-100", border: "border-l-gray-400",  text: "text-gray-600",  label: "Paid Cancel" },
  default:  { bg: "bg-white",    border: "border-l-gray-200",  text: "text-gray-500",  label: "" },
};

export default function TrainerPayroll({ trainerId }: TrainerPayrollProps) {
  const today = new Date();
  const currentWeekStart = getWeekStart(today);

  const [showPrev, setShowPrev] = useState(false);
  const [sessions, setSessions] = useState<PayrollSession[]>([]);
  const [loading, setLoading] = useState(true);

  const weekStart = showPrev ? addDays(currentWeekStart, -7) : currentWeekStart;
  const weekEnd = addDays(weekStart, 6);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const periodStart = isoDate(weekStart);

    const { data: rawSessions } = await supabase
      .from("payroll_sessions")
      .select("id, appointment_id, trainer_id, session_date, duration_minutes, hours, pay_period_start, pay_period_end, color_code, notes")
      .eq("trainer_id", trainerId)
      .eq("pay_period_start", periodStart)
      .order("session_date", { ascending: true });

    const sessionRows = (rawSessions ?? []) as PayrollSession[];

    if (sessionRows.length === 0) {
      setSessions([]);
      setLoading(false);
      return;
    }

    // Resolve client names via appointment → client → user chain
    const appointmentIds = sessionRows.map((s) => s.appointment_id);

    const { data: appts } = await supabase
      .from("appointments")
      .select("id, client_id")
      .in("id", appointmentIds);

    const apptMap = new Map((appts ?? []).map((a: any) => [a.id, a.client_id]));
    const clientIds = [...new Set((appts ?? []).map((a: any) => a.client_id))];

    const { data: clients } = await supabase
      .from("clients")
      .select("id, user_id")
      .in("id", clientIds);

    const clientToUser = new Map((clients ?? []).map((c: any) => [c.id, c.user_id]));
    const userIds = [...new Set((clients ?? []).map((c: any) => c.user_id))];

    const { data: users } = await supabase
      .from("users")
      .select("id, first_name, last_name")
      .in("id", userIds);

    const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

    const enriched: PayrollSession[] = sessionRows.map((s) => {
      const clientId = apptMap.get(s.appointment_id);
      const userId = clientId ? clientToUser.get(clientId) : null;
      const user = userId ? (userMap.get(userId) as any) : null;
      const clientName = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || "Client" : "Client";
      return { ...s, clientName };
    });

    setSessions(enriched);
    setLoading(false);
  }, [trainerId, weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalHours = sessions.reduce((sum, s) => sum + Number(s.hours), 0);
  const totalMinutes = sessions.reduce((sum, s) => sum + s.duration_minutes, 0);

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-bold text-[#2A255D]">My Payroll</h2>
          <p className="text-xs text-gray-400 mt-0.5">{formatDateRange(weekStart, weekEnd)}</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setShowPrev(false)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${!showPrev ? "bg-white text-[#2A255D] shadow-sm" : "text-gray-500"}`}
          >
            This week
          </button>
          <button
            onClick={() => setShowPrev(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${showPrev ? "bg-white text-[#2A255D] shadow-sm" : "text-gray-500"}`}
          >
            Last week
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-[#2A255D]">{sessions.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Sessions</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-[#06A29E]">{totalHours.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total Hours</p>
        </div>
      </div>

      {/* Session list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-6 h-6 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 font-medium">No payroll sessions</p>
          <p className="text-xs text-gray-400 mt-1">No records for this pay period yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const colorKey = session.color_code ?? "default";
            const style = COLOR_STYLE[colorKey as keyof typeof COLOR_STYLE] ?? COLOR_STYLE.default;
            return (
              <div key={session.id} className={`rounded-xl border border-l-4 ${style.border} border-gray-100 ${style.bg} px-4 py-3 shadow-sm`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#2A255D] text-sm">{session.clientName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatDate(session.session_date)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-[#2A255D]">{Number(session.hours).toFixed(2)} hrs</p>
                    <p className="text-[11px] text-gray-400">{session.duration_minutes} min</p>
                  </div>
                </div>
                {(session.color_code || session.notes) && (
                  <div className="flex items-center gap-2 mt-2">
                    {session.color_code && (
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text} border border-current/10`}>
                        {style.label}
                      </span>
                    )}
                    {session.notes && <p className="text-[11px] text-gray-400 truncate">{session.notes}</p>}
                  </div>
                )}
              </div>
            );
          })}

          {/* Running total footer */}
          <div className="bg-[#2A255D] rounded-xl px-4 py-3 flex items-center justify-between mt-4">
            <p className="text-sm font-semibold text-white/80">Pay Period Total</p>
            <div className="text-right">
              <p className="text-lg font-bold text-white">{totalHours.toFixed(2)} hrs</p>
              <p className="text-[11px] text-white/50">{totalMinutes} min · {sessions.length} sessions</p>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-5 flex items-center gap-4">
        <p className="text-[11px] text-gray-400 font-medium">Legend:</p>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-300" />
          <span className="text-[11px] text-gray-500">Payment Due</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-400" />
          <span className="text-[11px] text-gray-500">Paid Cancel</span>
        </div>
      </div>
    </div>
  );
}
