import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { AppUser, Trainer } from "@/types";
import TrainerSchedule from "@/components/trainer/TrainerSchedule";
import TrainerClients from "@/components/trainer/TrainerClients";
import TrainerPayroll from "@/components/trainer/TrainerPayroll";

type Tab = "schedule" | "clients" | "payroll";

interface TrainerPortalProps {
  user: AppUser;
  onLogout: () => void;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "schedule",
    label: "Schedule",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </svg>
    ),
  },
  {
    id: "clients",
    label: "Clients",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    id: "payroll",
    label: "Payroll",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
];

export default function TrainerPortal({ user, onLogout }: TrainerPortalProps) {
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("schedule");

  const firstName = user.first_name ?? user.email.split("@")[0];

  useEffect(() => {
    supabase
      .from("trainers")
      .select("id, user_id, display_color, bio, is_active")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setTrainer((data as Trainer) ?? null);
        setLoading(false);
      });
  }, [user.id]);

  async function handleLogout() {
    await supabase.auth.signOut();
    onLogout();
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="animate-spin w-8 h-8 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  // ── No trainer profile ────────────────────────────────────────────────────
  if (!trainer) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-base font-bold text-[#2A255D] mb-2">Trainer profile not found</h2>
        <p className="text-sm text-gray-400 mb-6 max-w-xs">
          Your account doesn't have a trainer profile yet. Please ask your administrator to set one up.
        </p>
        <button
          onClick={handleLogout}
          className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          Log Out
        </button>
      </div>
    );
  }

  // ── Main portal ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#2A255D] text-white px-4 pt-4 pb-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-white">
              {firstName[0].toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">{firstName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#06A29E]" />
              <p className="text-[11px] text-white/50 leading-tight">Trainer Access</p>
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 border border-white/20 hover:bg-white/10 transition"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log Out
        </button>
      </header>

      {/* Tab content — scrollable area above bottom nav */}
      <main className="flex-1 overflow-auto pb-20">
        {tab === "schedule" && <TrainerSchedule trainerId={trainer.id} />}
        {tab === "clients"  && <TrainerClients  trainerId={trainer.id} />}
        {tab === "payroll"  && <TrainerPayroll  trainerId={trainer.id} />}
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-1px_8px_rgba(0,0,0,0.06)] flex z-40">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition ${active ? "text-[#2A255D]" : "text-gray-400 hover:text-gray-600"}`}
            >
              <span className={active ? "text-[#2A255D]" : "text-gray-400"}>{t.icon}</span>
              <span className={`text-[11px] font-semibold leading-none ${active ? "text-[#2A255D]" : "text-gray-400"}`}>{t.label}</span>
              {active && <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-[#06A29E]" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
