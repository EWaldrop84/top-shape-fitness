import { supabase } from "@/lib/supabase";
import type { AppUser } from "@/types";

interface AdminDashboardProps {
  user: AppUser;
  onLogout: () => void;
}

function StatCard({ title, icon, description }: { title: string; icon: React.ReactNode; description: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-[#2A255D]/8 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-[#2A255D] text-sm">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="mt-4 h-1.5 rounded-full bg-gray-100">
        <div className="h-full w-0 rounded-full bg-[#06A29E]" />
      </div>
      <p className="text-[11px] text-gray-300 mt-1.5">Coming soon</p>
    </div>
  );
}

export default function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  async function handleLogout() {
    await supabase.auth.signOut();
    onLogout();
  }

  const firstName = user.first_name ?? user.email.split("@")[0];

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-[#2A255D] text-white">
        <div className="px-5 py-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#06A29E] flex items-center justify-center flex-shrink-0">
              <svg className="w-4.5 h-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="9" width="14" height="6" rx="1" />
                <path d="M3 9.5h2M19 9.5h2M3 14.5h2M19 14.5h2M6.5 6.5h11M6.5 17.5h11" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-bold tracking-wider text-white/90 uppercase leading-tight">Top Shape</div>
              <div className="text-[10px] text-white/40 leading-tight">Fitness</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {[
            { label: "All Schedules", icon: "📅" },
            { label: "Client Management", icon: "👥" },
            { label: "Payroll", icon: "💰" },
            { label: "Revenue Snapshot", icon: "📊" },
          ].map((item) => (
            <button
              key={item.label}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition text-left"
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <div className="px-3 py-2.5 mb-1">
            <p className="text-xs font-medium text-white truncate">{user.email}</p>
            <p className="text-[11px] text-white/40 mt-0.5">Administrator</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition text-left"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between md:px-6 md:py-4">
          <div>
            <h1 className="text-base font-bold text-[#2A255D] md:text-lg">Admin Dashboard</h1>
            <p className="text-xs text-gray-400 mt-0.5">Welcome back, {firstName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2A255D] border border-[#2A255D]/20 hover:bg-[#2A255D]/5 transition"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log Out
          </button>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <div className="max-w-3xl">
            <div className="mb-5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2A255D]/8 text-[#2A255D] text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#06A29E] inline-block" />
                Admin Access
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard
                title="All Schedules"
                description="View and manage trainer availability and upcoming appointments."
                icon={
                  <svg className="w-5 h-5 text-[#2A255D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                }
              />
              <StatCard
                title="Client Management"
                description="Add, edit, and review client profiles, waivers, and packages."
                icon={
                  <svg className="w-5 h-5 text-[#2A255D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    <path d="M16 3.13a4 4 0 010 7.75" />
                  </svg>
                }
              />
              <StatCard
                title="Payroll"
                description="Track trainer hours, session counts, and pay period summaries."
                icon={
                  <svg className="w-5 h-5 text-[#2A255D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                  </svg>
                }
              />
              <StatCard
                title="Revenue Snapshot"
                description="Overview of package sales, active clients, and monthly revenue."
                icon={
                  <svg className="w-5 h-5 text-[#2A255D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                }
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
