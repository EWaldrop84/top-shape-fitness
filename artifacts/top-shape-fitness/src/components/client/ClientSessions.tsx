import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Appointment } from "@/types";

interface ClientSessionsProps {
  clientId: string;
  onBook: () => void;
}

const STATUS_STYLE = {
  scheduled:  { bg: "bg-blue-50",    text: "text-blue-700",    label: "Upcoming"   },
  completed:  { bg: "bg-emerald-50", text: "text-emerald-700", label: "Completed"  },
  cancelled:  { bg: "bg-gray-100",   text: "text-gray-500",    label: "Cancelled"  },
  forfeited:  { bg: "bg-red-50",     text: "text-red-700",     label: "Forfeited"  },
  no_show:    { bg: "bg-orange-50",  text: "text-orange-700",  label: "No Show"    },
};

function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

export default function ClientSessions({ clientId, onBook }: ClientSessionsProps) {
  const [appointments, setAppointments] = useState<(Appointment & { trainerName: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelResult, setCancelResult] = useState<{ apptId: string; forfeited: boolean; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: appts } = await supabase
      .from("appointments")
      .select("id, client_id, trainer_id, client_package_id, appointment_date, start_time, end_time, duration_minutes, status, session_deducted, cancellation_within_24hr, forfeiture_waived, cancelled_at, notes")
      .eq("client_id", clientId)
      .order("appointment_date", { ascending: false })
      .limit(60);

    if (!appts || appts.length === 0) { setAppointments([]); setLoading(false); return; }

    const trainerIds = [...new Set((appts as Appointment[]).map((a) => a.trainer_id))];
    const [{ data: trainers }, { data: trainerUsers }] = await Promise.all([
      supabase.from("trainers").select("id, user_id").in("id", trainerIds),
      supabase.from("users").select("id, first_name, last_name").in("id", (
        await supabase.from("trainers").select("user_id").in("id", trainerIds)
      ).data?.map((t: any) => t.user_id) ?? []),
    ]);

    const tUserMap = new Map((trainerUsers ?? []).map((u: any) => [u.id, u]));
    const tNameMap = new Map<string, string>();
    for (const t of (trainers ?? []) as any[]) {
      const u = tUserMap.get(t.user_id) as any;
      tNameMap.set(t.id, u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || "Trainer" : "Trainer");
    }

    const enriched = (appts as Appointment[]).map((a) => ({
      ...a,
      trainerName: tNameMap.get(a.trainer_id) ?? "Trainer",
    }));
    setAppointments(enriched);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCancel(apptId: string) {
    setCancellingId(apptId);
    setCancelResult(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setCancellingId(null); return; }

    const res = await fetch("/api/booking/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ appointment_id: apptId }),
    });
    const data = await res.json() as { forfeited?: boolean; message?: string; error?: string };
    setCancellingId(null);

    if (!res.ok || data.error) {
      setCancelResult({ apptId, forfeited: false, message: data.error ?? "Failed to cancel." });
    } else {
      setCancelResult({ apptId, forfeited: data.forfeited ?? false, message: data.message ?? "" });
      fetchData();
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const upcoming = appointments.filter((a) => a.appointment_date >= today && a.status === "scheduled");
  const history = appointments.filter((a) => a.appointment_date < today || a.status !== "scheduled");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin w-6 h-6 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      {/* Upcoming */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Upcoming Sessions</p>
        {upcoming.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-500 mb-3">No upcoming sessions scheduled</p>
            <button onClick={onBook} className="text-sm font-semibold text-[#06A29E] hover:underline">
              Book a session →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((appt) => {
              const isCancelling = cancellingId === appt.id;
              const result = cancelResult?.apptId === appt.id ? cancelResult : null;
              return (
                <div key={appt.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#2A255D]">{formatDate(appt.appointment_date)}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {formatTime(appt.start_time)} · {appt.duration_minutes} min
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">with {appt.trainerName}</p>
                    </div>
                    <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">
                      Upcoming
                    </span>
                  </div>
                  {result && (
                    <div className={`mt-3 p-2.5 rounded-lg text-xs font-medium ${result.forfeited ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {result.message}
                    </div>
                  )}
                  {!result && (
                    <button
                      onClick={() => handleCancel(appt.id)}
                      disabled={isCancelling}
                      className="mt-3 w-full py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition disabled:opacity-50"
                    >
                      {isCancelling ? "Cancelling…" : "Cancel Session"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Session History</p>
          <div className="space-y-2">
            {history.slice(0, 20).map((appt) => {
              const style = STATUS_STYLE[appt.status] ?? STATUS_STYLE.completed;
              return (
                <div key={appt.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[#2A255D]">{formatDate(appt.appointment_date)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatTime(appt.start_time)} · {appt.duration_minutes} min</p>
                    {appt.cancellation_within_24hr && (
                      <p className="text-[11px] text-red-500 mt-0.5">Late cancellation</p>
                    )}
                  </div>
                  <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
