import { supabase } from "@/lib/supabase";
import type { AppUser } from "@/types";

interface ClientPortalProps {
  user: AppUser;
  onLogout: () => void;
}

function PortalCard({ title, icon, description, accent }: { title: string; icon: React.ReactNode; description: string; accent: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 active:scale-[0.98] transition-all">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${accent}`}>
        {icon}
      </div>
      <h3 className="font-semibold text-[#2A255D] text-sm">{title}</h3>
      <p className="text-xs text-gray-400 mt-1 leading-relaxed">{description}</p>
      <div className="mt-4 flex items-center gap-1.5">
        <div className="flex-1 h-1 rounded-full bg-gray-100" />
        <span className="text-[11px] text-gray-300">Coming soon</span>
      </div>
    </div>
  );
}

export default function ClientPortal({ user, onLogout }: ClientPortalProps) {
  async function handleLogout() {
    await supabase.auth.signOut();
    onLogout();
  }

  const firstName = user.first_name ?? user.email.split("@")[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-[#2A255D] text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#06A29E] flex items-center justify-center flex-shrink-0">
              <svg className="w-4.5 h-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="9" width="14" height="6" rx="1" />
                <path d="M3 9.5h2M19 9.5h2M3 14.5h2M19 14.5h2M6.5 6.5h11M6.5 17.5h11" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-bold tracking-wider text-white/90 uppercase leading-tight">Client Portal</div>
              <div className="text-[10px] text-white/40 leading-tight">Top Shape Fitness</div>
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
        </div>
      </header>

      {/* Hero greeting */}
      <div className="bg-gradient-to-br from-[#2A255D] to-[#1F73B1] px-4 py-6 text-white">
        <p className="text-sm text-white/60">Good to see you,</p>
        <h1 className="text-2xl font-bold mt-0.5">{firstName} 👋</h1>
      </div>

      <main className="px-4 py-5 max-w-lg mx-auto -mt-3">
        <div className="grid grid-cols-1 gap-4">
          <PortalCard
            title="My Sessions"
            description="View your upcoming and past training sessions with your trainer."
            accent="bg-[#06A29E]/12"
            icon={
              <svg className="w-5 h-5 text-[#06A29E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <path d="M9 14l2 2 4-4" />
              </svg>
            }
          />
          <PortalCard
            title="Book Appointment"
            description="Schedule a new training session with your trainer at your preferred time."
            accent="bg-[#1F73B1]/10"
            icon={
              <svg className="w-5 h-5 text-[#1F73B1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="12" x2="14.5" y2="14.5" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
              </svg>
            }
          />
          <PortalCard
            title="My Package Balance"
            description="Check remaining sessions, expiration dates, and package details."
            accent="bg-[#2A255D]/8"
            icon={
              <svg className="w-5 h-5 text-[#2A255D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            }
          />
        </div>
      </main>
    </div>
  );
}
