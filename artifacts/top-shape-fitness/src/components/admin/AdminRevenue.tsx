import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PkgRow {
  id: string;
  is_active: boolean;
  sessions_total: number;
  sessions_used: number;
  sessions_remaining: number;
  purchase_date: string | null;
  expiration_date: string | null;
  expiration_waived: boolean;
  packageName: string;
  priceCents: number;
  clientName: string;
  clientPhone: string;
}

interface BookingRow {
  id: string;
  appointment_date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  clientName: string;
  trainerName: string;
}

interface RevenueMetrics {
  grossCollected: number;
  deliveredValue: number;
  packageLiability: number;
  laborCost: number;
  laborPct: number;
  netRevenue: number;
  hasPricing: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function daysUntil(iso: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const [y, mo, d] = iso.split("-").map(Number);
  return Math.ceil((new Date(y, mo - 1, d).getTime() - now.getTime()) / 86400000);
}

function sessionRowColor(remaining: number): string {
  if (remaining === 0) return "bg-red-50 border-l-2 border-red-400";
  if (remaining <= 3) return "bg-amber-50 border-l-2 border-amber-400";
  return "bg-emerald-50/40 border-l-2 border-emerald-400";
}

function sessionBadge(remaining: number) {
  if (remaining === 0) return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">Empty</span>;
  if (remaining <= 3) return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">Low</span>;
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">Active</span>;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
  forfeited: "bg-red-100 text-red-700",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminRevenue() {
  const [allPackages, setAllPackages] = useState<PkgRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [activeClientCount, setActiveClientCount] = useState(0);
  const [metrics, setMetrics] = useState<RevenueMetrics>({ grossCollected: 0, deliveredValue: 0, packageLiability: 0, laborCost: 0, laborPct: 0, netRevenue: 0, hasPricing: false });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [waivedIds, setWaivedIds] = useState<Set<string>>(new Set());
  const [waving, setWaving] = useState<string | null>(null);
  const [waiveError, setWaiveError] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);

    const [pkgRes, apptRes, clientCountRes, payrollRes] = await Promise.all([
      supabase
        .from("client_packages")
        .select(`id, is_active, sessions_total, sessions_used, sessions_remaining,
                 purchase_date, expiration_date, expiration_waived, price_paid_cents,
                 packages!package_id(name),
                 clients!owner_client_id(users!clients_user_id_fkey(first_name, last_name, phone))`)
        .order("sessions_remaining", { ascending: true }),
      supabase
        .from("appointments")
        .select(`id, appointment_date, start_time, duration_minutes, status,
                 clients!client_id(users!clients_user_id_fkey(first_name, last_name)),
                 trainers!trainer_id(users!trainers_user_id_fkey(first_name, last_name))`)
        .order("appointment_date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(10),
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "client")
        .eq("is_active", true),
      supabase
        .from("payroll_sessions")
        .select("hours, trainers!trainer_id(hourly_rate_cents)"),
    ]);

    const rawPkgs = (pkgRes.data ?? []) as any[];
    const parsed: PkgRow[] = rawPkgs.map((r) => {
      const u = r.clients?.users ?? {};
      return {
        id: r.id,
        is_active: r.is_active ?? true,
        sessions_total: r.sessions_total,
        sessions_used: r.sessions_used,
        sessions_remaining: r.sessions_remaining,
        purchase_date: r.purchase_date,
        expiration_date: r.expiration_date,
        expiration_waived: r.expiration_waived ?? false,
        packageName: r.packages?.name ?? "Unknown Package",
        priceCents: r.price_paid_cents ?? 0,
        clientName: [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unknown",
        clientPhone: u.phone ?? "",
      };
    });
    setAllPackages(parsed);
    setActiveClientCount(clientCountRes.count ?? 0);

    // ── Revenue metric calculations ─────────────────────────────────────────
    const activePkgs = parsed.filter((p) => p.is_active);
    const grossCollectedCents = parsed.reduce((s, p) => s + p.priceCents, 0);
    const deliveredCents = parsed.reduce(
      (s, p) => s + Math.round((p.sessions_used / Math.max(p.sessions_total, 1)) * p.priceCents), 0,
    );
    const liabilityCents = activePkgs.reduce(
      (s, p) => s + Math.round((p.sessions_remaining / Math.max(p.sessions_total, 1)) * p.priceCents), 0,
    );
    const laborCentsDbl = (payrollRes.data ?? []).reduce((s: number, r: any) => {
      const rate: number = r.trainers?.hourly_rate_cents ?? 0;
      return s + Number(r.hours) * rate;
    }, 0);
    const laborCents = Math.round(laborCentsDbl);
    const laborPct = grossCollectedCents > 0 ? (laborCents / grossCollectedCents) * 100 : 0;

    setMetrics({
      grossCollected: grossCollectedCents,
      deliveredValue: deliveredCents,
      packageLiability: liabilityCents,
      laborCost: laborCents,
      laborPct,
      netRevenue: grossCollectedCents - laborCents,
      hasPricing: grossCollectedCents > 0,
    });

    const rawAppts = (apptRes.data ?? []) as any[];
    setBookings(rawAppts.map((a) => {
      const cu = a.clients?.users ?? {};
      const tu = a.trainers?.users ?? {};
      return {
        id: a.id,
        appointment_date: a.appointment_date,
        start_time: a.start_time,
        duration_minutes: a.duration_minutes,
        status: a.status,
        clientName: [cu.first_name, cu.last_name].filter(Boolean).join(" ") || "Unknown",
        trainerName: [tu.first_name, tu.last_name].filter(Boolean).join(" ") || "Unknown",
      };
    }));

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Waive expiry ───────────────────────────────────────────────────────────
  async function handleWaive(pkgId: string) {
    setWaving(pkgId);
    setWaiveError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setWaiveError("Session expired."); return; }

      const res = await fetch("/api/admin/waive-expiry", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: pkgId }),
      });
      if (!res.ok) {
        const e = (await res.json()) as { error?: string };
        setWaiveError(e.error ?? "Failed to waive expiry.");
        return;
      }
      setWaivedIds((prev) => new Set(prev).add(pkgId));
      setAllPackages((prev) => prev.map((p) => p.id === pkgId ? { ...p, expiration_waived: true } : p));
    } finally {
      setWaving(null);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const activePkgs = allPackages.filter((p) => p.is_active);
  const expiringSoon = allPackages.filter(
    (p) => p.is_active && p.expiration_date && !p.expiration_waived && !waivedIds.has(p.id) && daysUntil(p.expiration_date) <= 30,
  );

  const filteredPkgs = search.trim()
    ? activePkgs.filter((p) => p.clientName.toLowerCase().includes(search.toLowerCase()))
    : activePkgs;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Active Clients"
          value={loading ? "—" : activeClientCount.toString()}
          icon={<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>}
          accent="#06A29E"
        />
        <SummaryCard
          label="Sessions Remaining"
          value={loading ? "—" : activePkgs.reduce((s, p) => s + p.sessions_remaining, 0).toString()}
          icon={<><rect x="5" y="9" width="14" height="6" rx="1" /><path d="M3 9.5h2M19 9.5h2M3 14.5h2M19 14.5h2M6.5 6.5h11M6.5 17.5h11" /></>}
          accent="#2A255D"
        />
        <SummaryCard
          label="Active Packages"
          value={loading ? "—" : activePkgs.length.toString()}
          icon={<><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></>}
          accent="#1F73B1"
        />
        <SummaryCard
          label="Expiring ≤ 30 days"
          value={loading ? "—" : expiringSoon.length.toString()}
          icon={<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>}
          accent={expiringSoon.length > 0 ? "#DC2626" : "#06A29E"}
          urgent={expiringSoon.length > 0}
        />
      </div>

      {/* ── Revenue Metrics ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-sm text-[#2A255D]">Revenue Metrics</h2>
          {!loading && !metrics.hasPricing && (
            <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
              Set package prices to see revenue data
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          <MetricCell
            loading={loading}
            label="Gross Collected"
            value={fmtMoney(metrics.grossCollected)}
            sub="all packages sold"
            accent="#06A29E"
          />
          <MetricCell
            loading={loading}
            label="Delivered Value"
            value={fmtMoney(metrics.deliveredValue)}
            sub="sessions completed"
            accent="#2A255D"
          />
          <MetricCell
            loading={loading}
            label="Package Liability"
            value={fmtMoney(metrics.packageLiability)}
            sub="sessions still owed"
            accent="#1F73B1"
            highlight
          />
          <MetricCell
            loading={loading}
            label="Labor Cost"
            value={fmtMoney(metrics.laborCost)}
            sub="payroll this period"
            accent="#6B7280"
          />
          <MetricCell
            loading={loading}
            label="Labor %"
            value={metrics.hasPricing ? `${metrics.laborPct.toFixed(1)}%` : "—"}
            sub="of gross collected"
            accent={metrics.laborPct > 40 ? "#DC2626" : "#06A29E"}
          />
          <MetricCell
            loading={loading}
            label="Net Revenue"
            value={metrics.hasPricing ? fmtMoney(metrics.netRevenue) : "—"}
            sub="collected − labor"
            accent={metrics.netRevenue >= 0 ? "#06A29E" : "#DC2626"}
            large
          />
        </div>
      </div>

      {/* ── Expiring packages alert ────────────────────────────────────────── */}
      {expiringSoon.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200">
            <svg className="w-4 h-4 text-amber-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-sm font-semibold text-amber-800">
              {expiringSoon.length} package{expiringSoon.length !== 1 ? "s" : ""} expiring within 30 days
            </span>
          </div>
          {waiveError && <p className="px-4 py-2 text-xs text-red-600">{waiveError}</p>}
          <div className="divide-y divide-amber-100">
            {expiringSoon.map((p) => {
              const days = daysUntil(p.expiration_date!);
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#2A255D] truncate">{p.clientName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.clientPhone || "No phone"} · {p.sessions_remaining} session{p.sessions_remaining !== 1 ? "s" : ""} remaining
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-semibold ${days <= 7 ? "text-red-600" : "text-amber-700"}`}>
                      {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`}
                    </p>
                    <p className="text-[11px] text-gray-400">{fmtDate(p.expiration_date)}</p>
                  </div>
                  <button
                    onClick={() => handleWaive(p.id)}
                    disabled={waving === p.id}
                    className="ml-2 px-2.5 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition disabled:opacity-50 flex-shrink-0"
                  >
                    {waving === p.id ? "…" : "Waive"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Active packages table ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3 flex-wrap">
          <h2 className="font-semibold text-sm text-[#2A255D]">Active Packages</h2>
          <div className="relative">
            <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition w-44"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#06A29E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredPkgs.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-10">
            {search ? "No packages match your search." : "No active packages found."}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["Client", "Package", "Price", "Total", "Used", "Remaining", "Purchased", "Expires", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-400 uppercase tracking-wide text-[11px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredPkgs.map((p) => (
                    <tr key={p.id} className={`${sessionRowColor(p.sessions_remaining)} transition`}>
                      <td className="px-4 py-3 font-semibold text-[#2A255D] whitespace-nowrap">{p.clientName}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.packageName}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {p.priceCents > 0 ? fmtMoney(p.priceCents) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-center">{p.sessions_total}</td>
                      <td className="px-4 py-3 text-gray-600 text-center">{p.sessions_used}</td>
                      <td className="px-4 py-3 font-semibold text-center">
                        <span className={p.sessions_remaining === 0 ? "text-red-600" : p.sessions_remaining <= 3 ? "text-amber-600" : "text-emerald-700"}>
                          {p.sessions_remaining}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.purchase_date)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {p.expiration_waived ? <span className="text-[#06A29E] font-medium">Waived</span> : fmtDate(p.expiration_date)}
                      </td>
                      <td className="px-4 py-3">{sessionBadge(p.sessions_remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-50">
              {filteredPkgs.map((p) => (
                <div key={p.id} className={`px-4 py-3 ${sessionRowColor(p.sessions_remaining)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#2A255D]">{p.clientName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.packageName}{p.priceCents > 0 ? ` · ${fmtMoney(p.priceCents)}` : ""}</p>
                    </div>
                    {sessionBadge(p.sessions_remaining)}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600">
                    <span><span className="text-gray-400">Total</span> {p.sessions_total}</span>
                    <span><span className="text-gray-400">Used</span> {p.sessions_used}</span>
                    <span className={`font-semibold ${p.sessions_remaining === 0 ? "text-red-600" : p.sessions_remaining <= 3 ? "text-amber-600" : "text-emerald-700"}`}>{p.sessions_remaining} left</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    Expires: {p.expiration_waived ? <span className="text-[#06A29E]">Waived</span> : fmtDate(p.expiration_date)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Recent bookings ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-sm text-[#2A255D]">Recent Bookings</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#06A29E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : bookings.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-10">No appointments found.</p>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["Date", "Time", "Client", "Trainer", "Duration", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-400 uppercase tracking-wide text-[11px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50/60 transition">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDate(b.appointment_date)}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtTime(b.start_time)}</td>
                      <td className="px-4 py-3 font-medium text-[#2A255D] whitespace-nowrap">{b.clientName}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.trainerName}</td>
                      <td className="px-4 py-3 text-gray-500">{b.duration_minutes} min</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${STATUS_STYLES[b.status] ?? "bg-gray-100 text-gray-500"}`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-gray-50">
              {bookings.map((b) => (
                <div key={b.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#2A255D]">{b.clientName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{b.trainerName} · {b.duration_minutes} min</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize flex-shrink-0 ${STATUS_STYLES[b.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {b.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{fmtDate(b.appointment_date)} at {fmtTime(b.start_time)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, icon, accent, urgent = false,
}: {
  label: string; value: string;
  icon: React.ReactNode;
  accent: string; urgent?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border ${urgent ? "border-red-200" : "border-gray-100"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accent}15` }}>
          <svg style={{ color: accent }} className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            {icon}
          </svg>
        </div>
        {urgent && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
      </div>
      <p className="text-2xl font-bold" style={{ color: urgent ? "#DC2626" : "#2A255D" }}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

function MetricCell({
  loading, label, value, sub, accent, highlight = false, large = false,
}: {
  loading: boolean; label: string; value: string; sub: string;
  accent: string; highlight?: boolean; large?: boolean;
}) {
  return (
    <div className={`px-4 py-4 ${highlight ? "bg-blue-50/40" : ""}`}>
      <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium mb-1">{label}</p>
      {loading ? (
        <div className="h-5 w-16 bg-gray-100 rounded animate-pulse" />
      ) : (
        <p className={`font-bold ${large ? "text-xl" : "text-base"}`} style={{ color: accent }}>{value}</p>
      )}
      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
