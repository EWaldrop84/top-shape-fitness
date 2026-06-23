import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { AppUser, ClientPackage } from "@/types";
import ClientSessions from "@/components/client/ClientSessions";

type ClientTab = "sessions" | "package";

interface ClientPortalProps {
  user: AppUser;
  onLogout: () => void;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TABS: { id: ClientTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "sessions",
    label: "Sessions",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="M9 14l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: "package",
    label: "Package",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
];

export default function ClientPortal({ user, onLogout }: ClientPortalProps) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [activePackage, setActivePackage] = useState<ClientPackage | null>(null);
  const [allPackages, setAllPackages] = useState<ClientPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ClientTab>("sessions");

  const firstName = user.first_name ?? user.email.split("@")[0];

  useEffect(() => {
    loadClientData();
  }, [user.id]);

  async function loadClientData() {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!clientRow) { setLoading(false); return; }
    setClientId(clientRow.id);

    const { data: pkgs } = await supabase
      .from("client_packages")
      .select("id, owner_client_id, package_id, sessions_remaining, sessions_total, sessions_used, purchase_date, expiration_date, expiration_waived, is_active, is_shared, shared_with_client_id, packages!package_id(id, name, session_count, duration_days, is_active)")
      .eq("owner_client_id", clientRow.id)
      .order("purchase_date", { ascending: false });

    const clientPkgs = (pkgs ?? []) as unknown as ClientPackage[];
    setAllPackages(clientPkgs);
    setActivePackage(clientPkgs.find((p) => p.is_active) ?? null);
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    onLogout();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="animate-spin w-7 h-7 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#2A255D] text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#06A29E] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="9" width="14" height="6" rx="1" />
              <path d="M3 9.5h2M19 9.5h2M3 14.5h2M19 14.5h2M6.5 6.5h11M6.5 17.5h11" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">{firstName}</p>
            <p className="text-[11px] text-white/50 leading-tight">
              {activePackage
                ? `${activePackage.sessions_remaining} session${activePackage.sessions_remaining !== 1 ? "s" : ""} remaining`
                : "Client Portal"}
            </p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 border border-white/20 hover:bg-white/10 transition">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log Out
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto pb-20">
        {!clientId ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <p className="text-sm text-gray-500">Client profile not found. Please contact your studio.</p>
          </div>
        ) : (
          <>
            {tab === "sessions" && (
              <ClientSessions clientId={clientId} />
            )}
            {tab === "package" && (
              <div className="px-4 py-5 max-w-lg mx-auto">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">My Packages</p>
                {allPackages.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
                    <p className="text-sm text-gray-400">No packages on file</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allPackages.map((pkg) => (
                      <div key={pkg.id} className={`bg-white rounded-xl border shadow-sm p-4 ${pkg.is_active ? "border-[#06A29E]/20" : "border-gray-100 opacity-70"}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-[#2A255D]">{(pkg.packages as any)?.name ?? "Package"}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{pkg.is_active ? "Active" : "Inactive"}</p>
                          </div>
                          {pkg.is_active && (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">Active</span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          {[["Total", pkg.sessions_total], ["Used", pkg.sessions_used], ["Left", pkg.sessions_remaining]].map(([label, val]) => (
                            <div key={label} className="text-center bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                              <p className="text-xs text-gray-400">{label}</p>
                              <p className="text-lg font-bold text-[#2A255D]">{val}</p>
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-gray-400">
                          {pkg.expiration_waived ? (
                            <span className="text-emerald-600 font-medium">No expiration</span>
                          ) : pkg.expiration_date ? (
                            <span>Expires {formatDate(pkg.expiration_date)}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-1px_8px_rgba(0,0,0,0.06)] flex z-40">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 relative transition ${active ? "text-[#2A255D]" : "text-gray-400 hover:text-gray-600"}`}>
              {t.icon}
              <span className={`text-[11px] font-semibold leading-none ${active ? "text-[#2A255D]" : "text-gray-400"}`}>{t.label}</span>
              {active && <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-[#06A29E]" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
