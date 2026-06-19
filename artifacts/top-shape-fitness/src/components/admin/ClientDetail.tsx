import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ClientWithRelations, Package, ClientPackage, Appointment } from "@/types";

interface ClientDetailProps {
  clientId: string;
  onBack: () => void;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function statusColor(status: string) {
  switch (status) {
    case "completed": return "bg-emerald-50 text-emerald-700";
    case "cancelled": return "bg-red-50 text-red-600";
    case "no_show": return "bg-orange-50 text-orange-600";
    case "forfeited": return "bg-purple-50 text-purple-600";
    default: return "bg-blue-50 text-blue-600";
  }
}

// ── Assign Package Modal ─────────────────────────────────────────────────────
interface AssignModalProps {
  clientId: string;
  onClose: () => void;
  onSuccess: () => void;
}
function AssignPackageModal({ clientId, onClose, onSuccess }: AssignModalProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    package_id: "",
    purchase_date: today(),
    expiration_date: "",
    is_shared: false,
    shared_with_client_id: "",
    sessions_override: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("packages").select("*").eq("is_active", true).then(({ data }) => {
      setPackages((data ?? []) as Package[]);
    });
    supabase
      .from("clients")
      .select("id, users!user_id(first_name, last_name, email)")
      .neq("id", clientId)
      .then(({ data }) => {
        setAllClients(
          (data ?? []).map((c: any) => ({
            id: c.id,
            name: [c.users?.first_name, c.users?.last_name].filter(Boolean).join(" ") || c.users?.email || c.id,
          }))
        );
      });
  }, [clientId]);

  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "package_id" || k === "purchase_date") {
        const pkg = packages.find((p) => p.id === (k === "package_id" ? v : f.package_id));
        if (pkg && next.purchase_date) {
          next.expiration_date = addDays(next.purchase_date, pkg.duration_days);
        }
      }
      return next;
    });
  }

  const selectedPkg = packages.find((p) => p.id === form.package_id);
  const sessionsTotal = form.sessions_override
    ? parseInt(form.sessions_override)
    : (selectedPkg?.session_count ?? 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.package_id) { setError("Please select a package."); return; }
    setError(null);
    setLoading(true);
    const { error } = await supabase.from("client_packages").insert({
      package_id: form.package_id,
      owner_client_id: clientId,
      sessions_total: sessionsTotal,
      sessions_remaining: sessionsTotal,
      sessions_used: 0,
      purchase_date: form.purchase_date || null,
      expiration_date: form.expiration_date || null,
      expiration_waived: false,
      is_active: true,
      is_shared: form.is_shared,
      shared_with_client_id: form.is_shared && form.shared_with_client_id ? form.shared_with_client_id : null,
    });
    if (error) setError(error.message);
    else { onSuccess(); onClose(); }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-[#2A255D]">Assign Package</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Package <span className="text-red-500">*</span></label>
            <select
              required
              value={form.package_id}
              onChange={(e) => setField("package_id", e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
            >
              <option value="">Select a package…</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.session_count} sessions)</option>
              ))}
            </select>
          </div>

          {selectedPkg && (
            <div>
              <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Sessions (override optional)</label>
              <input
                type="number"
                min="1"
                value={form.sessions_override}
                onChange={(e) => setForm((f) => ({ ...f, sessions_override: e.target.value }))}
                placeholder={`Default: ${selectedPkg.session_count}`}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Purchase Date</label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={(e) => setField("purchase_date", e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Expiration Date</label>
              <input
                type="date"
                value={form.expiration_date}
                onChange={(e) => setForm((f) => ({ ...f, expiration_date: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, is_shared: !f.is_shared }))}
              className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${form.is_shared ? "bg-[#06A29E]" : "bg-gray-200"}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_shared ? "translate-x-5" : "translate-x-1"}`} />
            </button>
            <span className="text-sm font-medium text-[#2A255D]">Shared Package</span>
          </label>

          {form.is_shared && (
            <div>
              <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Share with Client</label>
              <select
                value={form.shared_with_client_id}
                onChange={(e) => setForm((f) => ({ ...f, shared_with_client_id: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
              >
                <option value="">Select a client…</option>
                {allClients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg bg-[#06A29E] text-white text-sm font-semibold hover:bg-[#048e8a] transition disabled:opacity-60"
            >
              {loading ? "Assigning…" : "Assign Package"}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Adjust Sessions Modal ────────────────────────────────────────────────────
interface AdjustModalProps {
  pkg: ClientPackage;
  onClose: () => void;
  onSuccess: () => void;
}
function AdjustSessionsModal({ pkg, onClose, onSuccess }: AdjustModalProps) {
  const [value, setValue] = useState(String(pkg.sessions_remaining));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const n = parseInt(value);
    if (isNaN(n) || n < 0) { setError("Please enter a valid number."); return; }
    setError(null);
    setLoading(true);
    const used = pkg.sessions_total - n;
    const { error } = await supabase
      .from("client_packages")
      .update({ sessions_remaining: n, sessions_used: Math.max(0, used) })
      .eq("id", pkg.id);
    if (error) setError(error.message);
    else { onSuccess(); onClose(); }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-[#2A255D]">Adjust Sessions</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-1">
          Package: <span className="font-medium text-[#2A255D]">{pkg.packages?.name ?? "—"}</span>
        </p>
        <div className="flex items-center gap-4 mb-5 p-3 bg-gray-50 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-gray-400">Total</p>
            <p className="text-lg font-bold text-[#2A255D]">{pkg.sessions_total}</p>
          </div>
          <div className="flex-1 h-px bg-gray-200" />
          <div className="text-center">
            <p className="text-xs text-gray-400">Used</p>
            <p className="text-lg font-bold text-gray-500">{pkg.sessions_used}</p>
          </div>
          <div className="flex-1 h-px bg-gray-200" />
          <div className="text-center">
            <p className="text-xs text-gray-400">Remaining</p>
            <p className="text-lg font-bold text-[#06A29E]">{pkg.sessions_remaining}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-[#2A255D] mb-1.5">New Sessions Remaining</label>
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition text-center text-lg font-bold"
          />
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-[#06A29E] text-white text-sm font-semibold hover:bg-[#048e8a] transition disabled:opacity-60"
          >
            {loading ? "Saving…" : "Save Changes"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ClientDetail ────────────────────────────────────────────────────────
export default function ClientDetail({ clientId, onBack }: ClientDetailProps) {
  const [client, setClient] = useState<ClientWithRelations | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", phone: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [adjustPkg, setAdjustPkg] = useState<ClientPackage | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchClient = useCallback(async () => {
    // Three separate queries to avoid RLS join issues on the users table
    const [clientRes, apptRes] = await Promise.all([
      supabase
        .from("clients")
        .select(`
          id, notes, waiver_signed, waiver_date, created_by, user_id,
          client_packages!client_packages_owner_client_id_fkey (
            id, package_id, owner_client_id, sessions_total, sessions_remaining, sessions_used,
            purchase_date, expiration_date, expiration_waived, is_active, is_shared, shared_with_client_id,
            packages!package_id ( id, name, session_count, duration_days, is_active )
          )
        `)
        .eq("id", clientId)
        .single(),
      supabase
        .from("appointments")
        .select(`
          id, appointment_date, start_time, end_time, duration_minutes, status, notes,
          trainers!trainer_id ( users!user_id ( first_name, last_name ) )
        `)
        .eq("client_id", clientId)
        .order("appointment_date", { ascending: false })
        .limit(20),
    ]);

    if (clientRes.error) {
      setError(clientRes.error.message);
      setLoading(false);
      return;
    }

    const clientRow = clientRes.data as any;

    // Separately fetch the user profile to sidestep RLS join restrictions
    const { data: userData } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, phone, is_active, created_at, role")
      .eq("id", clientRow.user_id)
      .single();

    const c: ClientWithRelations = {
      ...clientRow,
      users: userData ?? null,
    };

    setClient(c);
    setEditForm({
      first_name: c.users?.first_name ?? "",
      last_name: c.users?.last_name ?? "",
      phone: c.users?.phone ?? "",
      notes: c.notes ?? "",
    });

    setAppointments((apptRes.data as unknown as Appointment[]) ?? []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  async function handleSaveEdit() {
    if (!client) return;
    setSaving(true);
    const [{ error: userErr }, { error: clientErr }] = await Promise.all([
      supabase.from("users").update({
        first_name: editForm.first_name || null,
        last_name: editForm.last_name || null,
        phone: editForm.phone || null,
      }).eq("id", client.users?.id ?? client.user_id),
      supabase.from("clients").update({ notes: editForm.notes || null }).eq("id", clientId),
    ]);
    if (userErr || clientErr) {
      setError(userErr?.message ?? clientErr?.message ?? "Save failed");
    } else {
      setIsEditing(false);
      await fetchClient();
    }
    setSaving(false);
  }

  async function toggleExpirationWaived(pkg: ClientPackage) {
    setToggling(pkg.id);
    await supabase.from("client_packages").update({ expiration_waived: !pkg.expiration_waived }).eq("id", pkg.id);
    await fetchClient();
    setToggling(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin w-6 h-6 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="text-sm text-[#06A29E] hover:underline mb-4 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Back
        </button>
        <p className="text-sm text-red-600">{error ?? "Client not found"}</p>
      </div>
    );
  }

  const sortedPkgs = [...(client.client_packages ?? [])].sort((a, b) => Number(b.is_active) - Number(a.is_active));
  const fullName = [client.users?.first_name, client.users?.last_name].filter(Boolean).join(" ") || client.users?.email || "(no profile)";

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg text-gray-400 hover:text-[#2A255D] hover:bg-gray-100 transition flex-shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </button>
        <div>
          <h2 className="text-base font-bold text-[#2A255D]">{fullName}</h2>
          <p className="text-xs text-gray-400">Joined {formatDate(client.users?.created_at)}</p>
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[#2A255D]">Profile</h3>
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleSaveEdit} disabled={saving} className="px-3 py-1.5 rounded-lg bg-[#06A29E] text-white text-xs font-semibold hover:bg-[#048e8a] transition disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => { setIsEditing(false); setEditForm({ first_name: client.users?.first_name ?? "", last_name: client.users?.last_name ?? "", phone: client.users?.phone ?? "", notes: client.notes ?? "" }); }} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "First Name", key: "first_name" as const, placeholder: "Jane" },
              { label: "Last Name", key: "last_name" as const, placeholder: "Smith" },
              { label: "Phone", key: "phone" as const, placeholder: "(555) 000-0000" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className={key === "phone" ? "col-span-2" : ""}>
                <label className="block text-xs font-medium text-[#2A255D] mb-1">{label}</label>
                <input
                  type="text"
                  value={editForm[key]}
                  onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
                />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[#2A255D] mb-1">Notes</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Any notes…"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition resize-none"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <div><p className="text-xs text-gray-400 mb-0.5">Email</p><p className="text-[#2A255D] font-medium break-all">{client.users?.email ?? "—"}</p></div>
            <div><p className="text-xs text-gray-400 mb-0.5">Phone</p><p className="text-[#2A255D] font-medium">{client.users?.phone ?? "—"}</p></div>
            <div className="col-span-2"><p className="text-xs text-gray-400 mb-0.5">Notes</p><p className="text-gray-700">{client.notes || <span className="text-gray-300 italic">None</span>}</p></div>
            <div><p className="text-xs text-gray-400 mb-0.5">Waiver</p><p className={`font-medium ${client.waiver_signed ? "text-emerald-600" : "text-orange-500"}`}>{client.waiver_signed ? "Signed" : "Not signed"}</p></div>
            <div><p className="text-xs text-gray-400 mb-0.5">Status</p><p className={`font-medium ${client.users?.is_active ? "text-emerald-600" : "text-gray-400"}`}>{client.users?.is_active ? "Active" : "Inactive"}</p></div>
          </div>
        )}
      </div>

      {/* Packages */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[#2A255D]">Packages</h3>
          <button
            onClick={() => setShowAssign(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#06A29E] text-white text-xs font-semibold hover:bg-[#048e8a] transition"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Assign Package
          </button>
        </div>

        {sortedPkgs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No packages assigned yet.</p>
        ) : (
          <div className="space-y-3">
            {sortedPkgs.map((pkg) => (
              <div key={pkg.id} className={`rounded-lg border p-4 ${pkg.is_active ? "border-[#06A29E]/20 bg-[#06A29E]/3" : "border-gray-100 bg-gray-50/50 opacity-70"}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold text-[#2A255D] text-sm">{pkg.packages?.name ?? "Package"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{pkg.is_active ? "Active" : "Inactive"}{pkg.is_shared ? " · Shared" : ""}</p>
                  </div>
                  {pkg.is_active && (
                    <button onClick={() => setAdjustPkg(pkg)} className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-[#2A255D]/20 text-[11px] font-medium text-[#2A255D] hover:bg-[#2A255D]/5 transition">
                      Adjust
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[["Total", pkg.sessions_total], ["Used", pkg.sessions_used], ["Left", pkg.sessions_remaining]].map(([label, val]) => (
                    <div key={label} className="text-center bg-white rounded-lg p-2 border border-gray-100">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className={`text-lg font-bold ${label === "Left" && Number(val) <= 2 ? "text-orange-600" : "text-[#2A255D]"}`}>{val}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div>
                    <span className="text-gray-400">Purchased:</span> {formatDate(pkg.purchase_date)}
                    <span className="mx-2 text-gray-200">·</span>
                    <span className="text-gray-400">Expires:</span>{" "}
                    {pkg.expiration_waived ? <span className="text-emerald-600 font-medium">Waived</span> : formatDate(pkg.expiration_date)}
                  </div>
                  <button
                    onClick={() => toggleExpirationWaived(pkg)}
                    disabled={toggling === pkg.id}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition ${pkg.expiration_waived ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-gray-200 text-gray-500 hover:bg-gray-100"}`}
                  >
                    {toggling === pkg.id ? "…" : pkg.expiration_waived ? "Restore Expiry" : "Waive Expiry"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Appointment history */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-[#2A255D] mb-4">Appointment History</h3>
        {appointments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No appointments yet.</p>
        ) : (
          <div className="space-y-2">
            {appointments.map((appt) => {
              const trainer = (appt.trainers as any)?.users;
              const trainerName = trainer ? [trainer.first_name, trainer.last_name].filter(Boolean).join(" ") : "—";
              return (
                <div key={appt.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <div className="flex-shrink-0 w-14 text-center">
                    <p className="text-xs font-bold text-[#2A255D]">
                      {new Date(appt.appointment_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                    <p className="text-[10px] text-gray-400">{appt.start_time?.slice(0, 5)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#2A255D] font-medium truncate">{trainerName}</p>
                    <p className="text-xs text-gray-400">{appt.duration_minutes} min</p>
                  </div>
                  <span className={`flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${statusColor(appt.status)}`}>
                    {appt.status.replace("_", " ")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAssign && (
        <AssignPackageModal
          clientId={clientId}
          onClose={() => setShowAssign(false)}
          onSuccess={fetchClient}
        />
      )}
      {adjustPkg && (
        <AdjustSessionsModal
          pkg={adjustPkg}
          onClose={() => setAdjustPkg(null)}
          onSuccess={fetchClient}
        />
      )}
    </div>
  );
}
