import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { AppUser } from "@/types";
import ClientManagement from "@/components/admin/ClientManagement";
import AdminCalendar from "@/components/admin/AdminCalendar";
import AdminPayroll from "@/components/admin/AdminPayroll";
import AdminRevenue from "@/components/admin/AdminRevenue";
import AdminTrainers from "@/components/admin/AdminTrainers";

type AdminSection = "dashboard" | "clients" | "payroll" | "revenue" | "trainers";

interface AdminDashboardProps {
  user: AppUser;
  onLogout: () => void;
}

const NAV_ITEMS: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  {
    id: "dashboard",
    label: "All Schedules",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: "clients",
    label: "Client Management",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
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
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
  },
  {
    id: "revenue",
    label: "Revenue Snapshot",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    id: "trainers",
    label: "Trainer Management",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </svg>
    ),
  },
];

function PlaceholderCard({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-[#2A255D]/8 flex items-center justify-center">{icon}</div>
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
  const [activeSection, setActiveSection] = useState<AdminSection>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Fire-and-forget session deduction on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        fetch("/api/admin/deduct-sessions", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {});
      }
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    onLogout();
  }

  const firstName = user.first_name ?? user.email.split("@")[0];
  const activeLabel = NAV_ITEMS.find((n) => n.id === activeSection)?.label ?? "";

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-[#2A255D] text-white flex-shrink-0">
        <div className="px-5 py-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#06A29E] flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="9" width="14" height="6" rx="1" />
                <path d="M3 9.5h2M19 9.5h2M3 14.5h2M19 14.5h2M6.5 6.5h11M6.5 17.5h11" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-bold tracking-wider text-white/90 uppercase leading-tight">Top Shape Fitness</div>
              <div className="text-[10px] text-white/40 leading-tight">Personal Training</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition text-left ${
                activeSection === item.id
                  ? "bg-white/15 text-white font-medium"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              {item.icon}
              {item.label}
              {activeSection === item.id && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#06A29E]" />
              )}
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

      {/* Mobile nav drawer overlay */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-64 bg-[#2A255D] text-white flex flex-col h-full shadow-xl">
            <div className="px-5 py-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#06A29E] flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="9" width="14" height="6" rx="1" />
                    <path d="M3 9.5h2M19 9.5h2M3 14.5h2M19 14.5h2M6.5 6.5h11M6.5 17.5h11" />
                  </svg>
                </div>
                <span className="text-sm font-bold text-white/90">Top Shape Fitness</span>
              </div>
              <button onClick={() => setMobileNavOpen(false)} className="p-1 text-white/50 hover:text-white">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-0.5">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setActiveSection(item.id); setMobileNavOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition text-left ${
                    activeSection === item.id ? "bg-white/15 text-white font-medium" : "text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="px-3 py-4 border-t border-white/10">
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition text-left">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Mobile top bar */}
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between md:px-6 md:py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-bold text-[#2A255D]">{activeLabel}</h1>
              <p className="text-xs text-gray-400 mt-0.5 hidden md:block">Welcome back, {firstName}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2A255D] border border-[#2A255D]/20 hover:bg-[#2A255D]/5 transition"
          >
            Log Out
          </button>
        </header>

        {/* Section content */}
        {activeSection === "clients" ? (
          <ClientManagement />
        ) : activeSection === "dashboard" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <AdminCalendar />
          </div>
        ) : activeSection === "payroll" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <AdminPayroll />
          </div>
        ) : activeSection === "revenue" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <AdminRevenue />
          </div>
        ) : activeSection === "trainers" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <AdminTrainers />
          </div>
        ) : (
          <main className="flex-1 p-4 md:p-6">
            <div className="max-w-3xl">
              <div className="mb-5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2A255D]/8 text-[#2A255D] text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#06A29E] inline-block" />
                  Admin Access · {firstName}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  onClick={() => setActiveSection("dashboard")}
                  className="bg-white rounded-xl p-5 shadow-sm border border-[#1F73B1]/30 cursor-pointer hover:shadow-md hover:border-[#1F73B1]/60 transition group"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-[#1F73B1]/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#1F73B1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#2A255D] text-sm group-hover:text-[#1F73B1] transition">All Schedules</h3>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">View and manage trainer availability and upcoming appointments.</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="h-1.5 flex-1 rounded-full bg-[#1F73B1]/20 mr-3">
                      <div className="h-full w-full rounded-full bg-[#1F73B1]" />
                    </div>
                    <span className="text-xs font-semibold text-[#1F73B1]">Open →</span>
                  </div>
                </div>
                <div
                  onClick={() => setActiveSection("payroll")}
                  className="bg-white rounded-xl p-5 shadow-sm border border-[#2A255D]/20 cursor-pointer hover:shadow-md hover:border-[#2A255D]/50 transition group"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-[#2A255D]/8 flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#2A255D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#2A255D] text-sm">Payroll</h3>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">Track trainer hours, session counts, and pay period summaries.</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="h-1.5 flex-1 rounded-full bg-[#2A255D]/15 mr-3">
                      <div className="h-full w-full rounded-full bg-[#2A255D]" />
                    </div>
                    <span className="text-xs font-semibold text-[#2A255D]">Open →</span>
                  </div>
                </div>
                <div
                  onClick={() => setActiveSection("revenue")}
                  className="bg-white rounded-xl p-5 shadow-sm border border-[#06A29E]/25 cursor-pointer hover:shadow-md hover:border-[#06A29E]/55 transition group"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-[#06A29E]/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#06A29E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#2A255D] text-sm">Revenue Snapshot</h3>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">Overview of package sales, active clients, and monthly revenue.</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="h-1.5 flex-1 rounded-full bg-[#06A29E]/20 mr-3">
                      <div className="h-full w-full rounded-full bg-[#06A29E]" />
                    </div>
                    <span className="text-xs font-semibold text-[#06A29E]">Open →</span>
                  </div>
                </div>
                <div
                  onClick={() => setActiveSection("clients")}
                  className="bg-white rounded-xl p-5 shadow-sm border border-[#06A29E]/30 cursor-pointer hover:shadow-md hover:border-[#06A29E]/60 transition group"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-[#06A29E]/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#06A29E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#2A255D] text-sm group-hover:text-[#06A29E] transition">Client Management</h3>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">Manage clients, assign packages, and track session balances.</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="h-1.5 flex-1 rounded-full bg-[#06A29E]/20 mr-3">
                      <div className="h-full w-full rounded-full bg-[#06A29E]" />
                    </div>
                    <span className="text-xs font-semibold text-[#06A29E]">Open →</span>
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
