import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ClientPackage } from "@/types";

const ERIC_USER_ID = "9c94baea-31aa-4a35-ad28-3a83955d34f1";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const TRAINER_HEX: Record<string, string> = {
  navy:      "#2A255D",
  teal:      "#06A29E",
  blue:      "#1F73B1",
  purple:    "#8B5CF6",
  green:     "#10B981",
  tomato:    "#EF4444",
  tangerine: "#F28C28",
  pink:      "#EC4899",
  amber:     "#F59E0B",
};

interface Trainer {
  id: string;
  user_id: string;
  display_color: string;
  name: string;
}

interface ClientBookingProps {
  clientId: string;
  activePackage: ClientPackage | null;
  onBooked: () => void;
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function addMinutes(time: string, min: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

function getAvailableDates(): Date[] {
  const dates: Date[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  while (dates.length < 30) {
    d.setDate(d.getDate() + 1);
    dates.push(new Date(d));
  }
  return dates;
}

export default function ClientBooking({ clientId, activePackage, onBooked }: ClientBookingProps) {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loadingTrainers, setLoadingTrainers] = useState(true);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<30 | 45 | 60 | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [confirmation, setConfirmation] = useState<{ date: string; time: string; duration: number; trainerName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTrainers() {
      setLoadingTrainers(true);
      const { data: trainerRows } = await supabase
        .from("trainers")
        .select("id, user_id, display_color")
        .neq("user_id", ERIC_USER_ID);

      if (!trainerRows || trainerRows.length === 0) { setLoadingTrainers(false); return; }

      const userIds = trainerRows.map((t: any) => t.user_id);
      const { data: userRows } = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .in("id", userIds);

      const uMap = new Map((userRows ?? []).map((u: any) => [u.id, u]));
      setTrainers(
        trainerRows.map((t: any) => {
          const u = uMap.get(t.user_id) as any;
          return {
            id: t.id,
            user_id: t.user_id,
            display_color: t.display_color ?? "navy",
            name: u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || "Trainer" : "Trainer",
          };
        })
      );
      setLoadingTrainers(false);
    }
    loadTrainers();
  }, []);

  const fetchSlots = useCallback(async (date: Date, trainerId: string) => {
    setLoadingSlots(true);
    setAvailableSlots([]);
    setSelectedTime(null);
    setSelectedDuration(null);
    setError(null);

    const dateStr = isoDate(date);
    const dayKey = DAY_KEYS[date.getDay()];

    const [availRes, apptRes] = await Promise.all([
      supabase
        .from("availability")
        .select("start_time, end_time")
        .eq("trainer_id", trainerId)
        .eq("is_active", true)
        .or(`and(is_recurring.eq.true,day_of_week.eq.${dayKey}),and(is_recurring.eq.false,specific_date.eq.${dateStr})`),
      supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("appointment_date", dateStr)
        .eq("trainer_id", trainerId)
        .not("status", "in", "(cancelled,forfeited)"),
    ]);

    const avail = (availRes.data ?? []) as { start_time: string; end_time: string }[];
    const booked = (apptRes.data ?? []) as { start_time: string; end_time: string }[];

    const slots: string[] = [];
    for (let slot = 5 * 60; slot <= 17 * 60 + 30; slot += 30) {
      const h = Math.floor(slot / 60);
      const m = slot % 60;
      const slotTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const slotEnd30 = addMinutes(slotTime, 30);

      const hasWindow = avail.some((a) => {
        const avS = a.start_time.slice(0, 5);
        const avE = a.end_time.slice(0, 5);
        return slotTime >= avS && slotEnd30 <= avE;
      });
      if (!hasWindow) continue;

      const conflict = booked.some(
        (b) => !(b.end_time.slice(0, 5) <= slotTime || b.start_time.slice(0, 5) >= slotEnd30)
      );
      if (!conflict) slots.push(slotTime);
    }

    setAvailableSlots(slots);
    setLoadingSlots(false);
  }, []);

  async function handleBook() {
    if (!selectedDate || !selectedTime || !selectedDuration || !activePackage || !selectedTrainer) return;
    setBooking(true);
    setError(null);

    const dateStr = isoDate(selectedDate);
    const dayKey = DAY_KEYS[selectedDate.getDay()];
    const endTime = addMinutes(selectedTime, selectedDuration);

    // Re-verify the slot is still open
    const [availRes, apptRes] = await Promise.all([
      supabase
        .from("availability")
        .select("start_time, end_time")
        .eq("trainer_id", selectedTrainer.id)
        .eq("is_active", true)
        .or(`and(is_recurring.eq.true,day_of_week.eq.${dayKey}),and(is_recurring.eq.false,specific_date.eq.${dateStr})`),
      supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("appointment_date", dateStr)
        .eq("trainer_id", selectedTrainer.id)
        .not("status", "in", "(cancelled,forfeited)"),
    ]);

    const avail = (availRes.data ?? []) as { start_time: string; end_time: string }[];
    const booked = (apptRes.data ?? []) as { start_time: string; end_time: string }[];

    const hasWindow = avail.some((a) => {
      const avS = a.start_time.slice(0, 5);
      const avE = a.end_time.slice(0, 5);
      return selectedTime >= avS && endTime <= avE;
    });
    const conflict = booked.some(
      (b) => !(b.end_time.slice(0, 5) <= selectedTime || b.start_time.slice(0, 5) >= endTime)
    );

    if (!hasWindow || conflict) {
      setError("This slot is no longer available. Please choose another time.");
      setBooking(false);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setError("Session expired. Please log in again."); setBooking(false); return; }

    const res = await fetch("/api/booking/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        trainer_id: selectedTrainer.id,
        client_id: clientId,
        client_package_id: activePackage.id,
        appointment_date: dateStr,
        start_time: selectedTime,
        duration_minutes: selectedDuration,
      }),
    });

    const data = await res.json() as { appointment?: { id: string }; error?: string };
    setBooking(false);

    if (!res.ok || data.error) {
      setError(data.error ?? "Failed to book. Please try again.");
      return;
    }

    setConfirmation({ date: dateStr, time: selectedTime, duration: selectedDuration, trainerName: selectedTrainer.name });
  }

  // No active package
  if (!activePackage || activePackage.sessions_remaining <= 0) {
    return (
      <div className="px-4 py-8 max-w-lg mx-auto text-center">
        <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3 className="font-bold text-[#2A255D] text-base mb-2">No Sessions Remaining</h3>
        <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
          Please contact Shape Studio to renew your package before booking a new session.
        </p>
      </div>
    );
  }

  // Booking confirmed
  if (confirmation) {
    return (
      <div className="px-4 py-8 max-w-lg mx-auto text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h3 className="font-bold text-[#2A255D] text-lg mb-2">Session Booked!</h3>
        <p className="text-sm text-gray-500 mb-1">
          {new Date(confirmation.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <p className="text-sm text-gray-500 mb-1">{formatTime(confirmation.time)} · {confirmation.duration} minutes</p>
        <p className="text-sm text-gray-500 mb-1">with {confirmation.trainerName.split(" ")[0]}</p>
        <p className="text-xs text-gray-400 mt-4">Sessions remaining: {activePackage.sessions_remaining}</p>
        <button
          onClick={() => {
            setConfirmation(null);
            setSelectedTrainer(null);
            setSelectedDate(null);
            setSelectedTime(null);
            setSelectedDuration(null);
            onBooked();
          }}
          className="mt-6 px-6 py-2.5 rounded-xl bg-[#06A29E] text-white text-sm font-semibold hover:bg-[#048e8a] transition"
        >
          View My Sessions
        </button>
      </div>
    );
  }

  const availableDates = getAvailableDates();

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      {/* Package badge */}
      <div className="flex items-center gap-2 bg-[#06A29E]/10 rounded-xl px-4 py-3 mb-5">
        <svg className="w-4 h-4 text-[#06A29E] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        </svg>
        <p className="text-sm text-[#06A29E] font-medium">
          {activePackage.sessions_remaining} session{activePackage.sessions_remaining !== 1 ? "s" : ""} remaining
          {activePackage.packages && <span className="text-[#06A29E]/70"> · {(activePackage.packages as any).name}</span>}
        </p>
      </div>

      {/* Step 0: Select trainer */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Select a Trainer</p>
        {loadingTrainers ? (
          <div className="flex items-center justify-center py-6">
            <svg className="animate-spin w-5 h-5 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {trainers.map((trainer) => {
              const hex = TRAINER_HEX[trainer.display_color] ?? "#2A255D";
              const isSelected = selectedTrainer?.id === trainer.id;
              return (
                <button
                  key={trainer.id}
                  onClick={() => {
                    setSelectedTrainer(trainer);
                    setSelectedDate(null);
                    setAvailableSlots([]);
                    setSelectedTime(null);
                    setSelectedDuration(null);
                    setError(null);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition text-left ${
                    isSelected
                      ? "border-[#2A255D] bg-[#2A255D]/5"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs"
                    style={{ backgroundColor: hex }}
                  >
                    {trainer.name.charAt(0)}
                  </div>
                  <span className={`text-sm font-semibold flex-1 ${isSelected ? "text-[#2A255D]" : "text-gray-700"}`}>
                    {trainer.name.split(" ")[0]}
                  </span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-[#06A29E] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 1: Select date */}
      {selectedTrainer && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Select a Date</p>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="flex gap-2 pb-2" style={{ width: "max-content" }}>
              {availableDates.map((date) => {
                const iso = isoDate(date);
                const isSelected = selectedDate && isoDate(selectedDate) === iso;
                return (
                  <button
                    key={iso}
                    onClick={() => {
                      setSelectedDate(date);
                      fetchSlots(date, selectedTrainer.id);
                    }}
                    className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl border transition flex-shrink-0 ${
                      isSelected
                        ? "bg-[#2A255D] border-[#2A255D] text-white"
                        : "bg-white border-gray-200 text-gray-700 hover:border-[#06A29E]"
                    }`}
                  >
                    <span className={`text-[10px] font-semibold uppercase ${isSelected ? "text-white/70" : "text-gray-400"}`}>
                      {DAY_NAMES[date.getDay()]}
                    </span>
                    <span className="text-base font-bold leading-none">{date.getDate()}</span>
                    <span className={`text-[10px] ${isSelected ? "text-white/70" : "text-gray-400"}`}>{MONTH_NAMES[date.getMonth()]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Select time */}
      {selectedDate && selectedTrainer && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Available Times</p>
          {loadingSlots ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin w-5 h-5 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : availableSlots.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6 bg-white rounded-xl border border-gray-100">
              No available slots on this day
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {availableSlots.map((slot) => (
                <button
                  key={slot}
                  onClick={() => { setSelectedTime(slot); setSelectedDuration(null); }}
                  className={`py-2.5 rounded-xl border text-sm font-semibold transition ${
                    selectedTime === slot
                      ? "bg-[#06A29E] border-[#06A29E] text-white"
                      : "bg-white border-gray-200 text-[#2A255D] hover:border-[#06A29E]"
                  }`}
                >
                  {formatTime(slot)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Select duration */}
      {selectedTime && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Session Duration</p>
          <div className="grid grid-cols-3 gap-2">
            {([30, 45, 60] as const).map((dur) => (
              <button
                key={dur}
                onClick={() => setSelectedDuration(dur)}
                className={`py-3 rounded-xl border text-sm font-semibold transition ${
                  selectedDuration === dur
                    ? "bg-[#2A255D] border-[#2A255D] text-white"
                    : "bg-white border-gray-200 text-[#2A255D] hover:border-[#2A255D]"
                }`}
              >
                {dur} min
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Step 4: Confirm */}
      {selectedDate && selectedTime && selectedDuration && selectedTrainer && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Booking Summary</p>
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Trainer</span>
              <span className="font-medium text-[#2A255D]">{selectedTrainer.name.split(" ")[0]}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Date</span>
              <span className="font-medium text-[#2A255D]">
                {selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Time</span>
              <span className="font-medium text-[#2A255D]">{formatTime(selectedTime)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Duration</span>
              <span className="font-medium text-[#2A255D]">{selectedDuration} minutes</span>
            </div>
          </div>
          <button
            onClick={handleBook}
            disabled={booking}
            className="w-full py-3 rounded-xl bg-[#06A29E] text-white font-semibold text-sm hover:bg-[#048e8a] transition disabled:opacity-60"
          >
            {booking ? "Booking…" : "Confirm Booking"}
          </button>
        </div>
      )}
    </div>
  );
}
