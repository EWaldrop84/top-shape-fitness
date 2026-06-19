import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { ClientWithRelations, AppUser } from "@/types";

interface TrainerClientsProps {
  trainerId: string;
}

function fullName(u: AppUser | null | undefined) {
  if (!u) return "(no profile)";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Read-only client detail ───────────────────────────────────────────────────
function ClientReadonlyDetail({ client, lastSession, onBack }: {
  client: ClientWithRelations;
  lastSession: string | null;
  onBack: () => void;
}) {
  const u = client.users;
  const activePkg = client.client_packages?.find((p) => p.is_active);

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#2A255D] transition mb-4">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        All Clients
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        <div className="w-14 h-14 rounded-2xl bg-[#2A255D]/10 flex items-center justify-center flex-shrink-0">
          <span className="text-xl font-bold text-[#2A255D]">
            {(u?.first_name?.[0] ?? u?.email?.[0] ?? "?").toUpperCase()}
          </span>
        </div>
        <div>
          <h2 className="text-base font-bold text-[#2A255D]">{fullName(u)}</h2>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium mt-1 ${u?.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${u?.is_active ? "bg-emerald-500" : "bg-gray-400"}`} />
            {u?.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
        <h3 className="text-sm font-bold text-[#2A255D] mb-4">Profile</h3>
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
          <div><p className="text-xs text-gray-400 mb-0.5">Email</p><p className="text-[#2A255D] font-medium break-all">{u?.email ?? "—"}</p></div>
          <div><p className="text-xs text-gray-400 mb-0.5">Phone</p><p className="text-[#2A255D] font-medium">{u?.phone ?? "—"}</p></div>
          <div><p className="text-xs text-gray-400 mb-0.5">Last Session</p><p className="text-[#2A255D] font-medium">{formatDate(lastSession)}</p></div>
          <div><p className="text-xs text-gray-400 mb-0.5">Waiver</p><p className={`font-medium ${client.waiver_signed ? "text-emerald-600" : "text-orange-500"}`}>{client.waiver_signed ? "Signed" : "Not signed"}</p></div>
          {client.notes && (
            <div className="col-span-2"><p className="text-xs text-gray-400 mb-0.5">Notes</p><p className="text-gray-700 text-sm">{client.notes}</p></div>
          )}
        </div>
      </div>

      {/* Active package */}
      {activePkg && (
        <div className="bg-white rounded-xl border border-[#06A29E]/20 shadow-sm p-5">
          <h3 className="text-sm font-bold text-[#2A255D] mb-4">Active Package</h3>
          <p className="font-semibold text-[#2A255D] mb-3">{activePkg.packages?.name ?? "Package"}</p>
          <div className="grid grid-cols-3 gap-2">
            {[["Total", activePkg.sessions_total], ["Used", activePkg.sessions_used], ["Left", activePkg.sessions_remaining]].map(([label, val]) => (
              <div key={label} className="text-center bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-lg font-bold text-[#2A255D]">{val}</p>
              </div>
            ))}
          </div>
          {!activePkg.expiration_waived && activePkg.expiration_date && (
            <p className="text-xs text-gray-400 mt-3">Expires {formatDate(activePkg.expiration_date)}</p>
          )}
          {activePkg.expiration_waived && (
            <p className="text-xs text-emerald-600 mt-3 font-medium">Expiration waived</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TrainerClients({ trainerId }: TrainerClientsProps) {
  const [clients, setClients] = useState<ClientWithRelations[]>([]);
  const [lastSessionMap, setLastSessionMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientWithRelations | null>(null);

  useEffect(() => {
    fetchData();
  }, [trainerId]);

  async function fetchData() {
    setLoading(true);

    const [clientsRes, usersRes, lastApptRes] = await Promise.all([
      supabase
        .from("clients")
        .select(`
          id, notes, waiver_signed, waiver_date, created_by, user_id,
          client_packages!client_packages_owner_client_id_fkey (
            id, sessions_remaining, sessions_total, sessions_used,
            purchase_date, expiration_date, is_active, expiration_waived,
            packages!package_id ( id, name, session_count, duration_days )
          )
        `)
        .order("id", { ascending: false }),
      supabase
        .from("users")
        .select("id, email, first_name, last_name, phone, is_active, created_at, role")
        .eq("role", "client"),
      supabase
        .from("appointments")
        .select("client_id, appointment_date")
        .eq("trainer_id", trainerId)
        .eq("status", "completed")
        .order("appointment_date", { ascending: false }),
    ]);

    // Build user map
    const userMap = new Map<string, AppUser>();
    for (const u of (usersRes.data ?? []) as AppUser[]) userMap.set(u.id, u);

    // Merge clients + users
    const merged: ClientWithRelations[] = (clientsRes.data ?? []).map((c: any) => ({
      ...c,
      users: userMap.get(c.user_id) ?? null,
    }));

    // Build last session map (most recent completed appt per client with this trainer)
    const lastMap = new Map<string, string>();
    for (const appt of (lastApptRes.data ?? []) as any[]) {
      if (!lastMap.has(appt.client_id)) {
        lastMap.set(appt.client_id, appt.appointment_date);
      }
    }

    setClients(merged);
    setLastSessionMap(lastMap);
    setLoading(false);
  }

  if (selectedClient) {
    return (
      <ClientReadonlyDetail
        client={selectedClient}
        lastSession={lastSessionMap.get(selectedClient.id) ?? null}
        onBack={() => setSelectedClient(null)}
      />
    );
  }

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = fullName(c.users).toLowerCase();
    const phone = (c.users?.phone ?? "").toLowerCase();
    const email = (c.users?.email ?? "").toLowerCase();
    return name.includes(q) || phone.includes(q) || email.includes(q);
  });

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h2 className="text-base font-bold text-[#2A255D]">All Clients</h2>
        <p className="text-xs text-gray-400 mt-0.5">{clients.length} total</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          placeholder="Search by name, phone or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-6 h-6 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-gray-400">{search ? "No clients match your search" : "No clients yet"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((client) => {
            const u = client.users;
            const activePkg = client.client_packages?.find((p) => p.is_active);
            const last = lastSessionMap.get(client.id);
            return (
              <button
                key={client.id}
                onClick={() => setSelectedClient(client)}
                className="w-full bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left hover:border-[#06A29E]/30 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#2A255D] truncate">{fullName(u)}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{u?.phone ?? u?.email ?? "—"}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {activePkg ? (
                      <p className="text-sm font-bold text-[#2A255D]">{activePkg.sessions_remaining}</p>
                    ) : (
                      <p className="text-sm text-gray-300">—</p>
                    )}
                    <p className="text-[11px] text-gray-400">{activePkg ? "sessions left" : "no package"}</p>
                  </div>
                </div>
                {last && (
                  <p className="text-[11px] text-gray-400 mt-2">
                    Last session with you: <span className="text-gray-600">{formatDate(last)}</span>
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
