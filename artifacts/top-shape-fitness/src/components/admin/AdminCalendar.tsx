import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Appointment, Trainer, ClientPackage, TimeBlock } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────
const SLOT_HEIGHT = 52;
const HOUR_START = 5;
const HOUR_END = 18;
const TOTAL_SLOTS = (HOUR_END - HOUR_START) * 2;

const TRAINER_COLORS: Record<string, { header: string; dot: string; apptBg: string; apptText: string }> = {
  cyan:   { header: "bg-cyan-50",   dot: "bg-cyan-500",   apptBg: "bg-cyan-100",   apptText: "text-cyan-900"   },
  banana: { header: "bg-yellow-50", dot: "bg-yellow-400", apptBg: "bg-yellow-100", apptText: "text-yellow-900" },
  grape:  { header: "bg-purple-50", dot: "bg-purple-500", apptBg: "bg-purple-100", apptText: "text-purple-900" },
  basil:  { header: "bg-green-50",  dot: "bg-green-600",  apptBg: "bg-green-100",  apptText: "text-green-900"  },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  scheduled: { bg: "bg-blue-100",    text: "text-blue-800",    border: "border-blue-300",    label: "Scheduled" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-400", label: "Completed" },
  cancelled: { bg: "bg-gray-100",    text: "text-gray-600",    border: "border-gray-300",    label: "Cancelled" },
  forfeited: { bg: "bg-red-100",     text: "text-red-700",     border: "border-red-300",     label: "Forfeited" },
  no_show:   { bg: "bg-orange-100",  text: "text-orange-700",  border: "border-orange-300",  label: "No Show"   },
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const REASON_LABELS: Record<string, string> = {
  time_off: "Vacation / Time Off",
  personal: "Personal",
  admin:    "Admin / No Sessions",
  other:    "Other",
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function getMondayOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
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

function getBlockLabel(block: TimeBlock): string {
  if (block.reason === "other") return block.notes || "Other";
  return REASON_LABELS[block.reason] ?? "Blocked";
}

// ── Local types ───────────────────────────────────────────────────────────────
interface TrainerRow { trainer: Trainer; firstName: string; lastName: string | null }
interface ClientOption { id: string; name: string }
interface CreateSlot { trainerId: string; date: string; startTime: string }

interface CreateForm {
  trainerId: string; clientId: string; date: string; startTime: string;
  duration: 30 | 45 | 60; packageId: string; notes: string;
  sessionType: "training" | "consultation";
  isRecurring: boolean;
  recurringDays: number[];
}

interface BlockForm {
  trainerId: string; date: string; startTime: string; endTime: string;
  reason: "time_off" | "personal" | "admin" | "other";
  isRecurring: boolean; recurringDays: number[];
  notes: string;
}

// ── AdminCalendar ─────────────────────────────────────────────────────────────
export default function AdminCalendar() {
  const today = new Date();
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(today));
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date(today));

  // Core data
  const [trainers, setTrainers]           = useState<TrainerRow[]>([]);
  const [appointments, setAppointments]   = useState<Appointment[]>([]);
  const [timeBlocks, setTimeBlocks]       = useState<TimeBlock[]>([]);
  const [clientNameMap, setClientNameMap] = useState<Map<string, string>>(new Map());
  const [allClients, setAllClients]       = useState<ClientOption[]>([]);
  const [loading, setLoading]             = useState(true);

  // Appointment create modal
  const [createSlot, setCreateSlot]             = useState<CreateSlot | null>(null);
  const [form, setForm]                         = useState<CreateForm>({
    trainerId: "", clientId: "", date: "", startTime: "", duration: 60, packageId: "", notes: "",
    sessionType: "training", isRecurring: false, recurringDays: [],
  });
  const [clientPkgs, setClientPkgs]             = useState<ClientPackage[]>([]);
  const [clientHasCustomRate, setClientHasCustomRate] = useState(false);
  const [clientSearch, setClientSearch]         = useState("");
  const [saving, setSaving]                     = useState(false);
  const [saveError, setSaveError]               = useState<string | null>(null);

  // Appointment view modal
  const [viewAppt, setViewAppt]               = useState<Appointment | null>(null);
  const [actionLoading, setActionLoading]     = useState(false);
  const [actionResult, setActionResult]       = useState<string | null>(null);
  const [stoppingRecurring, setStoppingRecurring] = useState(false);
  const [deleteConfirm, setDeleteConfirm]         = useState(false);
  const [deleteLoading, setDeleteLoading]         = useState(false);
  const [backfilling, setBackfilling]             = useState(false);
  const [backfillResult, setBackfillResult]       = useState<string | null>(null);

  // Block time modal
  const [showBlockModal, setShowBlockModal]       = useState(false);
  const [blockForm, setBlockForm]                 = useState<BlockForm>({
    trainerId: "", date: "", startTime: "09:00", endTime: "17:00",
    reason: "time_off", isRecurring: false, recurringDays: [], notes: "",
  });
  const [blockSaving, setBlockSaving]             = useState(false);
  const [blockSaveError, setBlockSaveError]       = useState<string | null>(null);

  // Block view modal
  const [viewBlock, setViewBlock]                 = useState<TimeBlock | null>(null);
  const [deletingBlock, setDeletingBlock]         = useState(false);
  const [stoppingBlockSeries, setStoppingBlockSeries] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const weekEnd = addDays(weekStart, 6);

    const [trainersRes, apptRes, clientsRes, blocksRes] = await Promise.all([
      supabase.from("trainers").select("id, display_color, users!trainers_user_id_fkey(first_name, last_name, email)").eq("is_active", true),
      supabase.from("appointments")
        .select("id, client_id, trainer_id, client_package_id, appointment_date, start_time, end_time, duration_minutes, status, session_type, session_deducted, cancellation_within_24hr, forfeiture_waived, cancelled_at, notes, is_recurring, recurring_days, recurring_series_id")
        .gte("appointment_date", isoDate(weekStart)).lte("appointment_date", isoDate(weekEnd)),
      supabase.from("clients").select("id, users!clients_user_id_fkey(first_name, last_name, email)"),
      supabase.from("time_blocks")
        .select("id, trainer_id, date, start_time, end_time, reason, notes, is_recurring, recurring_days, recurring_series_id, is_cancelled, created_by, created_at")
        .gte("date", isoDate(weekStart)).lte("date", isoDate(weekEnd)).eq("is_cancelled", false),
    ]);

    const trainerRows: TrainerRow[] = (trainersRes.data ?? []).map((t: any) => {
      const u = t.users ?? {};
      return { trainer: { id: t.id, display_color: t.display_color } as Trainer, firstName: u.first_name ?? "Trainer", lastName: u.last_name ?? null };
    });
    setTrainers(trainerRows);

    const clientUserMap = new Map<string, string>();
    for (const c of (clientsRes.data ?? []) as any[]) {
      const u = c.users ?? {};
      clientUserMap.set(c.id, [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Unknown");
    }
    setClientNameMap(clientUserMap);

    const clients: ClientOption[] = (clientsRes.data ?? []).map((c: any) => {
      const u = c.users ?? {};
      return { id: c.id, name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Unknown" };
    }).sort((a, b) => a.name.localeCompare(b.name));
    setAllClients(clients);

    setAppointments((apptRes.data ?? []) as unknown as Appointment[]);
    setTimeBlocks((blocksRes.data ?? []) as unknown as TimeBlock[]);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function loadClientPackages(clientId: string) {
    const [pkgRes, customRes] = await Promise.all([
      supabase.from("client_packages").select("id, owner_client_id, package_id, sessions_remaining, sessions_total, sessions_used, purchase_date, expiration_date, expiration_waived, is_active, is_shared, shared_with_client_id, packages!package_id(name)").eq("owner_client_id", clientId).eq("is_active", true),
      supabase.from("client_custom_pricing").select("id").eq("client_id", clientId).eq("is_active", true).limit(1),
    ]);
    setClientPkgs((pkgRes.data ?? []) as unknown as ClientPackage[]);
    setClientHasCustomRate(((customRes.data ?? []).length > 0));
  }

  function openCreateModal(slot?: CreateSlot) {
    const dateStr = slot?.date ?? isoDate(selectedDay);
    const trainerId = slot?.trainerId ?? (trainers[0]?.trainer.id ?? "");
    const startTime = slot?.startTime ?? "09:00";
    const dayOfWeek = new Date(dateStr + "T12:00:00").getDay();
    setForm({ trainerId, clientId: "", date: dateStr, startTime, duration: 60, packageId: "", notes: "", sessionType: "training", isRecurring: false, recurringDays: [dayOfWeek] });
    setClientPkgs([]); setClientHasCustomRate(false); setClientSearch(""); setSaveError(null);
    setCreateSlot(slot ?? { trainerId, date: dateStr, startTime });
  }

  function openBlockModal() {
    const dateStr = isoDate(selectedDay);
    const dayOfWeek = new Date(dateStr + "T12:00:00").getDay();
    setBlockForm({ trainerId: trainers[0]?.trainer.id ?? "", date: dateStr, startTime: "09:00", endTime: "17:00", reason: "time_off", isRecurring: false, recurringDays: [dayOfWeek], notes: "" });
    setBlockSaveError(null);
    setShowBlockModal(true);
  }

  function handleDateChange(dateStr: string) {
    const dayOfWeek = new Date(dateStr + "T12:00:00").getDay();
    setForm((f) => ({ ...f, date: dateStr, recurringDays: f.recurringDays.length === 0 ? [dayOfWeek] : f.recurringDays }));
  }

  async function handleCreate() {
    const isConsultation = form.sessionType === "consultation";
    if (!form.trainerId || !form.clientId || !form.date || !form.startTime) { setSaveError("Please fill in all required fields."); return; }
    if (!isConsultation && !form.packageId) { setSaveError("Please select a package."); return; }
    if (form.isRecurring && form.recurringDays.length === 0) { setSaveError("Select at least one day for recurring sessions."); return; }

    setSaving(true); setSaveError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setSaveError("Session expired."); setSaving(false); return; }

    let res: Response;
    if (form.isRecurring && !isConsultation) {
      res = await fetch("/api/booking/create-recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trainer_id: form.trainerId, client_id: form.clientId, client_package_id: form.packageId, start_time: form.startTime, duration_minutes: form.duration, recurring_days: form.recurringDays, notes: form.notes || undefined }),
      });
    } else {
      res = await fetch("/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trainer_id: form.trainerId, client_id: form.clientId, client_package_id: isConsultation ? undefined : form.packageId, appointment_date: form.date, start_time: form.startTime, duration_minutes: form.duration, session_type: form.sessionType, notes: form.notes || undefined }),
      });
    }
    const data = await res.json() as { error?: string };
    setSaving(false);
    if (!res.ok || data.error) { setSaveError(data.error ?? "Failed to create appointment."); return; }
    setCreateSlot(null); fetchData();
  }

  async function handleCreateBlock() {
    if (!blockForm.trainerId || !blockForm.date || !blockForm.startTime || !blockForm.endTime) { setBlockSaveError("Please fill in all required fields."); return; }
    if (blockForm.startTime >= blockForm.endTime) { setBlockSaveError("End time must be after start time."); return; }
    if (blockForm.isRecurring && blockForm.recurringDays.length === 0) { setBlockSaveError("Select at least one day for recurring blocks."); return; }

    setBlockSaving(true); setBlockSaveError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setBlockSaving(false); return; }

    const endpoint = blockForm.isRecurring ? "/api/blocks/create-recurring" : "/api/blocks/create";
    const body = blockForm.isRecurring
      ? { trainer_id: blockForm.trainerId, start_time: blockForm.startTime, end_time: blockForm.endTime, reason: blockForm.reason, recurring_days: blockForm.recurringDays, notes: blockForm.notes || undefined }
      : { trainer_id: blockForm.trainerId, date: blockForm.date, start_time: blockForm.startTime, end_time: blockForm.endTime, reason: blockForm.reason, notes: blockForm.notes || undefined };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setBlockSaving(false);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = text.startsWith("{") ? (JSON.parse(text) as { error?: string }).error : undefined;
      setBlockSaveError(msg ?? `Server error (${res.status}). Please try again.`);
      return;
    }
    const data = await res.json() as { error?: string };
    if (data.error) { setBlockSaveError(data.error); return; }
    setShowBlockModal(false); fetchData();
  }

  async function handleDeleteBlock(blockId: string) {
    setDeletingBlock(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setDeletingBlock(false); return; }
    await fetch(`/api/blocks/${blockId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setDeletingBlock(false); setViewBlock(null); fetchData();
  }

  async function handleStopBlockSeries(seriesId: string) {
    setStoppingBlockSeries(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setStoppingBlockSeries(false); return; }
    await fetch("/api/blocks/stop-recurring", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ series_id: seriesId }) });
    setStoppingBlockSeries(false); setViewBlock(null); fetchData();
  }

  async function handleViewAction(action: "complete" | "cancel") {
    if (!viewAppt) return;
    setActionLoading(true); setActionResult(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setActionLoading(false); return; }
    if (action === "complete") {
      await fetch("/api/admin/complete-appointment", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ appointment_id: viewAppt.id }) });
      setActionResult("Marked as completed.");
    } else {
      const r = await fetch("/api/booking/cancel", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ appointment_id: viewAppt.id }) });
      const d = await r.json() as { message?: string; error?: string };
      setActionResult(d.message ?? d.error ?? "Done.");
    }
    setActionLoading(false); fetchData();
    setTimeout(() => { setViewAppt(null); setActionResult(null); }, 1500);
  }

  async function handleStopRecurring(seriesId: string) {
    setStoppingRecurring(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setStoppingRecurring(false); return; }
    await fetch("/api/booking/stop-recurring", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ series_id: seriesId }) });
    setStoppingRecurring(false); setViewAppt(null); setActionResult(null); fetchData();
  }

  async function handleDeleteSingle() {
    if (!viewAppt) return;
    setDeleteLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setDeleteLoading(false); return; }
    await fetch("/api/booking/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ appointment_id: viewAppt.id }),
    });
    setDeleteLoading(false); setDeleteConfirm(false); setViewAppt(null); setActionResult(null); fetchData();
  }

  async function handleDeleteFuture() {
    if (!viewAppt?.recurring_series_id) return;
    setDeleteLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setDeleteLoading(false); return; }
    await fetch("/api/booking/delete-future", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recurring_series_id: viewAppt.recurring_series_id, appointment_date: viewAppt.appointment_date }),
    });
    setDeleteLoading(false); setDeleteConfirm(false); setViewAppt(null); setActionResult(null); fetchData();
  }

  async function handleBackfill() {
    setBackfilling(true); setBackfillResult(null);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setBackfilling(false); return; }
    const res = await fetch("/api/admin/backfill-recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as { seriesCreated?: number; occurrencesCreated?: number; message?: string };
    setBackfilling(false);
    setBackfillResult(data.message ?? `Done — ${data.seriesCreated ?? 0} series linked, ${data.occurrencesCreated ?? 0} future sessions generated.`);
    fetchData();
    setTimeout(() => setBackfillResult(null), 6000);
  }

  function isOccupied(trainerId: string, slotIdx: number, date: string): boolean {
    const hasAppt = appointments.some((a) => {
      if (a.trainer_id !== trainerId || a.appointment_date !== date) return false;
      if (a.status === "cancelled" || a.status === "forfeited") return false;
      const start = timeToSlotIndex(a.start_time);
      const end = start + Math.ceil(a.duration_minutes / 30);
      return slotIdx >= start && slotIdx < end;
    });
    if (hasAppt) return true;
    const slotTime = slotToTime(slotIdx);
    return timeBlocks.some((b) => {
      if (b.trainer_id !== trainerId || b.date !== date || b.is_cancelled) return false;
      return slotTime >= b.start_time && slotTime < b.end_time;
    });
  }

  function getDayAppts(trainerId: string, date: string): Appointment[] {
    return appointments.filter((a) => a.trainer_id === trainerId && a.appointment_date === date && a.status !== "cancelled" && a.status !== "forfeited");
  }

  function getDayBlocks(trainerId: string, date: string): TimeBlock[] {
    return timeBlocks.filter((b) => b.trainer_id === trainerId && b.date === date && !b.is_cancelled);
  }

  function hasBlockConflict(trainerId: string, date: string, startTime: string, durationMin: number): string | null {
    const apptEnd = addMinutes(startTime, durationMin);
    for (const b of timeBlocks) {
      if (b.trainer_id !== trainerId || b.date !== date || b.is_cancelled) continue;
      if (startTime < b.end_time && apptEnd > b.start_time) return getBlockLabel(b);
    }
    return null;
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayISO = isoDate(today);
  const selISO = isoDate(selectedDay);
  const filteredClients = clientSearch.trim() ? allClients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase())) : allClients;

  // Inline block conflict for create modal
  const activeBlockConflict = createSlot && form.trainerId && form.date && form.startTime
    ? hasBlockConflict(form.trainerId, form.date, form.startTime, form.duration)
    : null;

  const trainerName = (t: TrainerRow) => [t.firstName, t.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Week navigation */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="text-sm font-semibold text-[#2A255D]">
              {weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
              {weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { const m = getMondayOfWeek(today); setWeekStart(m); setSelectedDay(today); }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
              Today
            </button>
            <button onClick={() => openBlockModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-semibold hover:bg-gray-50 transition">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>
              Block
            </button>
            <button onClick={() => openCreateModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#06A29E] text-white text-xs font-semibold hover:bg-[#048e8a] transition">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New
            </button>
            <button onClick={handleBackfill} disabled={backfilling} title="Backfill recurring sessions into future weeks"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50 transition disabled:opacity-50">
              <svg className={`w-3.5 h-3.5 ${backfilling ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
              {backfilling ? "Syncing…" : "Sync"}
            </button>
          </div>
        </div>
        {backfillResult && (
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100">
            <p className="text-xs text-emerald-700 font-medium">{backfillResult}</p>
          </div>
        )}

        {/* Day strip */}
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, i) => {
            const iso = isoDate(day);
            const isToday = iso === todayISO;
            const isSelected = iso === selISO;
            return (
              <button key={i} onClick={() => setSelectedDay(day)}
                className={`flex flex-col items-center py-2 rounded-xl transition ${isSelected ? "bg-[#2A255D] text-white" : isToday ? "bg-[#06A29E]/10 text-[#06A29E]" : "text-gray-500 hover:bg-gray-50"}`}>
                <span className="text-[10px] font-semibold uppercase tracking-wide">{DAYS_SHORT[day.getDay()].slice(0, 1)}</span>
                <span className={`text-sm font-bold leading-none mt-0.5 ${isSelected ? "text-white" : isToday ? "text-[#06A29E]" : "text-[#2A255D]"}`}>{day.getDate()}</span>
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
                  <div key={i} style={{ position: "absolute", top: i * SLOT_HEIGHT, left: 0, right: 0, height: SLOT_HEIGHT }} className="flex items-start justify-end pr-2 pt-1">
                    {slot.isHour && <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">{slot.label}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Trainer columns */}
            {trainers.map(({ trainer, firstName, lastName }) => {
              const color = TRAINER_COLORS[trainer.display_color ?? "cyan"] ?? TRAINER_COLORS.cyan;
              const dayAppts = getDayAppts(trainer.id, selISO);
              const dayBlocks = getDayBlocks(trainer.id, selISO);
              return (
                <div key={trainer.id} className="w-[152px] flex-shrink-0 border-r border-gray-100 last:border-r-0">
                  <div className={`h-10 border-b border-gray-100 flex items-center justify-center gap-1.5 px-2 ${color.header}`}>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color.dot}`} />
                    <span className="text-xs font-semibold text-[#2A255D] truncate">{firstName}</span>
                  </div>

                  <div className="relative bg-white" style={{ height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                    {/* Grid slot lines */}
                    {TIME_SLOTS.map((slot, i) => {
                      const slotIsBlocked = timeBlocks.some((b) => {
                        if (b.trainer_id !== trainer.id || b.date !== selISO || b.is_cancelled) return false;
                        const slotTime = slotToTime(i);
                        return slotTime >= b.start_time && slotTime < b.end_time;
                      });
                      const occupied = isOccupied(trainer.id, i, selISO);
                      return (
                        <div key={i}
                          style={{ position: "absolute", top: i * SLOT_HEIGHT, left: 0, right: 0, height: SLOT_HEIGHT }}
                          className={`border-b ${slot.isHour ? "border-gray-200" : "border-gray-100"} ${!occupied && !slotIsBlocked ? "cursor-pointer hover:bg-blue-50/40 transition-colors" : ""}`}
                          onClick={() => { if (!occupied) openCreateModal({ trainerId: trainer.id, date: selISO, startTime: slot.time }); }}
                        />
                      );
                    })}

                    {/* Time blocks (rendered below appointments) */}
                    {dayBlocks.map((block) => {
                      const topIdx = Math.max(0, timeToSlotIndex(block.start_time));
                      const endIdx = Math.min(TOTAL_SLOTS, timeToSlotIndex(block.end_time));
                      const heightSlots = Math.max(1, endIdx - topIdx);
                      const label = getBlockLabel(block);
                      return (
                        <div key={block.id}
                          style={{
                            position: "absolute",
                            top: topIdx * SLOT_HEIGHT + 1,
                            height: heightSlots * SLOT_HEIGHT - 2,
                            left: 0, right: 0, zIndex: 5,
                            background: "repeating-linear-gradient(45deg, rgba(107,114,128,0.13) 0px, rgba(107,114,128,0.13) 3px, rgba(107,114,128,0.04) 3px, rgba(107,114,128,0.04) 9px)",
                            borderLeft: "3px solid rgba(107,114,128,0.5)",
                          }}
                          className="cursor-pointer hover:opacity-80 transition overflow-hidden"
                          onClick={() => setViewBlock(block)}>
                          <div className="px-1.5 pt-1">
                            <p className="text-[10px] font-semibold text-gray-600 leading-tight truncate">{label}</p>
                            <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{formatTime(block.start_time)} – {formatTime(block.end_time)}</p>
                            {block.is_recurring && (
                              <svg className="w-2.5 h-2.5 mt-0.5 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" />
                                <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                              </svg>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Appointments (z-index 10, above blocks) */}
                    {dayAppts.map((appt) => {
                      const topIdx = timeToSlotIndex(appt.start_time);
                      const heightPx = (appt.duration_minutes / 30) * SLOT_HEIGHT - 4;
                      const style = STATUS_STYLES[appt.status] ?? STATUS_STYLES.scheduled;
                      const isConsult = appt.session_type === "consultation";
                      const isRec = appt.is_recurring;
                      return (
                        <div key={appt.id}
                          style={{ position: "absolute", top: topIdx * SLOT_HEIGHT + 2, height: heightPx, left: 3, right: 3, zIndex: 10 }}
                          className={`${style.bg} border ${style.border} rounded-lg px-1.5 py-1 cursor-pointer overflow-hidden hover:opacity-80 transition`}
                          onClick={() => { setViewAppt(appt); setActionResult(null); setDeleteConfirm(false); setDeleteLoading(false); }}>
                          <p className={`text-[11px] font-semibold leading-tight truncate ${style.text}`}>{clientNameMap.get(appt.client_id) ?? "Client"}</p>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <p className={`text-[10px] leading-tight ${style.text} opacity-70`}>{appt.duration_minutes}min · {formatTime(appt.start_time)}</p>
                            {isConsult && <span className="text-[9px] font-bold bg-amber-400/30 text-amber-700 rounded px-1 leading-tight">CONSULT</span>}
                            {isRec && !isConsult && (
                              <svg className="w-2.5 h-2.5 opacity-60 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" />
                                <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                              </svg>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {trainers.length === 0 && <div className="flex-1 flex items-center justify-center py-20 text-sm text-gray-400">No active trainers found</div>}
          </div>
        </div>
      )}

      {/* ── Create Appointment Modal ─────────────────────────────────────────── */}
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
              {/* Block conflict warning */}
              {activeBlockConflict && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <span className="text-amber-500 text-sm flex-shrink-0 mt-0.5">⚠</span>
                  <p className="text-xs text-amber-700">This slot has a block: <strong>{activeBlockConflict}</strong>. You can still book here if needed.</p>
                </div>
              )}

              {/* Trainer */}
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Trainer</label>
                <select value={form.trainerId} onChange={(e) => setForm((f) => ({ ...f, trainerId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition">
                  <option value="">Select trainer…</option>
                  {trainers.map((t) => <option key={t.trainer.id} value={t.trainer.id}>{trainerName(t)}</option>)}
                </select>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Date</label>
                  <input type="date" value={form.date} onChange={(e) => handleDateChange(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Start Time</label>
                  <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                </div>
              </div>

              {/* Session Type */}
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Session Type</label>
                <select value={form.sessionType}
                  onChange={(e) => { const t = e.target.value as "training" | "consultation"; setForm((f) => ({ ...f, sessionType: t, duration: t === "consultation" ? 45 : f.duration, isRecurring: t === "consultation" ? false : f.isRecurring, packageId: t === "consultation" ? "" : f.packageId })); }}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition">
                  <option value="training">Training Session</option>
                  <option value="consultation">Consultation (45 min)</option>
                </select>
                {form.sessionType === "consultation" && <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">Complimentary — no package deduction</p>}
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {([30, 45, 60] as const).map((d) => (
                    <button key={d} disabled={form.sessionType === "consultation"} onClick={() => setForm((f) => ({ ...f, duration: d }))}
                      className={`py-2 rounded-lg border text-sm font-semibold transition ${form.duration === d ? "bg-[#06A29E] border-[#06A29E] text-white" : form.sessionType === "consultation" ? "border-gray-100 text-gray-300 cursor-not-allowed" : "border-gray-200 text-gray-600 hover:border-[#06A29E]"}`}>
                      {d} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Recurring */}
              {form.sessionType === "training" && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-[#2A255D]">Recurring</label>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, isRecurring: !f.isRecurring }))}
                      className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.isRecurring ? "bg-[#06A29E]" : "bg-gray-200"}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isRecurring ? "translate-x-5" : "translate-x-1"}`} />
                    </button>
                  </div>
                  {form.isRecurring && (
                    <div className="mt-2.5">
                      <div className="flex gap-1.5">
                        {DAY_LABELS.map((d, i) => (
                          <button key={i} type="button"
                            onClick={() => setForm((f) => ({ ...f, recurringDays: f.recurringDays.includes(i) ? f.recurringDays.filter((x) => x !== i) : [...f.recurringDays, i] }))}
                            className={`w-8 h-8 rounded-full text-xs font-semibold transition ${form.recurringDays.includes(i) ? "bg-[#2A255D] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                            {d}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1.5">Repeats weekly until stopped</p>
                    </div>
                  )}
                </div>
              )}

              {/* Client search */}
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Client</label>
                <input type="text" placeholder="Search client…" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition mb-1.5" />
                {form.clientId && (
                  <p className="text-xs text-[#06A29E] mb-1.5 font-medium flex items-center gap-1.5">
                    <span>✓ {allClients.find((c) => c.id === form.clientId)?.name}</span>
                    {clientHasCustomRate && <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-semibold tracking-wide">Custom Rate</span>}
                  </p>
                )}
                {clientSearch.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                    {filteredClients.slice(0, 8).map((c) => (
                      <button key={c.id} onClick={() => { setForm((f) => ({ ...f, clientId: c.id, packageId: "" })); setClientSearch(""); loadClientPackages(c.id); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 transition">{c.name}</button>
                    ))}
                    {filteredClients.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No clients found</p>}
                  </div>
                )}
              </div>

              {/* Package */}
              {form.sessionType === "training" && form.clientId && (
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Package</label>
                  {clientPkgs.length === 0 ? <p className="text-xs text-orange-500">No active packages for this client</p> : (
                    <select value={form.packageId} onChange={(e) => setForm((f) => ({ ...f, packageId: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition">
                      <option value="">Select package…</option>
                      {clientPkgs.map((p) => <option key={p.id} value={p.id}>{(p.packages as any)?.name ?? "Package"} — {p.sessions_remaining} sessions left</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Notes (optional)</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any notes…"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition resize-none" />
              </div>

              {saveError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setCreateSlot(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-[#06A29E] text-white text-sm font-semibold hover:bg-[#048e8a] transition disabled:opacity-60">
                {saving ? (form.isRecurring ? "Booking series…" : "Booking…") : (form.isRecurring ? "Book Recurring" : "Book")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Appointment Modal ───────────────────────────────────────────── */}
      {viewAppt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-[#2A255D] text-base">Appointment</h3>
                {viewAppt.session_type === "consultation" && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">CONSULT</span>}
                {viewAppt.is_recurring && viewAppt.session_type !== "consultation" && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-700">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
                    Recurring
                  </span>
                )}
              </div>
              <button onClick={() => { setViewAppt(null); setActionResult(null); setDeleteConfirm(false); }} className="p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400 mb-0.5">Client</p><p className="font-semibold text-[#2A255D]">{clientNameMap.get(viewAppt.client_id) ?? "—"}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Status</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[viewAppt.status]?.bg} ${STATUS_STYLES[viewAppt.status]?.text}`}>{STATUS_STYLES[viewAppt.status]?.label ?? viewAppt.status}</span>
                </div>
                <div><p className="text-xs text-gray-400 mb-0.5">Date</p><p className="font-medium text-[#2A255D]">{new Date(viewAppt.appointment_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Time</p><p className="font-medium text-[#2A255D]">{formatTime(viewAppt.start_time)}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Duration</p><p className="font-medium text-[#2A255D]">{viewAppt.duration_minutes} min</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Session</p><p className="font-medium text-[#2A255D] capitalize">{viewAppt.session_type === "consultation" ? "Consultation" : "Training"}</p></div>
                {viewAppt.session_type === "training" && <div><p className="text-xs text-gray-400 mb-0.5">Session deducted</p><p className="font-medium text-[#2A255D]">{viewAppt.session_deducted ? "Yes" : "No"}</p></div>}
              </div>
              {viewAppt.notes && <div><p className="text-xs text-gray-400 mb-0.5">Notes</p><p className="text-sm text-gray-700">{viewAppt.notes}</p></div>}
              {viewAppt.session_type === "consultation" && <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Complimentary consultation — no package charge</p>}
              {actionResult && <p className="text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{actionResult}</p>}
            </div>
            {viewAppt.status === "scheduled" && !actionResult && (
              <div className="px-5 pb-4 space-y-2">
                <div className="flex gap-3">
                  <button onClick={() => handleViewAction("cancel")} disabled={actionLoading}
                    className="flex-1 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition disabled:opacity-60">
                    {actionLoading ? "…" : "Cancel Appt"}
                  </button>
                  <button onClick={() => handleViewAction("complete")} disabled={actionLoading}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-60">
                    {actionLoading ? "…" : "Mark Complete"}
                  </button>
                </div>
                {viewAppt.is_recurring && viewAppt.recurring_series_id && (
                  <button onClick={() => handleStopRecurring(viewAppt.recurring_series_id!)} disabled={stoppingRecurring}
                    className="w-full py-2.5 rounded-xl border border-orange-200 text-sm font-semibold text-orange-600 hover:bg-orange-50 transition disabled:opacity-60">
                    {stoppingRecurring ? "Stopping…" : "Stop Recurring Series"}
                  </button>
                )}
              </div>
            )}
            {/* ── Delete section (always visible) ── */}
            <div className="px-5 pb-5 border-t border-gray-100 pt-3">
              {!deleteConfirm ? (
                <button onClick={() => setDeleteConfirm(true)}
                  className="w-full py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-500 hover:bg-red-50 transition">
                  Delete Session…
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-center text-gray-400">This permanently removes the session from the calendar.</p>
                  {viewAppt.is_recurring && viewAppt.recurring_series_id ? (
                    <>
                      <button onClick={handleDeleteFuture} disabled={deleteLoading}
                        className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60">
                        {deleteLoading ? "Deleting…" : "Delete This + All Future Sessions"}
                      </button>
                      <button onClick={handleDeleteSingle} disabled={deleteLoading}
                        className="w-full py-2.5 rounded-xl border border-red-300 text-sm font-semibold text-red-600 hover:bg-red-50 transition disabled:opacity-60">
                        {deleteLoading ? "Deleting…" : "Delete This Session Only"}
                      </button>
                    </>
                  ) : (
                    <button onClick={handleDeleteSingle} disabled={deleteLoading}
                      className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60">
                      {deleteLoading ? "Deleting…" : "Confirm Delete"}
                    </button>
                  )}
                  <button onClick={() => setDeleteConfirm(false)} disabled={deleteLoading}
                    className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-60">
                    Keep Session
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Block Time Modal ─────────────────────────────────────────────────── */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-[#2A255D] text-base">Block Time</h3>
              <button onClick={() => setShowBlockModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Trainer */}
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Trainer</label>
                <select value={blockForm.trainerId} onChange={(e) => setBlockForm((f) => ({ ...f, trainerId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition">
                  <option value="">Select trainer…</option>
                  {trainers.map((t) => <option key={t.trainer.id} value={t.trainer.id}>{trainerName(t)}</option>)}
                </select>
              </div>

              {/* Date */}
              {!blockForm.isRecurring && (
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Date</label>
                  <input type="date" value={blockForm.date} onChange={(e) => setBlockForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                </div>
              )}

              {/* Start / End Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Start Time</label>
                  <input type="time" value={blockForm.startTime} onChange={(e) => setBlockForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">End Time</label>
                  <input type="time" value={blockForm.endTime} onChange={(e) => setBlockForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Reason</label>
                <select value={blockForm.reason} onChange={(e) => setBlockForm((f) => ({ ...f, reason: e.target.value as BlockForm["reason"], notes: "" }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition">
                  <option value="time_off">Vacation / Time Off</option>
                  <option value="personal">Personal</option>
                  <option value="admin">Admin / No Sessions</option>
                  <option value="other">Other…</option>
                </select>
                {blockForm.reason === "other" && (
                  <input type="text" placeholder="Describe the reason…" value={blockForm.notes} onChange={(e) => setBlockForm((f) => ({ ...f, notes: e.target.value }))}
                    className="mt-2 w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                )}
              </div>

              {/* Recurring toggle */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[#2A255D]">Recurring</label>
                  <button type="button" onClick={() => setBlockForm((f) => ({ ...f, isRecurring: !f.isRecurring }))}
                    className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${blockForm.isRecurring ? "bg-[#06A29E]" : "bg-gray-200"}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${blockForm.isRecurring ? "translate-x-5" : "translate-x-1"}`} />
                  </button>
                </div>
                {blockForm.isRecurring && (
                  <div className="mt-2.5">
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((d, i) => (
                        <button key={i} type="button"
                          onClick={() => setBlockForm((f) => ({ ...f, recurringDays: f.recurringDays.includes(i) ? f.recurringDays.filter((x) => x !== i) : [...f.recurringDays, i] }))}
                          className={`w-8 h-8 rounded-full text-xs font-semibold transition ${blockForm.recurringDays.includes(i) ? "bg-[#2A255D] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1.5">Repeats weekly until stopped</p>
                  </div>
                )}
              </div>

              {/* Notes (only shown when reason is not "other", since "other" uses notes as its label) */}
              {blockForm.reason !== "other" && (
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Notes (optional)</label>
                  <textarea value={blockForm.notes} onChange={(e) => setBlockForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any additional notes…"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition resize-none" />
                </div>
              )}

              {blockSaveError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{blockSaveError}</p>}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setShowBlockModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleCreateBlock} disabled={blockSaving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#2A255D] text-white text-sm font-semibold hover:bg-[#1e1a47] transition disabled:opacity-60">
                {blockSaving ? (blockForm.isRecurring ? "Blocking series…" : "Blocking…") : "Block"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Block Modal ─────────────────────────────────────────────────── */}
      {viewBlock && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: "repeating-linear-gradient(45deg, #6b7280 0px, #6b7280 2px, transparent 2px, transparent 5px)" }} />
                <h3 className="font-bold text-[#2A255D] text-base">Blocked Time</h3>
                {viewBlock.is_recurring && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
                    Recurring
                  </span>
                )}
              </div>
              <button onClick={() => setViewBlock(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Trainer</p>
                  <p className="font-semibold text-[#2A255D]">{trainers.find((t) => t.trainer.id === viewBlock.trainer_id)?.firstName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Reason</p>
                  <p className="font-semibold text-[#2A255D]">{REASON_LABELS[viewBlock.reason] ?? viewBlock.reason}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Date</p>
                  <p className="font-medium text-[#2A255D]">{new Date(viewBlock.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Time</p>
                  <p className="font-medium text-[#2A255D]">{formatTime(viewBlock.start_time)} – {formatTime(viewBlock.end_time)}</p>
                </div>
              </div>
              {viewBlock.notes && (
                <div><p className="text-xs text-gray-400 mb-0.5">{viewBlock.reason === "other" ? "Label" : "Notes"}</p><p className="text-sm text-gray-700">{viewBlock.notes}</p></div>
              )}
            </div>
            <div className="px-5 pb-5 space-y-2">
              {viewBlock.is_recurring && viewBlock.recurring_series_id && (
                <button onClick={() => handleStopBlockSeries(viewBlock.recurring_series_id!)} disabled={stoppingBlockSeries}
                  className="w-full py-2.5 rounded-xl border border-orange-200 text-sm font-semibold text-orange-600 hover:bg-orange-50 transition disabled:opacity-60">
                  {stoppingBlockSeries ? "Stopping…" : "Stop Recurring Block"}
                </button>
              )}
              <button onClick={() => handleDeleteBlock(viewBlock.id)} disabled={deletingBlock}
                className="w-full py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition disabled:opacity-60">
                {deletingBlock ? "Removing…" : (viewBlock.is_recurring ? "Remove This Occurrence Only" : "Remove Block")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
