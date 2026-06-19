import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ClientWithRelations } from "@/types";

interface ClientListProps {
  onView: (id: string) => void;
  onAdd: () => void;
}

function fullName(u: ClientWithRelations["users"]) {
  if (!u) return "(no profile)";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
}

function statusBadge(isActive: boolean) {
  return isActive ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      Inactive
    </span>
  );
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ClientList({ onView, onAdd }: ClientListProps) {
  const [clients, setClients] = useState<ClientWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("clients")
      .select(`
        id, notes, waiver_signed, waiver_date, created_by,
        users!user_id ( id, email, first_name, last_name, phone, is_active, created_at, role ),
        client_packages!client_packages_owner_client_id_fkey (
          id, sessions_remaining, sessions_total, sessions_used,
          purchase_date, expiration_date, is_active, expiration_waived,
          packages!package_id ( id, name, session_count, duration_days )
        )
      `)
      .order("id", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setClients((data as unknown as ClientWithRelations[]) ?? []);
    }
    setLoading(false);
  }

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = fullName(c.users).toLowerCase();
    const email = (c.users?.email ?? "").toLowerCase();
    const phone = (c.users?.phone ?? "").toLowerCase();
    return name.includes(q) || email.includes(q) || phone.includes(q);
  });

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-base font-bold text-[#2A255D]">All Clients</h2>
          <p className="text-xs text-gray-400 mt-0.5">{clients.length} total</p>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#06A29E] text-white text-sm font-semibold hover:bg-[#048e8a] transition shadow-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add New Client
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          placeholder="Search by name, email or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-6 h-6 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 font-medium">
            {search ? "No clients match your search" : "No clients yet"}
          </p>
          {!search && (
            <button onClick={onAdd} className="mt-3 text-sm text-[#06A29E] font-medium hover:underline">
              Add your first client
            </button>
          )}
        </div>
      )}

      {/* Client list */}
      {!loading && filtered.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Package</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sessions Left</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expires</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((client) => {
                  const u = client.users;
                  const activePkg = client.client_packages?.find((p) => p.is_active);
                  return (
                    <tr key={client.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#2A255D]">{fullName(u)}</p>
                        <p className="text-xs text-gray-400">{u?.email ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{u?.phone ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-gray-500 capitalize">{u?.role ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {activePkg?.packages?.name ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {activePkg ? (
                          <span className={`font-semibold ${activePkg.sessions_remaining <= 2 ? "text-orange-600" : "text-[#2A255D]"}`}>
                            {activePkg.sessions_remaining}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {activePkg?.expiration_waived ? (
                          <span className="text-emerald-600 font-medium">Waived</span>
                        ) : (
                          formatDate(activePkg?.expiration_date)
                        )}
                      </td>
                      <td className="px-4 py-3">{statusBadge(u?.is_active ?? false)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onView(client.id)}
                          className="px-3 py-1.5 rounded-lg border border-[#2A255D]/20 text-xs font-medium text-[#2A255D] hover:bg-[#2A255D]/5 transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((client) => {
              const u = client.users;
              const activePkg = client.client_packages?.find((p) => p.is_active);
              return (
                <div key={client.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-semibold text-[#2A255D]">{fullName(u)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{u?.email ?? "—"}</p>
                      {u?.phone && (
                        <p className="text-xs text-gray-500 mt-0.5">{u.phone}</p>
                      )}
                      {u?.role && (
                        <p className="text-xs text-gray-400 mt-0.5 capitalize">{u.role}</p>
                      )}
                    </div>
                    {statusBadge(u?.is_active ?? false)}
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      {activePkg ? (
                        <p className="text-xs text-gray-500">
                          <span className="font-medium text-[#2A255D]">{activePkg.sessions_remaining}</span> sessions left
                          {activePkg.packages && <span className="text-gray-400"> · {activePkg.packages.name}</span>}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">No active package</p>
                      )}
                    </div>
                    <button
                      onClick={() => onView(client.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#2A255D] text-xs font-medium text-white hover:bg-[#1e1a47] transition"
                    >
                      View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
