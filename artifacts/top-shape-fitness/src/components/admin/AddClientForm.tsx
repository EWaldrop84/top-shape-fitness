import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface AddClientFormProps {
  onCancel: () => void;
  onSuccess: (clientId: string) => void;
}

interface SuccessResult {
  tempPassword: string;
  clientId: string;
  name: string;
  email: string;
}

export default function AddClientForm({ onCancel, onSuccess }: AddClientFormProps) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessResult | null>(null);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Session expired. Please log in again.");
        return;
      }

      const res = await fetch("/api/admin/create-client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create client.");
        return;
      }

      setSuccess({
        tempPassword: data.tempPassword,
        clientId: data.client.id,
        name: [form.first_name, form.last_name].filter(Boolean).join(" ") || form.email,
        email: form.email,
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="p-4 md:p-6 max-w-lg">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-[#2A255D] mb-1">Client Created!</h2>
          <p className="text-sm text-gray-500 mb-5">
            <strong>{success.name}</strong> ({success.email}) has been added.
          </p>

          <div className="bg-[#2A255D]/5 border border-[#2A255D]/10 rounded-lg p-4 mb-5">
            <p className="text-xs font-semibold text-[#2A255D] uppercase tracking-wide mb-1">Temporary Password</p>
            <p className="font-mono text-lg font-bold text-[#2A255D]">{success.tempPassword}</p>
            <p className="text-xs text-gray-500 mt-1.5">Share this with the client. They can change it after logging in.</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => onSuccess(success.clientId)}
              className="flex-1 py-2.5 rounded-lg bg-[#06A29E] text-white text-sm font-semibold hover:bg-[#048e8a] transition"
            >
              View Client Profile
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition"
            >
              Back to List
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg text-gray-400 hover:text-[#2A255D] hover:bg-gray-100 transition"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div>
          <h2 className="text-base font-bold text-[#2A255D]">New Client</h2>
          <p className="text-xs text-gray-400">Fill in the client's details</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#2A255D] mb-1.5">First Name</label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => set("first_name", e.target.value)}
                placeholder="Jane"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Last Name</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => set("last_name", e.target.value)}
                placeholder="Smith"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Email <span className="text-red-500">*</span></label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="jane@example.com"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Phone <span className="text-red-500">*</span></label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Temp password will be: <span className="font-mono font-medium text-[#2A255D]">TopShape{form.phone.replace(/\D/g, "").slice(-4).padStart(4, "0") || "XXXX"}</span>
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2A255D] mb-1.5">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any notes about this client…"
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition resize-none"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg bg-[#06A29E] text-white text-sm font-semibold hover:bg-[#048e8a] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Creating…" : "Create Client"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
