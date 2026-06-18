import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Package } from "@/types";

export default function PackageSection() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", session_count: "", duration_days: "180" });
  const [addError, setAddError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    fetchPackages();
  }, []);

  async function fetchPackages() {
    setLoading(true);
    const { data, error } = await supabase
      .from("packages")
      .select("*")
      .order("name", { ascending: true });
    if (error) setError(error.message);
    else setPackages((data ?? []) as Package[]);
    setLoading(false);
  }

  async function handleAddPackage(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const count = parseInt(addForm.session_count);
    const days = parseInt(addForm.duration_days);
    if (!addForm.name.trim() || isNaN(count) || count < 1) {
      setAddError("Name and session count are required.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("packages").insert({
      name: addForm.name.trim(),
      session_count: count,
      duration_days: isNaN(days) ? 180 : days,
      is_active: true,
    });
    if (error) {
      setAddError(error.message);
    } else {
      setAddForm({ name: "", session_count: "", duration_days: "180" });
      setShowAdd(false);
      await fetchPackages();
    }
    setSubmitting(false);
  }

  async function toggleActive(pkg: Package) {
    setToggling(pkg.id);
    await supabase.from("packages").update({ is_active: !pkg.is_active }).eq("id", pkg.id);
    setPackages((prev) => prev.map((p) => (p.id === pkg.id ? { ...p, is_active: !p.is_active } : p)));
    setToggling(null);
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-base font-bold text-[#2A255D]">Packages</h2>
          <p className="text-xs text-gray-400 mt-0.5">{packages.length} package{packages.length !== 1 ? "s" : ""} configured</p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setAddError(null); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#06A29E] text-white text-sm font-semibold hover:bg-[#048e8a] transition shadow-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {showAdd ? "Cancel" : "Add Package"}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-[#06A29E]/30 shadow-sm p-5 mb-5">
          <h3 className="text-sm font-semibold text-[#2A255D] mb-4">New Package</h3>
          <form onSubmit={handleAddPackage} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Package Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 10-Session Starter Pack"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Session Count <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  required
                  min="1"
                  value={addForm.session_count}
                  onChange={(e) => setAddForm((f) => ({ ...f, session_count: e.target.value }))}
                  placeholder="10"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Duration (days)</label>
                <input
                  type="number"
                  min="1"
                  value={addForm.duration_days}
                  onChange={(e) => setAddForm((f) => ({ ...f, duration_days: e.target.value }))}
                  placeholder="180"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
                />
              </div>
            </div>
            {addError && (
              <p className="text-sm text-red-600">{addError}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-[#06A29E] text-white text-sm font-semibold hover:bg-[#048e8a] transition disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save Package"}
            </button>
          </form>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin w-6 h-6 text-[#06A29E]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : packages.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-400">No packages yet. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map((pkg) => (
            <div key={pkg.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${pkg.is_active ? "bg-[#06A29E]/10" : "bg-gray-100"}`}>
                <svg className={`w-5 h-5 ${pkg.is_active ? "text-[#06A29E]" : "text-gray-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#2A255D] text-sm">{pkg.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {pkg.session_count} sessions · {pkg.duration_days} days
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${pkg.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {pkg.is_active ? "Active" : "Inactive"}
                </span>
                <button
                  onClick={() => toggleActive(pkg)}
                  disabled={toggling === pkg.id}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  {toggling === pkg.id ? "…" : pkg.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
