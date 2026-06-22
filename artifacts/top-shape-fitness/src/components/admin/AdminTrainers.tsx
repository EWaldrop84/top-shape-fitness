import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface TrainerRow {
  trainer_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  is_active: boolean;
  display_color: string | null;
}

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  is_active: true,
};

type FormState = typeof EMPTY_FORM;

export default function AdminTrainers() {
  const [trainers, setTrainers] = useState<TrainerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<TrainerRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TrainerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTrainers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("trainers")
      .select("id, user_id, display_color, is_active, users(id, first_name, last_name, email, phone, is_active)")
      .order("user_id");

    if (err) { setError(err.message); setLoading(false); return; }

    const rows: TrainerRow[] = ((data ?? []) as any[]).map((t) => ({
      trainer_id: t.id,
      user_id: t.user_id,
      display_color: t.display_color,
      first_name: t.users?.first_name ?? null,
      last_name: t.users?.last_name ?? null,
      email: t.users?.email ?? "",
      phone: t.users?.phone ?? null,
      is_active: t.users?.is_active ?? false,
    }));

    setTrainers(rows);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTrainers(); }, [fetchTrainers]);

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(t: TrainerRow) {
    setEditTarget(t);
    setForm({
      first_name: t.first_name ?? "",
      last_name: t.last_name ?? "",
      email: t.email,
      phone: t.phone ?? "",
      is_active: t.is_active,
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditTarget(null);
    setFormError(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setFormError("First name, last name, and email are required.");
      return;
    }
    setSaving(true);
    setFormError(null);

    if (editTarget) {
      // UPDATE existing user profile
      const { error: err } = await supabase
        .from("users")
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          is_active: form.is_active,
        })
        .eq("id", editTarget.user_id);

      if (err) { setFormError(err.message); setSaving(false); return; }
    } else {
      // INSERT new user row
      const { data: newUser, error: userErr } = await supabase
        .from("users")
        .insert({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          role: "trainer",
          is_active: form.is_active,
        })
        .select("id")
        .single();

      if (userErr || !newUser) { setFormError(userErr?.message ?? "Failed to create user."); setSaving(false); return; }

      // INSERT trainer profile row
      const { error: trainerErr } = await supabase
        .from("trainers")
        .insert({
          user_id: newUser.id,
          is_active: form.is_active,
        });

      if (trainerErr) { setFormError(trainerErr.message); setSaving(false); return; }
    }

    setSaving(false);
    closeForm();
    fetchTrainers();
  }

  async function handleToggleActive(t: TrainerRow) {
    await supabase
      .from("users")
      .update({ is_active: !t.is_active })
      .eq("id", t.user_id);
    fetchTrainers();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    // Delete trainer profile first, then user (CASCADE would also handle it, but explicit)
    await supabase.from("trainers").delete().eq("id", deleteTarget.trainer_id);
    await supabase.from("users").delete().eq("id", deleteTarget.user_id);
    setDeleting(false);
    setDeleteTarget(null);
    fetchTrainers();
  }

  const fullName = (t: TrainerRow) => [t.first_name, t.last_name].filter(Boolean).join(" ") || t.email;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-bold text-[#2A255D]">Trainer Management</h2>
          <p className="text-xs text-gray-400 mt-0.5">Manage trainer profiles and account access</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2A255D] text-white text-sm font-semibold hover:bg-[#1e1a47] transition shadow-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Trainer
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin w-7 h-7 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : trainers.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
          <p className="text-sm text-gray-400">No trainers found. Add one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {trainers.map((t) => (
            <div
              key={t.trainer_id}
              className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4 transition ${!t.is_active ? "opacity-60" : ""}`}
            >
              {/* Top row: avatar + name + badge */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#2A255D]/8 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-[#2A255D]">
                    {(t.first_name?.[0] ?? t.email[0]).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#2A255D] text-sm truncate">{fullName(t)}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{t.email}</p>
                  {t.phone && <p className="text-xs text-gray-400 mt-0.5">{t.phone}</p>}
                </div>
                <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${t.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {t.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Role pill */}
              <div className="flex items-center gap-1.5">
                <span className="px-2.5 py-1 rounded-lg bg-[#06A29E]/10 text-[#06A29E] text-[11px] font-semibold uppercase tracking-wide">
                  Trainer
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
                <button
                  onClick={() => openEdit(t)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-[#2A255D] hover:bg-gray-50 transition"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleToggleActive(t)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition ${
                    t.is_active
                      ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                      : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  {t.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => setDeleteTarget(t)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-[#2A255D] text-base">
                {editTarget ? "Edit Trainer" : "Add Trainer"}
              </h3>
              <button onClick={closeForm} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">First Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                    placeholder="Jane"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Last Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                    placeholder="Smith"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Email <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(843) 555-0100"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium text-[#2A255D]">Active</p>
                  <p className="text-xs text-gray-400">Inactive trainers cannot log in</p>
                </div>
                <button
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                  className={`relative w-10 h-6 rounded-full transition ${form.is_active ? "bg-[#06A29E]" : "bg-gray-200"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-4" : ""}`} />
                </button>
              </div>

              {!editTarget && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2.5">
                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div>
                    <p className="text-xs font-semibold text-amber-800 mb-0.5">Auth account required</p>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      This creates the profile row only. The login account must be created separately in the Supabase Auth dashboard with password <span className="font-mono font-semibold">TopShape2026!</span>
                    </p>
                  </div>
                </div>
              )}

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{formError}</div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={closeForm}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-[#2A255D] text-white text-sm font-semibold hover:bg-[#1e1a47] transition disabled:opacity-60"
              >
                {saving ? "Saving…" : editTarget ? "Save Changes" : "Add Trainer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
              </svg>
            </div>
            <h3 className="font-bold text-[#2A255D] text-base mb-2">Delete Trainer</h3>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Are you sure you want to permanently delete <span className="font-semibold text-[#2A255D]">{fullName(deleteTarget)}</span>? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
