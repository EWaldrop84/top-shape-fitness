import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ClientWithRelations, Package, ClientPackage, Appointment } from "@/types";
import TrainingAgreementModal from "@/components/TrainingAgreementModal";

type SessionType = "½ Hour" | "Hourly" | "Individual" | "45 min" | "Group";
const SESSION_TYPES: SessionType[] = ["½ Hour", "Hourly", "Individual", "45 min", "Group"];

interface AgreementData {
  clientPackageId: string;
  packageName: string;
  sessionsTotal: number;
  sessionType: SessionType;
  amountPaidCents: number;
  beginningDate: string;
  endingDate: string;
}

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

function oneYearFromToday() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
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
  onSuccess: (data: AgreementData) => void;
}

function AssignPackageModal({ clientId, onClose, onSuccess }: AssignModalProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    package_id: "",
    purchase_date: today(),
    expiration_date: oneYearFromToday(),
    is_shared: false,
    shared_with_client_id: "",
    sessions_override: "",
    sessionType: "Hourly" as SessionType,
    amountPaid: "",
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
          next.expiration_date = addDays(next.purchase_date as string, pkg.duration_days);
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

    const { data: newPkg, error: insertErr } = await supabase
      .from("client_packages")
      .insert({
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
      })
      .select("id")
      .single();

    if (insertErr) {
      setError(insertErr.message);
      setLoading(false);
      return;
    }

    // Write to client_package_shares if sharing is enabled
    if (form.is_shared && form.shared_with_client_id) {
      await supabase
        .from("client_package_shares")
        .delete()
        .eq("client_package_id", newPkg.id)
        .eq("shared_client_id", form.shared_with_client_id);
      await supabase.from("client_package_shares").insert({
        client_package_id: newPkg.id,
        shared_client_id: form.shared_with_client_id,
      });
    }

    // Move any existing shares on this owner's OLD packages to the new package.
    // This ensures secondary clients follow automatically when the owner renews.
    // NOTE: Will Fort → Liz Fort (shared_client_id: caf52f87-9738-451e-9c9b-5e4afcb280a7)
    // Create that initial share once via "Add Shared Client" on Will's package card.
    // After that this migration keeps Liz's share pointing to Will's latest package.
    const { data: oldPkgs } = await supabase
      .from("client_packages")
      .select("id")
      .eq("owner_client_id", clientId)
      .neq("id", newPkg.id);
    if (oldPkgs && oldPkgs.length > 0) {
      await supabase
        .from("client_package_shares")
        .update({ client_package_id: newPkg.id })
        .in("client_package_id", oldPkgs.map((p: { id: string }) => p.id));
    }

    const amountPaidCents = form.amountPaid ? Math.round(parseFloat(form.amountPaid) * 100) : 0;

    onSuccess({
      clientPackageId: newPkg.id,
      packageName: selectedPkg?.name ?? "Package",
      sessionsTotal,
      sessionType: form.sessionType,
      amountPaidCents,
      beginningDate: form.purchase_date,
      endingDate: form.expiration_date,
    });
    onClose();
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
          {/* Package selector */}
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
              <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Beginning Date</label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={(e) => setField("purchase_date", e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Ending Date</label>
              <input
                type="date"
                value={form.expiration_date}
                onChange={(e) => setForm((f) => ({ ...f, expiration_date: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
              />
            </div>
          </div>

          {/* Session Type */}
          <div>
            <label className="block text-xs font-medium text-[#2A255D] mb-2">Session Type</label>
            <div className="flex flex-wrap gap-2">
              {SESSION_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, sessionType: t }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    form.sessionType === t
                      ? "bg-[#2A255D] text-white border-[#2A255D]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[#2A255D]/40"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Amount Paid */}
          <div>
            <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Amount Paid ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amountPaid}
                onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
              />
            </div>
          </div>

          {/* Shared package */}
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

          {/* Agreement notice */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-100">
            <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs text-blue-700">After assigning the package, the client will be prompted to sign the Training Agreement.</p>
          </div>

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
  const [agreementData, setAgreementData] = useState<AgreementData | null>(null);
  const [editingPkg, setEditingPkg] = useState<string | null>(null);
  const [pkgEditForm, setPkgEditForm] = useState({
    sessions_total: 0, sessions_remaining: 0, price_paid: "",
    duration_minutes: 60, purchase_date: "", expiration_date: "", expiration_waived: false,
  });
  const [pkgEditSaving, setPkgEditSaving] = useState(false);
  const [sharedPkg, setSharedPkg] = useState<{
    client_package_id: string;
    sessions_remaining: number;
    sessions_total: number;
    sessions_used: number;
    is_active: boolean;
    purchase_date: string | null;
    expiration_date: string | null;
    expiration_waived: boolean;
    packageName: string;
    ownerName: string;
  } | null>(null);

  // Package sharing state (for clients who OWN a package)
  const [packageShares, setPackageShares] = useState<{
    id: string; shared_client_id: string; client_package_id: string; name: string;
  }[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [showAddShare, setShowAddShare] = useState<string | null>(null);
  const [shareSearch, setShareSearch] = useState("");
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  const [allClientsLoaded, setAllClientsLoaded] = useState(false);
  const [removingShare, setRemovingShare] = useState<string | null>(null);
  const [addingShare, setAddingShare] = useState(false);

  // Link-to-shared-package state (for clients with no package of their own)
  const [removingOwnShare, setRemovingOwnShare] = useState(false);
  const [showLinkShared, setShowLinkShared] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [allOwners, setAllOwners] = useState<{
    clientPackageId: string; ownerName: string; sessionsRemaining: number; packageName: string;
  }[]>([]);
  const [ownersLoaded, setOwnersLoaded] = useState(false);

  async function fetchShares(packageIds: string[]) {
    if (packageIds.length === 0) { setPackageShares([]); return; }
    setSharesLoading(true);
    const { data } = await supabase
      .from("client_package_shares")
      .select("id, shared_client_id, client_package_id, clients!shared_client_id(users!clients_user_id_fkey(first_name, last_name))")
      .in("client_package_id", packageIds);
    setPackageShares(
      (data ?? []).map((r: any) => ({
        id: r.id,
        shared_client_id: r.shared_client_id,
        client_package_id: r.client_package_id,
        name: [r.clients?.users?.first_name, r.clients?.users?.last_name].filter(Boolean).join(" ") || "Unknown",
      }))
    );
    setSharesLoading(false);
  }

  const fetchClient = useCallback(async () => {
    const [clientRes, apptRes, shareRes] = await Promise.all([
      supabase
        .from("clients")
        .select(`
          id, notes, waiver_signed, waiver_date, created_by, user_id,
          client_packages!client_packages_owner_client_id_fkey (
            id, package_id, owner_client_id, sessions_total, sessions_remaining, sessions_used,
            purchase_date, expiration_date, expiration_waived, is_active, is_shared, shared_with_client_id,
            price_paid_cents, duration_minutes,
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
      supabase
        .from("client_package_shares")
        .select(`
          client_package_id,
          client_packages!client_package_id (
            id, sessions_total, sessions_remaining, sessions_used, is_active,
            purchase_date, expiration_date, expiration_waived,
            packages!package_id ( name ),
            clients!owner_client_id (
              users!clients_user_id_fkey ( first_name, last_name )
            )
          )
        `)
        .eq("shared_client_id", clientId)
        .maybeSingle(),
    ]);

    if (clientRes.error) {
      setError(clientRes.error.message);
      setLoading(false);
      return;
    }

    const clientRow = clientRes.data as any;

    const { data: userData } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, phone, is_active, created_at, role")
      .eq("id", clientRow.user_id)
      .single();

    const c: ClientWithRelations = { ...clientRow, users: userData ?? null };
    setClient(c);
    setEditForm({
      first_name: c.users?.first_name ?? "",
      last_name: c.users?.last_name ?? "",
      phone: c.users?.phone ?? "",
      notes: c.notes ?? "",
    });
    setAppointments((apptRes.data as unknown as Appointment[]) ?? []);

    // Resolve shared package if this client is a secondary on someone else's package
    const shareRow = shareRes.data as any;
    if (shareRow?.client_packages) {
      const sp = shareRow.client_packages;
      const ownerUsers = sp.clients?.users;
      const ownerName = [ownerUsers?.first_name, ownerUsers?.last_name].filter(Boolean).join(" ") || "Unknown";
      setSharedPkg({
        client_package_id: shareRow.client_package_id,
        sessions_remaining: sp.sessions_remaining,
        sessions_total: sp.sessions_total,
        sessions_used: sp.sessions_used,
        is_active: sp.is_active,
        purchase_date: sp.purchase_date,
        expiration_date: sp.expiration_date,
        expiration_waived: sp.expiration_waived,
        packageName: sp.packages?.name ?? "Package",
        ownerName,
      });
    } else {
      setSharedPkg(null);
    }

    // Fetch which clients are sharing packages owned by this client
    const ownedPkgIds = (clientRow.client_packages ?? []).map((p: any) => p.id as string);
    fetchShares(ownedPkgIds);

    setLoading(false);
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchClient(); }, [fetchClient]);

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

  async function handleAddShare(packageId: string, sharedClientId: string) {
    setAddingShare(true);
    await supabase.from("client_package_shares").delete()
      .eq("client_package_id", packageId).eq("shared_client_id", sharedClientId);
    await supabase.from("client_package_shares").insert({ client_package_id: packageId, shared_client_id: sharedClientId });
    setShowAddShare(null);
    setShareSearch("");
    await fetchClient();
    setAddingShare(false);
  }

  async function handleRemoveShare(shareId: string) {
    setRemovingShare(shareId);
    await supabase.from("client_package_shares").delete().eq("id", shareId);
    await fetchClient();
    setRemovingShare(null);
  }

  async function handleLinkShared(masterPackageId: string) {
    if (!client) return;
    await supabase.from("client_package_shares").delete()
      .eq("client_package_id", masterPackageId).eq("shared_client_id", client.id);
    await supabase.from("client_package_shares").insert({ client_package_id: masterPackageId, shared_client_id: client.id });
    setShowLinkShared(false);
    setLinkSearch("");
    await fetchClient();
  }

  async function handleRemoveOwnShare() {
    if (!client || !sharedPkg) return;
    setRemovingOwnShare(true);
    await supabase.from("client_package_shares").delete()
      .eq("client_package_id", sharedPkg.client_package_id).eq("shared_client_id", client.id);
    setRemovingOwnShare(false);
    await fetchClient();
  }

  async function loadAllClients() {
    if (allClientsLoaded) return;
    const { data } = await supabase
      .from("clients")
      .select("id, users!user_id(first_name, last_name, email)")
      .neq("id", clientId);
    setAllClients(
      ((data ?? []) as any[]).map((c) => ({
        id: c.id,
        name: [c.users?.first_name, c.users?.last_name].filter(Boolean).join(" ") || c.users?.email || c.id,
      }))
    );
    setAllClientsLoaded(true);
  }

  async function loadOwners() {
    if (ownersLoaded) return;
    const { data } = await supabase
      .from("client_packages")
      .select("id, sessions_remaining, packages!package_id(name), clients!owner_client_id(users!clients_user_id_fkey(first_name, last_name))")
      .eq("is_active", true)
      .gt("sessions_remaining", 0);
    setAllOwners(
      ((data ?? []) as any[]).map((p) => ({
        clientPackageId: p.id,
        ownerName: [p.clients?.users?.first_name, p.clients?.users?.last_name].filter(Boolean).join(" ") || "Unknown",
        sessionsRemaining: p.sessions_remaining,
        packageName: p.packages?.name ?? "Package",
      }))
    );
    setOwnersLoaded(true);
  }

  async function handlePkgEditSave() {
    if (!editingPkg) return;
    setPkgEditSaving(true);
    const sessions_used = Math.max(0, pkgEditForm.sessions_total - pkgEditForm.sessions_remaining);
    const price_paid_cents = pkgEditForm.price_paid ? Math.round(parseFloat(pkgEditForm.price_paid) * 100) : 0;
    await supabase.from("client_packages").update({
      sessions_total: pkgEditForm.sessions_total,
      sessions_remaining: pkgEditForm.sessions_remaining,
      sessions_used,
      price_paid_cents,
      duration_minutes: pkgEditForm.duration_minutes,
      purchase_date: pkgEditForm.purchase_date || null,
      expiration_date: pkgEditForm.expiration_waived ? null : (pkgEditForm.expiration_date || null),
      expiration_waived: pkgEditForm.expiration_waived,
    }).eq("id", editingPkg);
    setEditingPkg(null);
    await fetchClient();
    setPkgEditSaving(false);
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

        {sortedPkgs.length === 0 && !sharedPkg ? (
          <div>
            <p className="text-sm text-gray-400 text-center py-4">No packages assigned yet.</p>
            {!showLinkShared ? (
              <button
                onClick={() => { setShowLinkShared(true); loadOwners(); }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-[#1F73B1]/40 text-[#1F73B1] text-xs font-semibold hover:bg-[#1F73B1]/5 transition"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
                Link to Shared Package
              </button>
            ) : (
              <div className="rounded-xl border border-[#1F73B1]/20 bg-[#1F73B1]/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-[#1F73B1]">Link to Shared Package</p>
                  <button
                    onClick={() => { setShowLinkShared(false); setLinkSearch(""); }}
                    className="p-1 text-gray-400 hover:text-gray-600 transition"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
                <div className="relative mb-2">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    autoFocus
                    type="search"
                    placeholder="Search by owner name or package…"
                    value={linkSearch}
                    onChange={(e) => setLinkSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-[#1F73B1]/20 bg-white text-sm text-[#2A255D] placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1F73B1]/30 focus:border-[#1F73B1] transition"
                  />
                </div>
                <div className="rounded-lg border border-gray-100 bg-white overflow-hidden max-h-48 overflow-y-auto">
                  {(() => {
                    const q = linkSearch.toLowerCase();
                    const filtered = allOwners.filter(
                      (o) => o.ownerName.toLowerCase().includes(q) || o.packageName.toLowerCase().includes(q),
                    );
                    if (!ownersLoaded) return <p className="px-3 py-2.5 text-sm text-gray-400">Loading…</p>;
                    if (filtered.length === 0) return <p className="px-3 py-2.5 text-sm text-gray-400">No active packages found</p>;
                    return filtered.map((o) => (
                      <button
                        key={o.clientPackageId}
                        onClick={() => { handleLinkShared(o.clientPackageId); setShowLinkShared(false); setLinkSearch(""); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition border-b border-gray-50 last:border-0"
                      >
                        <p className="text-sm font-medium text-[#2A255D]">{o.ownerName}</p>
                        <p className="text-[11px] text-gray-400">{o.packageName} · {o.sessionsRemaining} sessions left</p>
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
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
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setAdjustPkg(pkg)} className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-[#2A255D]/20 text-[11px] font-medium text-[#2A255D] hover:bg-[#2A255D]/5 transition">
                        Adjust
                      </button>
                      <button
                        onClick={() => {
                          setEditingPkg(pkg.id);
                          setPkgEditForm({
                            sessions_total: pkg.sessions_total,
                            sessions_remaining: pkg.sessions_remaining,
                            price_paid: pkg.price_paid_cents ? (pkg.price_paid_cents / 100).toFixed(2) : "",
                            duration_minutes: pkg.duration_minutes ?? 60,
                            purchase_date: pkg.purchase_date ?? "",
                            expiration_date: pkg.expiration_date ?? "",
                            expiration_waived: pkg.expiration_waived,
                          });
                        }}
                        className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-gray-200 text-[11px] font-medium text-gray-500 hover:bg-gray-50 transition flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
                      </button>
                    </div>
                  )}
                </div>
                {editingPkg === pkg.id ? (
                  <div className="mt-1 space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Sessions Total</label>
                        <input type="number" min={0} value={pkgEditForm.sessions_total}
                          onChange={(e) => setPkgEditForm((f) => ({ ...f, sessions_total: parseInt(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-[#2A255D] focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Sessions Remaining</label>
                        <input type="number" min={0} value={pkgEditForm.sessions_remaining}
                          onChange={(e) => setPkgEditForm((f) => ({ ...f, sessions_remaining: parseInt(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-[#2A255D] focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Sessions Used (auto)</label>
                        <div className="px-3 py-2 rounded-lg border border-gray-100 bg-gray-100 text-sm text-gray-400">
                          {Math.max(0, pkgEditForm.sessions_total - pkgEditForm.sessions_remaining)}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Price Paid ($)</label>
                        <input type="number" min={0} step={0.01} placeholder="0.00" value={pkgEditForm.price_paid}
                          onChange={(e) => setPkgEditForm((f) => ({ ...f, price_paid: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-[#2A255D] focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Duration</label>
                        <select value={pkgEditForm.duration_minutes}
                          onChange={(e) => setPkgEditForm((f) => ({ ...f, duration_minutes: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-[#2A255D] focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition">
                          <option value={30}>30 min</option>
                          <option value={45}>45 min</option>
                          <option value={60}>60 min</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Start Date</label>
                        <input type="date" value={pkgEditForm.purchase_date}
                          onChange={(e) => setPkgEditForm((f) => ({ ...f, purchase_date: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-[#2A255D] focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center mb-1.5">
                          <label className="text-[11px] font-medium text-gray-500">Expiry Date</label>
                          <label className="flex items-center gap-1.5 ml-auto cursor-pointer select-none">
                            <input type="checkbox" checked={pkgEditForm.expiration_waived}
                              onChange={(e) => setPkgEditForm((f) => ({ ...f, expiration_waived: e.target.checked }))}
                              className="rounded border-gray-300" />
                            <span className="text-[11px] text-gray-500">No expiry</span>
                          </label>
                        </div>
                        {!pkgEditForm.expiration_waived && (
                          <input type="date" value={pkgEditForm.expiration_date}
                            onChange={(e) => setPkgEditForm((f) => ({ ...f, expiration_date: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-[#2A255D] focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition" />
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1 border-t border-gray-100">
                      <button onClick={handlePkgEditSave} disabled={pkgEditSaving}
                        className="flex-1 py-2 rounded-lg bg-[#2A255D] text-white text-xs font-semibold hover:bg-[#1e1a47] disabled:opacity-50 transition">
                        {pkgEditSaving ? "Saving…" : "Save Changes"}
                      </button>
                      <button onClick={() => setEditingPkg(null)} disabled={pkgEditSaving}
                        className="px-4 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50 transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
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
                    {/* ── Sharing controls ─────────────────────────────── */}
                    {pkg.is_active && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                            Shared with ({packageShares.filter((s) => s.client_package_id === pkg.id).length})
                          </p>
                          <button
                            onClick={() => {
                              if (showAddShare === pkg.id) {
                                setShowAddShare(null);
                                setShareSearch("");
                              } else {
                                setShowAddShare(pkg.id);
                                setShareSearch("");
                                loadAllClients();
                              }
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#2A255D]/5 text-[11px] font-semibold text-[#2A255D] hover:bg-[#2A255D]/10 transition"
                          >
                            {showAddShare === pkg.id ? (
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            ) : (
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            )}
                            {showAddShare === pkg.id ? "Cancel" : "Add"}
                          </button>
                        </div>
                        {sharesLoading ? (
                          <p className="text-[11px] text-gray-400 py-1">Loading…</p>
                        ) : packageShares.filter((s) => s.client_package_id === pkg.id).length === 0 && showAddShare !== pkg.id ? (
                          <p className="text-[11px] text-gray-400 italic">No shared members</p>
                        ) : (
                          <div className="space-y-1 mb-2">
                            {packageShares.filter((s) => s.client_package_id === pkg.id).map((share) => (
                              <div key={share.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-[#1F73B1]/10 text-[#1F73B1] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                    {(share.name[0] ?? "?").toUpperCase()}
                                  </span>
                                  <span className="text-sm text-[#2A255D] font-medium">{share.name}</span>
                                </div>
                                <button
                                  onClick={() => handleRemoveShare(share.id)}
                                  disabled={removingShare === share.id}
                                  className="text-[11px] font-medium text-red-500 hover:text-red-700 transition disabled:opacity-40"
                                >
                                  {removingShare === share.id ? "…" : "Remove"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {showAddShare === pkg.id && (
                          <div className="mt-1">
                            <div className="relative">
                              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                              <input
                                autoFocus
                                type="search"
                                placeholder="Search client by name…"
                                value={shareSearch}
                                onChange={(e) => setShareSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-[#2A255D] placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2A255D]/30 focus:border-[#2A255D] transition"
                              />
                            </div>
                            {shareSearch.trim() && (
                              <div className="mt-1 rounded-lg border border-gray-100 bg-white shadow-sm overflow-hidden max-h-40 overflow-y-auto">
                                {(() => {
                                  const filtered = allClients.filter(
                                    (c) =>
                                      c.name.toLowerCase().includes(shareSearch.toLowerCase()) &&
                                      !packageShares.some((s) => s.shared_client_id === c.id),
                                  );
                                  return filtered.length === 0 ? (
                                    <p className="px-3 py-2.5 text-sm text-gray-400">No clients found</p>
                                  ) : (
                                    filtered.slice(0, 8).map((c) => (
                                      <button
                                        key={c.id}
                                        onClick={() => {
                                          handleAddShare(pkg.id, c.id);
                                          setShowAddShare(null);
                                          setShareSearch("");
                                        }}
                                        disabled={addingShare}
                                        className="w-full text-left px-3 py-2.5 text-sm text-[#2A255D] hover:bg-gray-50 transition border-b border-gray-50 last:border-0 disabled:opacity-50"
                                      >
                                        {c.name}
                                      </button>
                                    ))
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* Shared package from another client */}
            {sharedPkg && (
              <div className={`rounded-lg border p-4 ${sharedPkg.is_active ? "border-[#1F73B1]/20 bg-[#1F73B1]/3" : "border-gray-100 bg-gray-50/50 opacity-70"}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold text-[#2A255D] text-sm">{sharedPkg.packageName}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1F73B1]/10 text-[#1F73B1] text-[10px] font-semibold tracking-wide">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                        </svg>
                        Shared — {sharedPkg.ownerName}'s Package
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${sharedPkg.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                      {sharedPkg.is_active ? "Active" : "Inactive"}
                    </span>
                    <button
                      onClick={handleRemoveOwnShare}
                      disabled={removingOwnShare}
                      className="text-[11px] font-medium text-red-500 hover:text-red-700 transition disabled:opacity-40"
                    >
                      {removingOwnShare ? "Removing…" : "Unlink"}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {([["Total", sharedPkg.sessions_total], ["Used", sharedPkg.sessions_used], ["Left", sharedPkg.sessions_remaining]] as [string, number][]).map(([label, val]) => (
                    <div key={label} className="text-center bg-white rounded-lg p-2 border border-gray-100">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className={`text-lg font-bold ${label === "Left" && val <= 2 ? "text-orange-600" : "text-[#2A255D]"}`}>{val}</p>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-500">
                  <span className="text-gray-400">Purchased:</span> {formatDate(sharedPkg.purchase_date)}
                  <span className="mx-2 text-gray-200">·</span>
                  <span className="text-gray-400">Expires:</span>{" "}
                  {sharedPkg.expiration_waived ? <span className="text-emerald-600 font-medium">Waived</span> : formatDate(sharedPkg.expiration_date)}
                </div>
              </div>
            )}
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
          onSuccess={(data) => {
            setShowAssign(false);
            fetchClient();
            setAgreementData(data);
          }}
        />
      )}
      {adjustPkg && (
        <AdjustSessionsModal
          pkg={adjustPkg}
          onClose={() => setAdjustPkg(null)}
          onSuccess={fetchClient}
        />
      )}
      {agreementData && (
        <TrainingAgreementModal
          clientId={clientId}
          clientName={fullName}
          clientPhone={client.users?.phone ?? ""}
          clientPackageId={agreementData.clientPackageId}
          packageName={agreementData.packageName}
          sessionsTotal={agreementData.sessionsTotal}
          sessionType={agreementData.sessionType}
          amountPaidCents={agreementData.amountPaidCents}
          beginningDate={agreementData.beginningDate}
          endingDate={agreementData.endingDate}
          onComplete={() => setAgreementData(null)}
          onDismiss={() => setAgreementData(null)}
        />
      )}
    </div>
  );
}
