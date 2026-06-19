import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Appointment, Trainer, ClientPackage } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────
const SLOT_HEIGHT = 52; // px per 30-min slot
const HOUR_START = 5;
const HOUR_END = 18;
const TOTAL_SLOTS = (HOUR_END - HOUR_START) * 2; // 26

const TRAINER_COLORS: Record<string, { header: string; dot: string; apptBg: string; apptText: string }> = {
  cyan:    { header: "bg-cyan-50",    dot: "bg-cyan-500",    apptBg: "bg-cyan-100",    apptText: "text-cyan-900"    },
  banana:  { header: "bg-yellow-50",  dot: "bg-yellow-400",  apptBg: "bg-yellow-100",  apptText: "text-yellow-900"  },
  grape:   { header: "bg-purple-50",  dot: "bg-purple-500",  apptBg: "bg-purple-100",  apptText: "text-purple-900"  },
  basil:   { header: "bg-green-50",   dot: "bg-green-600",   apptBg: "bg-green-100",   apptText: "text-green-900"   },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  scheduled: { bg: "bg-blue-100",    text: "text-blue-800",    border: "border-blue-300",    label: "Scheduled"  },
  completed: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-400", label: "Completed"  },
  cancelled: { bg: "bg-gray-100",    text: "text-gray-600",    border: "border-gray-300",    label: "Cancelled"  },
  forfeited: { bg: "bg-red-100",     text: "text-red-700",     border: "border-red-300",     label: "Forfeited"  },
  no_show:   { bg: "bg-orange-100",  text: "text-orange-700",  border: "border-orange-300",  label: "No Show"    },
};

const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ── Utilities ─────────────────────────────────────────────────────────────────
function getMondayOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDate(d: Date): string { return d.toISOString().split("T")[0]; }

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

function addMinutes(time: string, min: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function timeToSlotIndex(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h - HOUR_START) * 2 + Math.floor(m / 30);
}

function slotToTime(i: number): string {
  const totalMin = HOUR_START * 60 + i * 30;
  return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
}

const TIME_SLOTS = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
  const t = slotToTime(i);
  return { time: t, label: formatTime(t), isHour: i % 2 === 0 };
});

// ── Local types ───────────────────────────────────────────────────────────────
interface TrainerRow { trainer: Trainer; firstName: string; lastName: string | null }
interface ClientOption { id: string; name: string }
interface CreateSlot { trainerId: string; date: string; startTime: string }
interface CreateForm {
  trainerId: string; clientId: string; date: string; startTime: string;
  duration: 30 | 45 | 60; packageId: string; notes: string;
}

// ── AdminCalendar ─────────────────────────────────────────────────────────────
export default function AdminCalendar() {
  const today = new Date();
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(today));
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date(today);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1); // skip Sunday → Monday
    return d;
  });
  const [trainers, setTrainers] = useState<TrainerRow[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clientNameMap, setClientNameMap] = useState<Map<string, string>>(new Map());
  const [allClients, setAllClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [createSlot, setCreateSlot] = useState<CreateSlot | null>(null);
  const [form, setForm] = useState<CreateForm>({ trainerId: "", clientId: "", date: "", startTime: "", duration: 60, packageId: "", notes: "" });
  const [clientPkgs, setClientPkgs] = useState<ClientPackage[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // View modal
  const [viewAppt, setViewAppt] = useState<Appointment | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const weekEnd = addDays(weekStart, 6);

    const [trainersRes, apptRes, clientsRes] = await Promise.all([
      supabase
        .from("trainers")
        .select("id, display_color, users!trainers_user_id_fkey(first_name, last_name, email)")
        .eq("is_active", true),
      supabase
        .from("appointments")
        .select("id, client_id, trainer_id, client_package_id, appointment_date, start_time, end_time, duration_minutes, status, session_deducted, cancellation_within_24hr, forfeiture_waived, cancelled_at, notes")
        .gte("appointment_date", isoDate(weekStart))
        .lte("appointment_date", isoDate(weekEnd)),
      supabase
        .from("clients")
        .select("id, users!clients_user_id_fkey(first_name, last_name, email)"),
    ]);

    const trainerRows: TrainerRow[] = (trainersRes.data ?? []).map((t: any) => {
      const u = t.users ?? {};
      return { trainer: { id: t.id, display_color: t.display_color } as Trainer, firstName: u.first_name ?? "Trainer", lastName: u.last_name ?? null };
    });
    setTrainers(trainerRows);

    // Client name map for appointment display
    const clientUserMap = new Map<string, string>();
    for (const c of (clientsRes.data ?? []) as any[]) {
      const u = c.users ?? {};
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Unknown";
      clientUserMap.set(c.id, name);
    }
    setClientNameMap(clientUserMap);

    // All clients for create modal — sorted by name
    const clients: ClientOption[] = (clientsRes.data ?? []).map((c: any) => {
      const u = c.users ?? {};
      return { id: c.id, name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Unknown" };
    }).sort((a, b) => a.name.localeCompare(b.name));
    setAllClients(clients);

    setAppointments((apptRes.data ?? []) as Appointment[]);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function loadClientPackages(clientId: string) {
    const { data } = await supabase
      .from("client_packages")
      .select("id, owner_client_id, package_id, sessions_remaining, sessions_total, sessions_used, purchase_date, expiration_date, expiration_waived, is_active, is_shared, shared_with_client_id, packages!package_id(name)")
      .eq("owner_client_id", clientId)
      .eq("is_active", true);
    setClientPkgs((data ?? []) as unknown as ClientPackage[]);
  }

  function openCreateModal(slot?: CreateSlot) {
    const dateStr = slot?.date ?? isoDate(selectedDay);
    const trainerId = slot?.trainerId ?? (trainers[0]?.trainer.id ?? "");
    const startTime = slot?.startTime ?? "09:00";
    setForm({ trainerId, clientId: "", date: dateStr, startTime, duration: 60, packageId: "", notes: "" });
    setClientPkgs([]);
    setClientSearch("");
    setSaveError(null);
    setCreateSlot(slot ?? { trainerId, date: dateStr, startTime });
  }

  async function handleCreate() {
    if (!form.trainerId || !form.clientId || !form.packageId || !form.date || !form.startTime) {
      setSaveError("Please fill in all required fields.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setSaveError("Session expired."); setSaving(false); return; }

    const res = await fetch("/api/booking/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        trainer_id: form.trainerId, client_id: form.clientId,
        client_package_id: form.packageId, appointment_date: form.date,
        start_time: form.startTime, duration_minutes: form.duration,
        notes: form.notes || undefined,
      }),
    });
    const data = await res.json() as { appointment?: { id: string }; error?: string };
    setSaving(false);
    if (!res.ok || data.error) { setSaveError(data.error ?? "Failed to create appointment."); return; }
    setCreateSlot(null);
    fetchData();
  }

  async function handleViewAction(action: "complete" | "cancel") {
    if (!viewAppt) return;
    setActionLoading(true);
    setActionResult(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setActionLoading(false); return; }

    if (action === "complete") {
      await fetch("/api/admin/complete-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ appointment_id: viewAppt.id }),
      });
      setActionResult("Marked as completed.");
    } else {
      const res = await fetch("/api/booking/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ appointment_id: viewAppt.id }),
      });
      const data = await res.json() as { message?: string; error?: string };
      setActionResult(data.message ?? data.error ?? "Done.");
    }
    setActionLoading(false);
    fetchData();
    setTimeout(() => { setViewAppt(null); setActionResult(null); }, 1500);
  }

  function isOccupied(trainerId: string, slotIdx: number, date: string): boolean {
    return appointments.some((a) => {
      if (a.trainer_id !== trainerId || a.appointment_date !== date) return false;
      if (a.status === "cancelled" || a.status === "forfeited") return false;
      const start = timeToSlotIndex(a.start_time);
      const end = start + Math.ceil(a.duration_minutes / 30);
      return slotIdx >= start && slotIdx < end;
    });
  }

  function getDayAppts(trainerId: string, date: string): Appointment[] {
    return appointments.filter(
      (a) => a.trainer_id === trainerId && a.appointment_date === date && a.status !== "cancelled" && a.status !== "forfeited"
    );
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayISO = isoDate(today);
  const selISO = isoDate(selectedDay);

  const filteredClients = clientSearch.trim()
    ? allClients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : allClients;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Week navigation */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="text-sm font-semibold text-[#2A255D]">
              {weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
              {weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { const m = getMondayOfWeek(today); setWeekStart(m); setSelectedDay(today.getDay() === 0 ? addDays(today, 1) : today); }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
              Today
            </button>
            <button onClick={() => openCreateModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#06A29E] text-white text-xs font-semibold hover:bg-[#048e8a] transition">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New
            </button>
          </div>
        </div>

        {/* Day strip */}
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, i) => {
            const iso = isoDate(day);
            const isSun = day.getDay() === 0;
            const isToday = iso === todayISO;
            const isSelected = iso === selISO;
            return (
              <button key={i} disabled={isSun}
                onClick={() => setSelectedDay(day)}
                className={`flex flex-col items-center py-2 rounded-xl transition ${
                  isSelected ? "bg-[#2A255D] text-white" : isSun ? "opacity-40 cursor-not-allowed text-gray-400" : isToday ? "bg-[#06A29E]/10 text-[#06A29E]" : "text-gray-500 hover:bg-gray-50"
                }`}>
                <span className="text-[10px] font-semibold uppercase tracking-wide">{DAYS_SHORT[day.getDay()].slice(0,1)}</span>
                <span className={`text-sm font-bold leading-none mt-0.5 ${isSelected ? "text-white" : isToday ? "text-[#06A29E]" : "text-[#2A255D]"}`}>{day.getDate()}</span>
                {isSun && <span className="text-[9px] leading-tight mt-0.5">Closed</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date label */}
      <div className="px-4 py-2 flex-shrink-0 bg-white border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500">
          {selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <svg className="animate-spin w-6 h-6 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="flex min-w-max">
            {/* Sticky time column */}
            <div className="sticky left-0 z-20 w-14 flex-shrink-0 bg-white border-r border-gray-100">
              <div className="h-10 border-b border-gray-100" />
              <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                {TIME_SLOTS.map((slot, i) => (
                  <div key={i} style={{ position: "absolute", top: i * SLOT_HEIGHT, left: 0, right: 0, height: SLOT_HEIGHT }}
                    className="flex items-start justify-end pr-2 pt-1">
                    {slot.isHour && <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">{slot.label}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Trainer columns */}
            {trainers.map(({ trainer, firstName, lastName }) => {
              const color = TRAINER_COLORS[trainer.display_color ?? "cyan"] ?? TRAINER_COLORS.cyan;
              const dayAppts = getDayAppts(trainer.id, selISO);
              return (
                <div key={trainer.id} className="w-[152px] flex-shrink-0 border-r border-gray-100 last:border-r-0">
                  {/* Column header */}
                  <div className={`h-10 border-b border-gray-100 flex items-center justify-center gap-1.5 px-2 ${color.header}`}>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color.dot}`} />
                    <span className="text-xs font-semibold text-[#2A255D] truncate">{firstName}</span>
                  </div>

                  {/* Time grid */}
                  <div className="relative bg-white" style={{ height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                    {/* Background clickable cells */}
                    {TIME_SLOTS.map((slot, i) => {
                      const occupied = isOccupied(trainer.id, i, selISO);
                      return (
                        <div key={i}
                          style={{ position: "absolute", top: i * SLOT_HEIGHT, left: 0, right: 0, height: SLOT_HEIGHT }}
                          className={`border-b ${slot.isHour ? "border-gray-200" : "border-gray-100"} ${occupied ? "" : "cursor-pointer hover:bg-blue-50/40 transition-colors"}`}
                          onClick={() => {
                            if (!occupied) openCreateModal({ trainerId: trainer.id, date: selISO, startTime: slot.time });
                          }}
                        />
                      );
                    })}

                    {/* Appointment blocks */}
                    {dayAppts.map((appt) => {
                      const topIdx = timeToSlotIndex(appt.start_time);
                      const heightSlots = Math.ceil(appt.duration_minutes / 30);
                      const style = STATUS_STYLES[appt.status] ?? STATUS_STYLES.scheduled;
                      return (
                        <div key={appt.id}
                          style={{ position: "absolute", top: topIdx * SLOT_HEIGHT + 2, height: heightSlots * SLOT_HEIGHT - 4, left: 3, right: 3 }}
                          className={`${style.bg} border ${style.border} rounded-lg px-1.5 py-1 cursor-pointer z-10 overflow-hidden hover:opacity-80 transition`}
                          onClick={() => { setViewAppt(appt); setActionResult(null); }}>
                          <p className={`text-[11px] font-semibold leading-tight truncate ${style.text}`}>
                            {clientNameMap.get(appt.client_id) ?? "Client"}
                          </p>
                          <p className={`text-[10px] leading-tight ${style.text} opacity-70`}>
                            {appt.duration_minutes}min · {formatTime(appt.start_time)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* No trainers state */}
            {trainers.length === 0 && (
              <div className="flex-1 flex items-center justify-center py-20 text-sm text-gray-400">
                No active trainers found
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create Appointment Modal ──────────────────────────────────────────── */}
      {createSlot && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-[#2A255D] text-base">New Appointment</h3>
              <button onClick={() => setCreateSlot(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Trainer */}
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Trainer</label>
                <select value={form.trainerId} onChange={(e) => setForm((f) => ({ ...f, trainerId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition">
                  <option value="">Select trainer…</option>
                  {trainers.map(({ trainer, firstName, lastName }) => (
                    <option key={trainer.id} value={trainer.id}>
                      {[firstName, lastName].filter(Boolean).join(" ")}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Date</label>
                  <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Start Time</label>
                  <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {([30, 45, 60] as const).map((d) => (
                    <button key={d} onClick={() => setForm((f) => ({ ...f, duration: d }))}
                      className={`py-2 rounded-lg border text-sm font-semibold transition ${form.duration === d ? "bg-[#06A29E] border-[#06A29E] text-white" : "border-gray-200 text-gray-600 hover:border-[#06A29E]"}`}>
                      {d} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Client search */}
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Client</label>
                <input type="text" placeholder="Search client…" value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition mb-1.5" />
                {form.clientId && (
                  <p className="text-xs text-[#06A29E] mb-1.5 font-medium">
                    ✓ {allClients.find((c) => c.id === form.clientId)?.name}
                  </p>
                )}
                {clientSearch.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                    {filteredClients.slice(0, 8).map((c) => (
                      <button key={c.id} onClick={() => {
                        setForm((f) => ({ ...f, clientId: c.id, packageId: "" }));
                        setClientSearch("");
                        loadClientPackages(c.id);
                      }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 transition">
                        {c.name}
                      </button>
                    ))}
                    {filteredClients.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No clients found</p>}
                  </div>
                )}
              </div>

              {/* Package */}
              {form.clientId && (
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Package</label>
                  {clientPkgs.length === 0 ? (
                    <p className="text-xs text-orange-500">No active packages for this client</p>
                  ) : (
                    <select value={form.packageId} onChange={(e) => setForm((f) => ({ ...f, packageId: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition">
                      <option value="">Select package…</option>
                      {clientPkgs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {(p.packages as any)?.name ?? "Package"} — {p.sessions_remaining} sessions left
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Notes (optional)</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Any notes…"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition resize-none" />
              </div>

              {saveError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>}
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setCreateSlot(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#06A29E] text-white text-sm font-semibold hover:bg-[#048e8a] transition disabled:opacity-60">
                {saving ? "Booking…" : "Book"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Appointment Modal ─────────────────────────────────────────────── */}
      {viewAppt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-[#2A255D] text-base">Appointment</h3>
              <button onClick={() => { setViewAppt(null); setActionResult(null); }} className="p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400 mb-0.5">Client</p><p className="font-semibold text-[#2A255D]">{clientNameMap.get(viewAppt.client_id) ?? "—"}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Status</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[viewAppt.status]?.bg} ${STATUS_STYLES[viewAppt.status]?.text}`}>
                    {STATUS_STYLES[viewAppt.status]?.label ?? viewAppt.status}
                  </span>
                </div>
                <div><p className="text-xs text-gray-400 mb-0.5">Date</p><p className="font-medium text-[#2A255D]">{new Date(viewAppt.appointment_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Time</p><p className="font-medium text-[#2A255D]">{formatTime(viewAppt.start_time)}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Duration</p><p className="font-medium text-[#2A255D]">{viewAppt.duration_minutes} min</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Session deducted</p><p className="font-medium text-[#2A255D]">{viewAppt.session_deducted ? "Yes" : "No"}</p></div>
              </div>
              {viewAppt.notes && <div><p className="text-xs text-gray-400 mb-0.5">Notes</p><p className="text-sm text-gray-700">{viewAppt.notes}</p></div>}
              {actionResult && (
                <p className="text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{actionResult}</p>
              )}
            </div>
            {viewAppt.status === "scheduled" && !actionResult && (
              <div className="px-5 pb-5 flex gap-3">
                <button onClick={() => handleViewAction("cancel")} disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition disabled:opacity-60">
                  {actionLoading ? "…" : "Cancel Appt"}
                </button>
                <button onClick={() => handleViewAction("complete")} disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-60">
                  {actionLoading ? "…" : "Mark Complete"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
