import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { AppUser, Trainer, TrainerWithName } from "@/types";
import TrainerSchedule from "@/components/trainer/TrainerSchedule";

interface TrainerPortalProps {
  user: AppUser;
  onLogout: () => void;
}

export default function TrainerPortal({ user, onLogout }: TrainerPortalProps) {
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [allTrainers, setAllTrainers] = useState<TrainerWithName[]>([]);
  const [loading, setLoading] = useState(true);

  const firstName = user.first_name ?? user.email.split("@")[0];

  useEffect(() => {
    async function load() {
      const [ownRes, allRes] = await Promise.all([
        supabase
          .from("trainers")
          .select("id, user_id, display_color, bio, is_active")
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("trainers")
          .select("id, user_id, display_color, bio, is_active, users(first_name, last_name)")
          .eq("is_active", true),
      ]);

      setTrainer((ownRes.data as Trainer) ?? null);

      const trainers: TrainerWithName[] = ((allRes.data ?? []) as any[]).map((t) => ({
        id: t.id,
        user_id: t.user_id,
        display_color: t.display_color,
        bio: t.bio,
        is_active: t.is_active,
        first_name: t.users?.first_name ?? null,
        last_name: t.users?.last_name ?? null,
      }));
      setAllTrainers(trainers);
      setLoading(false);
    }
    load();
  }, [user.id]);

  async function handleLogout() {
    await supabase.auth.signOut();
    onLogout();
  }

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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
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

      <main className="flex-1 overflow-auto">
        <TrainerSchedule
          trainerId={trainer.id}
          allTrainers={allTrainers}
        />
      </main>
    </div>
  );
}
