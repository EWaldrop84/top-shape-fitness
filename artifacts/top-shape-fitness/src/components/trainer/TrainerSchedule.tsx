import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { TrainerAppointment, AvailabilityBlock, TrainerWithName } from "@/types";

interface TrainerScheduleProps {
  trainerId: string;          // logged-in trainer's own ID — always used for inserts
  allTrainers: TrainerWithName[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

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

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_STYLE: Record<string, { border: string; bg: string; text: string; label: string }> = {
  scheduled:  { border: "border-l-[#1F73B1]",     bg: "bg-blue-50",    text: "text-[#1F73B1]",   label: "Scheduled" },
  completed:  { border: "border-l-emerald-500",    bg: "bg-emerald-50", text: "text-emerald-700", label: "Completed" },
  cancelled:  { border: "border-l-gray-300",       bg: "bg-gray-50",    text: "text-gray-500",    label: "Cancelled" },
  no_show:    { border: "border-l-orange-400",     bg: "bg-orange-50",  text: "text-orange-600",  label: "No Show"   },
  forfeited:  { border: "border-l-rose-400",       bg: "bg-rose-50",    text: "text-rose-600",    label: "Forfeited" },
};

const EMPTY_AVAIL = { day_of_week: "mon" as const, start_time: "09:00", end_time: "17:00", is_recurring: true, specific_date: "" };

function trainerDisplayName(t: TrainerWithName): string {
  return [t.first_name, t.last_name].filter(Boolean).join(" ") || "Trainer";
}

export default function TrainerSchedule({ trainerId, allTrainers }: TrainerScheduleProps) {
  const today = new Date();
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(today));
  const [selectedDay, setSelectedDay] = useState<number>(today.getDay());
  const [viewingTrainerId, setViewingTrainerId] = useState<string>(trainerId);
  const [appointments, setAppointments] = useState<TrainerAppointment[]>([]);
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([]);
  const [clientNameMap, setClientNameMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showAvail, setShowAvail] = useState(false);
  const [availForm, setAvailForm] = useState(EMPTY_AVAIL);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isViewingOwn = viewingTrainerId === trainerId;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const weekEnd = addDays(weekStart, 6);

    const [apptsRes, availRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, client_id, appointment_date, start_time, end_time, duration_minutes, status, notes")
        .eq("trainer_id", viewingTrainerId)
        .gte("appointment_date", isoDate(weekStart))
        .lte("appointment_date", isoDate(weekEnd))
        .order("start_time", { ascending: true }),
      supabase
        .from("availability")
        .select("id, trainer_id, day_of_week, start_time, end_time, is_recurring, specific_date, is_active")
        .eq("trainer_id", viewingTrainerId)
        .eq("is_active", true),
    ]);

    const appts = (apptsRes.data ?? []) as TrainerAppointment[];
    setAvailability((availRes.data ?? []) as AvailabilityBlock[]);

    const clientIds = [...new Set(appts.map((a) => a.client_id))];
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, user_id")
        .in("id", clientIds);

      const userIds = (clients ?? []).map((c: any) => c.user_id);
      const { data: users } = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .in("id", userIds);

      const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));
      const nameMap = new Map<string, string>();
      for (const c of (clients ?? []) as any[]) {
        const u = userMap.get(c.user_id) as any;
        nameMap.set(c.id, u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || "Client" : "Client");
      }
      setClientNameMap(nameMap);
    } else {
      setClientNameMap(new Map());
    }

    setAppointments(appts);
    setLoading(false);
  }, [viewingTrainerId, weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSaveAvailability() {
    setSaving(true);
    setSaveError(null);
    // INSERT always uses trainerId (own) — never viewingTrainerId
    const { error } = await supabase.from("availability").insert({
      trainer_id: trainerId,
      day_of_week: availForm.day_of_week,
      start_time: availForm.start_time,
      end_time: availForm.end_time,
      is_recurring: availForm.is_recurring,
      specific_date: availForm.is_recurring ? null : (availForm.specific_date || null),
      is_active: true,
    });
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setShowAvail(false);
    setAvailForm(EMPTY_AVAIL);
    // If we saved our own availability but are viewing someone else, switch back
    if (!isViewingOwn) setViewingTrainerId(trainerId);
    fetchData();
  }

  async function handleDeleteAvailability(id: string) {
    await supabase.from("availability").update({ is_active: false }).eq("id", id);
    fetchData();
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const selectedDate = weekDays[selectedDay];
  const selectedISO = isoDate(selectedDate);
  const dayAppointments = appointments.filter((a) => a.appointment_date === selectedISO);
  const todayISO = isoDate(today);

  return (
    <div className="flex flex-col h-full">
      {/* Trainer selector tab strip */}
      {allTrainers.length > 1 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {allTrainers.map((t) => {
              const isOwn = t.id === trainerId;
              const isViewing = t.id === viewingTrainerId;
              const name = t.first_name ?? trainerDisplayName(t);
              return (
                <button
                  key={t.id}
                  onClick={() => setViewingTrainerId(t.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    isViewing
                      ? isOwn
                        ? "bg-[#2A255D] text-white"
                        : "bg-gray-600 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {name}
                  {isOwn && (
                    <span className={`text-[10px] font-medium ${isViewing ? "opacity-60" : "text-gray-400"}`}>
                      (me)
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Week header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#2A255D]">
              {isViewingOwn ? "My Schedule" : `${allTrainers.find(t => t.id === viewingTrainerId)?.first_name ?? "Trainer"}'s Schedule`}
            </h2>
            {!isViewingOwn && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold uppercase tracking-wide">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                </svg>
                View Only
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setWeekStart(addDays(weekStart, -7)); setSelectedDay(0); }}
              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="text-xs font-medium text-gray-600 tabular-nums">
              {formatDateShort(weekStart)} – {formatDateShort(addDays(weekStart, 6))}
            </span>
            <button
              onClick={() => { setWeekStart(addDays(weekStart, 7)); setSelectedDay(0); }}
              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>

        {/* Day selector */}
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, i) => {
            const iso = isoDate(day);
            const count = appointments.filter((a) => a.appointment_date === iso).length;
            const isToday = iso === todayISO;
            const isSelected = i === selectedDay;
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(i)}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl transition ${
                  isSelected ? "bg-[#2A255D] text-white" : isToday ? "bg-[#06A29E]/10 text-[#06A29E]" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide">{DAYS[i].slice(0, 1)}</span>
                <span className={`text-sm font-bold leading-none ${isSelected ? "text-white" : isToday ? "text-[#06A29E]" : "text-[#2A255D]"}`}>
                  {day.getDate()}
                </span>
                {count > 0 ? (
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white/70" : "bg-[#06A29E]"}`} />
                ) : (
                  <span className="w-1.5 h-1.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="animate-spin w-6 h-6 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <>
            {/* Selected day appointments */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
              {dayAppointments.length === 0 ? (
                <div className="text-center py-8 bg-white rounded-xl border border-gray-100">
                  <p className="text-sm text-gray-400">No appointments this day</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dayAppointments.map((appt) => {
                    const style = STATUS_STYLE[appt.status] ?? STATUS_STYLE.scheduled;
                    return (
                      <div
                        key={appt.id}
                        className={`bg-white rounded-xl border border-gray-100 border-l-4 ${style.border} px-4 py-3 shadow-sm transition ${
                          !isViewingOwn ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[#2A255D] text-sm">{clientNameMap.get(appt.client_id) ?? "Client"}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatTime(appt.start_time)} – {formatTime(appt.end_time)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[11px] text-gray-400 font-medium">{appt.duration_minutes} min</span>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${style.bg} ${style.text}`}>
                              {style.label}
                            </span>
                          </div>
                        </div>
                        {appt.notes && <p className="text-xs text-gray-400 mt-2 line-clamp-1">{appt.notes}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Availability blocks */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {isViewingOwn ? "My Availability" : "Their Availability"}
                </p>
                {isViewingOwn && (
                  <button
                    onClick={() => setShowAvail(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#2A255D] text-white text-xs font-semibold hover:bg-[#1e1a47] transition"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add
                  </button>
                )}
              </div>
              {availability.length === 0 ? (
                <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-200">
                  <p className="text-xs text-gray-400">No availability blocks set</p>
                </div>
              ) : (
                <div className={`space-y-2 ${!isViewingOwn ? "opacity-50" : ""}`}>
                  {availability.map((block) => (
                    <div key={block.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[#2A255D] capitalize">
                          {DAY_KEYS.indexOf(block.day_of_week) >= 0 ? DAYS[DAY_KEYS.indexOf(block.day_of_week)] : block.day_of_week}
                          {!block.is_recurring && block.specific_date && <span className="text-gray-400"> · {block.specific_date}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatTime(block.start_time)} – {formatTime(block.end_time)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {block.is_recurring && (
                          <span className="text-[11px] text-[#06A29E] bg-[#06A29E]/10 px-2 py-0.5 rounded-full font-medium">Weekly</span>
                        )}
                        {isViewingOwn && (
                          <button
                            onClick={() => handleDeleteAvailability(block.id)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Add Availability Modal — only reachable when isViewingOwn */}
      {showAvail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100">
              <h3 className="font-bold text-[#2A255D] text-base">Add Availability</h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Day of Week</label>
                <select
                  value={availForm.day_of_week}
                  onChange={(e) => setAvailForm((f) => ({ ...f, day_of_week: e.target.value as any }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
                >
                  {DAY_KEYS.map((k, i) => <option key={k} value={k}>{DAYS[i]}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Start Time</label>
                  <input type="time" value={availForm.start_time} onChange={(e) => setAvailForm((f) => ({ ...f, start_time: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">End Time</label>
                  <input type="time" value={availForm.end_time} onChange={(e) => setAvailForm((f) => ({ ...f, end_time: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#2A255D]">Recurring weekly</p>
                  <p className="text-xs text-gray-400">Repeats every week on this day</p>
                </div>
                <button
                  onClick={() => setAvailForm((f) => ({ ...f, is_recurring: !f.is_recurring }))}
                  className={`relative w-10 h-6 rounded-full transition ${availForm.is_recurring ? "bg-[#06A29E]" : "bg-gray-200"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${availForm.is_recurring ? "translate-x-4" : ""}`} />
                </button>
              </div>
              {!availForm.is_recurring && (
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Specific Date</label>
                  <input type="date" value={availForm.specific_date} onChange={(e) => setAvailForm((f) => ({ ...f, specific_date: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                </div>
              )}
              {saveError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => { setShowAvail(false); setSaveError(null); setAvailForm(EMPTY_AVAIL); }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button onClick={handleSaveAvailability} disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#06A29E] text-white text-sm font-semibold hover:bg-[#048e8a] transition disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
