import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Appointment } from "@/types";

const ERIC_USER_ID = "9c94baea-31aa-4a35-ad28-3a83955d34f1";

interface ClientSessionsProps {
  clientId: string;
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

function formatDateLong(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

export default function ClientSessions({ clientId }: ClientSessionsProps) {
  const [appointments, setAppointments] = useState<(Appointment & { trainerName: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [ericTrainerId, setEricTrainerId] = useState<string | null>(null);
  const [confirmAppt, setConfirmAppt] = useState<(Appointment & { trainerName: string }) | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [apptsRes, ericRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, client_id, trainer_id, client_package_id, appointment_date, start_time, end_time, duration_minutes, status, session_deducted, cancellation_within_24hr, forfeiture_waived, cancelled_at, notes")
        .eq("client_id", clientId)
        .order("appointment_date", { ascending: false })
        .limit(60),
      supabase
        .from("trainers")
        .select("id")
        .eq("user_id", ERIC_USER_ID)
        .maybeSingle(),
    ]);

    setEricTrainerId(ericRes.data?.id ?? null);

    const appts = (apptsRes.data ?? []) as Appointment[];
    if (appts.length === 0) { setAppointments([]); setLoading(false); return; }

    const trainerIds = [...new Set(appts.map((a) => a.trainer_id))];
    const { data: trainers } = await supabase.from("trainers").select("id, user_id").in("id", trainerIds);
    const userIds = (trainers ?? []).map((t: any) => t.user_id);
    const { data: users } = await supabase.from("users").select("id, first_name, last_name").in("id", userIds);

    const uMap = new Map((users ?? []).map((u: any) => [u.id, u]));
    const tNameMap = new Map<string, string>();
    for (const t of (trainers ?? []) as any[]) {
      const u = uMap.get(t.user_id) as any;
      tNameMap.set(t.id, u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || "Trainer" : "Trainer");
    }

    setAppointments(appts.map((a) => ({ ...a, trainerName: tNameMap.get(a.trainer_id) ?? "Trainer" })));
    setLoading(false);
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleConfirmCancel() {
    if (!confirmAppt) return;
    setCancellingId(confirmAppt.id);
    setCancelError(null);

    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", confirmAppt.id);

    setCancellingId(null);
    setConfirmAppt(null);

    if (error) {
      setCancelError("Unable to cancel. Please contact the studio directly.");
    } else {
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
    <>
      <div className="px-4 py-5 max-w-lg mx-auto">
        {/* Upcoming */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Upcoming Sessions</p>
          {upcoming.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-500">No upcoming sessions scheduled</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((appt) => {
                const canCancel = ericTrainerId !== null && appt.trainer_id === ericTrainerId;
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
                    {canCancel && (
                      <button
                        onClick={() => setConfirmAppt(appt)}
                        className="mt-3 w-full py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition"
                      >
                        Cancel Session
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {cancelError && (
            <p className="mt-3 text-xs text-red-600 text-center">{cancelError}</p>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Session History</p>
            <div className="space-y-2">
              {history.slice(0, 20).map((appt) => {
                const style = STATUS_STYLE[appt.status as keyof typeof STATUS_STYLE] ?? STATUS_STYLE.completed;
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

      {/* Cancellation confirmation dialog */}
      {confirmAppt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="font-bold text-[#2A255D] text-center text-base mb-2">Cancel this session?</h3>
            <p className="text-sm text-gray-700 text-center font-medium mb-1">
              {formatDateLong(confirmAppt.appointment_date)} at {formatTime(confirmAppt.start_time)}
            </p>
            <p className="text-xs text-gray-400 text-center mb-6 leading-relaxed">
              Cancellations within 24 hours of your session may forfeit the session from your package.
            </p>
            <div className="space-y-2">
              <button
                onClick={handleConfirmCancel}
                disabled={cancellingId !== null}
                className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60"
              >
                {cancellingId !== null ? "Cancelling…" : "Yes, Cancel Session"}
              </button>
              <button
                onClick={() => setConfirmAppt(null)}
                disabled={cancellingId !== null}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Keep Session
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
