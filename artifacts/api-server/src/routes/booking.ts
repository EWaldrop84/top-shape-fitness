import { Router } from "express";
import type { Request, Response } from "express";
import {
  sendBookingConfirmation,
  sendCancellationReceipt,
  sendTrainerCancellationAlert,
  sendLowPackageAlert,
  sendRenewalReminder,
} from "../sms";

const bookingRouter = Router();

function svcHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function verifyToken(supabaseUrl: string, serviceRoleKey: string, token: string) {
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json() as Promise<{ id: string }>;
}

async function getClientInfo(url: string, key: string, clientId: string) {
  const r = await fetch(
    `${url}/rest/v1/clients?id=eq.${clientId}&select=user_id,users!clients_user_id_fkey(first_name,phone)&limit=1`,
    { headers: svcHeaders(key) },
  );
  const [row] = (await r.json()) as { user_id: string; users: { first_name: string; phone: string | null } }[];
  if (!row) return null;
  return { user_id: row.user_id, first_name: row.users?.first_name ?? "there", phone: row.users?.phone ?? "" };
}

async function getTrainerInfo(url: string, key: string, trainerId: string) {
  const r = await fetch(
    `${url}/rest/v1/trainers?id=eq.${trainerId}&select=user_id,users!trainers_user_id_fkey(first_name,last_name,phone)&limit=1`,
    { headers: svcHeaders(key) },
  );
  const [row] = (await r.json()) as {
    user_id: string;
    users: { first_name: string; last_name: string | null; phone: string | null };
  }[];
  if (!row) return null;
  return {
    user_id: row.user_id,
    first_name: row.users?.first_name ?? "Trainer",
    last_name: row.users?.last_name ?? null,
    phone: row.users?.phone ?? "",
  };
}

async function deductSessionFromPackage(
  url: string,
  key: string,
  appointmentId: string,
  packageId: string,
  pkg: { sessions_remaining: number; sessions_used: number; owner_client_id?: string },
): Promise<number> {
  const newRemaining = pkg.sessions_remaining - 1;
  const now = new Date().toISOString();

  await Promise.all([
    fetch(`${url}/rest/v1/appointments?id=eq.${appointmentId}`, {
      method: "PATCH",
      headers: { ...svcHeaders(key), Prefer: "return=minimal" },
      body: JSON.stringify({ session_deducted: true, deducted_at: now }),
    }),
    fetch(`${url}/rest/v1/client_packages?id=eq.${packageId}`, {
      method: "PATCH",
      headers: { ...svcHeaders(key), Prefer: "return=minimal" },
      body: JSON.stringify({
        sessions_remaining: newRemaining,
        sessions_used: pkg.sessions_used + 1,
        ...(newRemaining === 0 ? { is_active: false } : {}),
      }),
    }),
  ]);

  return newRemaining;
}

// ── POST /api/booking/create ─────────────────────────────────────────────────
bookingRouter.post("/booking/create", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caller = await verifyToken(url, key, token);
  if (!caller) { res.status(401).json({ error: "Invalid session." }); return; }

  const {
    trainer_id, client_id, client_package_id, appointment_date,
    start_time, duration_minutes, notes,
    session_type = "training",
  } = req.body as {
    trainer_id: string; client_id: string; client_package_id?: string;
    appointment_date: string; start_time: string; duration_minutes: 30 | 45 | 60;
    notes?: string; session_type?: "training" | "consultation";
  };

  if (!trainer_id || !client_id || !appointment_date || !start_time || !duration_minutes) {
    res.status(400).json({ error: "Missing required fields." });
    return;
  }

  const isConsultation = session_type === "consultation";

  // Package validation — skip for consultations
  let pkg: { sessions_remaining: number; sessions_used: number; is_active: boolean; owner_client_id: string } | null = null;
  if (!isConsultation) {
    if (!client_package_id) {
      res.status(400).json({ error: "Package is required for training sessions." });
      return;
    }
    const pkgRes = await fetch(
      `${url}/rest/v1/client_packages?id=eq.${client_package_id}&select=sessions_remaining,sessions_used,is_active,owner_client_id`,
      { headers: svcHeaders(key) },
    );
    const [p] = (await pkgRes.json()) as { sessions_remaining: number; sessions_used: number; is_active: boolean; owner_client_id: string }[];
    if (!p || !p.is_active || p.sessions_remaining <= 0) {
      res.status(400).json({ error: "No sessions remaining in this package." });
      return;
    }
    pkg = p;
  }

  const apptTime = new Date(`${appointment_date}T${start_time}`);
  const hoursUntil = (apptTime.getTime() - Date.now()) / (1000 * 60 * 60);
  // Consultations are never deducted; training sessions deduct immediately if within 24hrs
  const deductNow = !isConsultation && hoursUntil <= 24;
  const end_time = addMinutes(start_time, duration_minutes);
  const now = new Date().toISOString();

  const insertRes = await fetch(`${url}/rest/v1/appointments`, {
    method: "POST",
    headers: { ...svcHeaders(key), Prefer: "return=representation" },
    body: JSON.stringify({
      client_id, trainer_id,
      client_package_id: isConsultation ? null : (client_package_id ?? null),
      appointment_date, start_time, end_time, duration_minutes,
      status: "scheduled",
      session_type,
      session_deducted: deductNow,
      deducted_at: deductNow ? now : null,
      notes: notes ?? null,
    }),
  });

  if (!insertRes.ok) {
    const err = (await insertRes.json()) as { message?: string };
    res.status(500).json({ error: err.message ?? "Failed to create appointment." });
    return;
  }

  const [appointment] = (await insertRes.json()) as { id: string }[];
  res.status(201).json({ appointment, deductedImmediately: deductNow });

  // Non-blocking post-response work (skip SMS for consultations as they are complimentary)
  (async () => {
    try {
      let newRemaining = pkg?.sessions_remaining ?? 0;

      if (deductNow && pkg && client_package_id) {
        newRemaining = await deductSessionFromPackage(url, key, appointment.id, client_package_id, pkg);
      }

      const [client, trainer] = await Promise.all([
        getClientInfo(url, key, client_id),
        getTrainerInfo(url, key, trainer_id),
      ]);

      if (client?.phone && trainer) {
        await sendBookingConfirmation(url, key, client, trainer, {
          appointment_date, start_time, duration_minutes,
        });
      }

      if (deductNow && client?.phone && !isConsultation) {
        if (newRemaining === 3) await sendLowPackageAlert(url, key, client, newRemaining);
        else if (newRemaining === 1) await sendRenewalReminder(url, key, client);
      }
    } catch { /* never crash the response */ }
  })();
});

// ── POST /api/booking/create-recurring ──────────────────────────────────────
// Creates a recurring_series + generates 52 weeks of appointments
bookingRouter.post("/booking/create-recurring", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caller = await verifyToken(url, key, token);
  if (!caller) { res.status(401).json({ error: "Invalid session." }); return; }

  const { trainer_id, client_id, client_package_id, start_time, duration_minutes, recurring_days, notes } =
    req.body as {
      trainer_id: string; client_id: string; client_package_id: string;
      start_time: string; duration_minutes: 30 | 45 | 60;
      recurring_days: number[]; notes?: string;
    };

  if (!trainer_id || !client_id || !client_package_id || !start_time || !duration_minutes || !recurring_days?.length) {
    res.status(400).json({ error: "Missing required fields." });
    return;
  }

  // Validate the package exists and is active
  const pkgRes = await fetch(
    `${url}/rest/v1/client_packages?id=eq.${client_package_id}&select=sessions_remaining,is_active&limit=1`,
    { headers: svcHeaders(key) },
  );
  const [pkg] = (await pkgRes.json()) as { sessions_remaining: number; is_active: boolean }[];
  if (!pkg || !pkg.is_active) {
    res.status(400).json({ error: "Package not found or inactive." });
    return;
  }

  const hdrs = svcHeaders(key);

  // Create the recurring_series record
  const seriesRes = await fetch(`${url}/rest/v1/recurring_series`, {
    method: "POST",
    headers: { ...hdrs, Prefer: "return=representation" },
    body: JSON.stringify({ trainer_id, client_id, client_package_id, days_of_week: recurring_days, start_time, duration_minutes }),
  });
  if (!seriesRes.ok) {
    const err = (await seriesRes.json()) as { message?: string };
    res.status(500).json({ error: err.message ?? "Failed to create recurring series." });
    return;
  }
  const [series] = (await seriesRes.json()) as { id: string }[];

  // Generate appointments for the next 52 weeks for each selected day
  const end_time = addMinutes(start_time, duration_minutes);
  const appointments: object[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let week = 0; week < 52; week++) {
    for (const dayOfWeek of recurring_days) {
      // Find the date of this day of week in the current week offset
      const d = new Date(today);
      d.setDate(d.getDate() + week * 7 + ((dayOfWeek - today.getDay() + 7) % 7));
      if (d < today) continue; // skip past dates

      const dateStr = d.toISOString().split("T")[0];
      appointments.push({
        client_id, trainer_id, client_package_id,
        appointment_date: dateStr, start_time, end_time, duration_minutes,
        status: "scheduled", session_type: "training",
        session_deducted: false, is_recurring: true,
        recurring_days, recurring_series_id: series.id,
        notes: notes ?? null,
      });
    }
  }

  // Insert in batches of 100 to stay under Supabase limits
  let created = 0;
  for (let i = 0; i < appointments.length; i += 100) {
    const batch = appointments.slice(i, i + 100);
    const r = await fetch(`${url}/rest/v1/appointments`, {
      method: "POST",
      headers: { ...hdrs, Prefer: "return=minimal" },
      body: JSON.stringify(batch),
    });
    if (r.ok) created += batch.length;
  }

  res.status(201).json({ series: { id: series.id }, created });
});

// ── POST /api/booking/stop-recurring ────────────────────────────────────────
// Deactivates a series and bulk-cancels all future scheduled appointments in it
bookingRouter.post("/booking/stop-recurring", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caller = await verifyToken(url, key, token);
  if (!caller) { res.status(401).json({ error: "Invalid session." }); return; }

  const { series_id } = req.body as { series_id: string };
  if (!series_id) { res.status(400).json({ error: "series_id required." }); return; }

  const hdrs = svcHeaders(key);
  const today = new Date().toISOString().split("T")[0];

  await Promise.all([
    // Mark series inactive
    fetch(`${url}/rest/v1/recurring_series?id=eq.${series_id}`, {
      method: "PATCH",
      headers: { ...hdrs, Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false }),
    }),
    // Cancel all future scheduled appointments in this series
    fetch(`${url}/rest/v1/appointments?recurring_series_id=eq.${series_id}&status=eq.scheduled&appointment_date=gte.${today}`, {
      method: "PATCH",
      headers: { ...hdrs, Prefer: "return=minimal" },
      body: JSON.stringify({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: caller.id }),
    }),
  ]);

  res.json({ ok: true });
});

// ── POST /api/booking/cancel ─────────────────────────────────────────────────
bookingRouter.post("/booking/cancel", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caller = await verifyToken(url, key, token);
  if (!caller) { res.status(401).json({ error: "Invalid session." }); return; }

  const { appointment_id } = req.body as { appointment_id: string };
  if (!appointment_id) { res.status(400).json({ error: "appointment_id required." }); return; }

  const apptRes = await fetch(
    `${url}/rest/v1/appointments?id=eq.${appointment_id}&select=id,client_id,trainer_id,client_package_id,appointment_date,start_time,status,session_deducted,session_type`,
    { headers: svcHeaders(key) },
  );
  const [appt] = (await apptRes.json()) as {
    id: string; client_id: string; trainer_id: string; client_package_id: string | null;
    appointment_date: string; start_time: string; status: string;
    session_deducted: boolean; session_type: string;
  }[];

  if (!appt) { res.status(404).json({ error: "Appointment not found." }); return; }
  if (appt.status !== "scheduled") {
    res.status(400).json({ error: "Only scheduled appointments can be cancelled." });
    return;
  }

  const now = new Date();
  const apptTime = new Date(`${appt.appointment_date}T${appt.start_time}`);
  const hoursUntilAppt = (apptTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const cancelledAt = now.toISOString();

  const within24hr = hoursUntilAppt < 24;
  // Consultations are never forfeited — they have no package
  const forfeited = appt.session_type !== "consultation" && appt.session_deducted && within24hr;

  await fetch(`${url}/rest/v1/appointments?id=eq.${appointment_id}`, {
    method: "PATCH",
    headers: { ...svcHeaders(key), Prefer: "return=minimal" },
    body: JSON.stringify({
      status: forfeited ? "forfeited" : "cancelled",
      cancellation_within_24hr: within24hr,
      cancelled_at: cancelledAt,
      cancelled_by: caller.id,
    }),
  });

  // Return session for early-cancelled training appointments only
  if (appt.session_type !== "consultation" && appt.session_deducted && !within24hr && appt.client_package_id) {
    const pkgRes = await fetch(
      `${url}/rest/v1/client_packages?id=eq.${appt.client_package_id}&select=sessions_remaining,sessions_used,is_active`,
      { headers: svcHeaders(key) },
    );
    const [pkg] = (await pkgRes.json()) as { sessions_remaining: number; sessions_used: number; is_active: boolean }[];
    if (pkg) {
      const newRemaining = pkg.sessions_remaining + 1;
      await fetch(`${url}/rest/v1/client_packages?id=eq.${appt.client_package_id}`, {
        method: "PATCH",
        headers: { ...svcHeaders(key), Prefer: "return=minimal" },
        body: JSON.stringify({
          sessions_remaining: newRemaining,
          sessions_used: Math.max(0, pkg.sessions_used - 1),
          ...(newRemaining > 0 && !pkg.is_active ? { is_active: true } : {}),
        }),
      });
    }
  }

  const message = forfeited
    ? "Cancelled within 24 hours — session forfeited per studio policy."
    : appt.session_deducted
      ? "Appointment cancelled. Session returned to your package."
      : "Appointment cancelled.";

  res.json({ forfeited, message });

  (async () => {
    try {
      const [client, trainer] = await Promise.all([
        getClientInfo(url, key, appt.client_id),
        getTrainerInfo(url, key, appt.trainer_id),
      ]);
      const apptRef = { appointment_date: appt.appointment_date, start_time: appt.start_time };
      const tasks: Promise<void>[] = [];
      if (client?.phone) tasks.push(sendCancellationReceipt(url, key, client, apptRef, forfeited));
      if (trainer?.phone && client) {
        tasks.push(sendTrainerCancellationAlert(url, key, trainer, client.first_name, apptRef));
      }
      await Promise.all(tasks);
    } catch { /* never crash */ }
  })();
});

// ── POST /api/booking/delete ─────────────────────────────────────────────────
// Hard-deletes a single appointment; returns the session to the package if it was already deducted.
bookingRouter.post("/booking/delete", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caller = await verifyToken(url, key, token);
  if (!caller) { res.status(401).json({ error: "Invalid session." }); return; }

  const { appointment_id } = req.body as { appointment_id: string };
  if (!appointment_id) { res.status(400).json({ error: "appointment_id required." }); return; }

  const hdrs = svcHeaders(key);

  const apptRes = await fetch(
    `${url}/rest/v1/appointments?id=eq.${appointment_id}&select=id,client_package_id,session_deducted,session_type,status&limit=1`,
    { headers: hdrs },
  );
  const [appt] = (await apptRes.json()) as {
    id: string; client_package_id: string | null;
    session_deducted: boolean; session_type: string; status: string;
  }[];
  if (!appt) { res.status(404).json({ error: "Appointment not found." }); return; }

  // Return the session to the package if it was already deducted on a scheduled training session
  if (appt.status === "scheduled" && appt.session_deducted && appt.session_type !== "consultation" && appt.client_package_id) {
    const pkgRes = await fetch(
      `${url}/rest/v1/client_packages?id=eq.${appt.client_package_id}&select=sessions_remaining,sessions_used,is_active&limit=1`,
      { headers: hdrs },
    );
    const [pkg] = (await pkgRes.json()) as { sessions_remaining: number; sessions_used: number; is_active: boolean }[];
    if (pkg) {
      const newRemaining = pkg.sessions_remaining + 1;
      await fetch(`${url}/rest/v1/client_packages?id=eq.${appt.client_package_id}`, {
        method: "PATCH",
        headers: { ...hdrs, Prefer: "return=minimal" },
        body: JSON.stringify({
          sessions_remaining: newRemaining,
          sessions_used: Math.max(0, pkg.sessions_used - 1),
          ...(!pkg.is_active && newRemaining > 0 ? { is_active: true } : {}),
        }),
      });
    }
  }

  await fetch(`${url}/rest/v1/appointments?id=eq.${appointment_id}`, {
    method: "DELETE",
    headers: { ...hdrs, Prefer: "return=minimal" },
  });

  res.json({ ok: true });
});

// ── POST /api/booking/delete-future ─────────────────────────────────────────
// Hard-deletes all scheduled appointments in a recurring series from a given date forward,
// returning any already-deducted sessions back to their packages.
bookingRouter.post("/booking/delete-future", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caller = await verifyToken(url, key, token);
  if (!caller) { res.status(401).json({ error: "Invalid session." }); return; }

  const { recurring_series_id, appointment_date } = req.body as {
    recurring_series_id: string; appointment_date: string;
  };
  if (!recurring_series_id || !appointment_date) {
    res.status(400).json({ error: "recurring_series_id and appointment_date required." }); return;
  }

  const hdrs = svcHeaders(key);

  // Fetch all scheduled appointments in this series from this date forward
  const apptRes = await fetch(
    `${url}/rest/v1/appointments?recurring_series_id=eq.${recurring_series_id}&appointment_date=gte.${appointment_date}&status=eq.scheduled&select=id,client_package_id,session_deducted,session_type`,
    { headers: hdrs },
  );
  const appts = (await apptRes.json()) as {
    id: string; client_package_id: string | null;
    session_deducted: boolean; session_type: string;
  }[];

  // Group deducted sessions by package to return them in batch
  const byPackage = new Map<string, number>();
  for (const a of appts) {
    if (a.session_deducted && a.session_type !== "consultation" && a.client_package_id) {
      byPackage.set(a.client_package_id, (byPackage.get(a.client_package_id) ?? 0) + 1);
    }
  }

  for (const [pkgId, count] of byPackage) {
    const pkgRes = await fetch(
      `${url}/rest/v1/client_packages?id=eq.${pkgId}&select=sessions_remaining,sessions_used,is_active&limit=1`,
      { headers: hdrs },
    );
    const [pkg] = (await pkgRes.json()) as { sessions_remaining: number; sessions_used: number; is_active: boolean }[];
    if (pkg) {
      const newRemaining = pkg.sessions_remaining + count;
      await fetch(`${url}/rest/v1/client_packages?id=eq.${pkgId}`, {
        method: "PATCH",
        headers: { ...hdrs, Prefer: "return=minimal" },
        body: JSON.stringify({
          sessions_remaining: newRemaining,
          sessions_used: Math.max(0, pkg.sessions_used - count),
          ...(!pkg.is_active && newRemaining > 0 ? { is_active: true } : {}),
        }),
      });
    }
  }

  // Hard-delete all matching appointments
  await fetch(
    `${url}/rest/v1/appointments?recurring_series_id=eq.${recurring_series_id}&appointment_date=gte.${appointment_date}&status=eq.scheduled`,
    { method: "DELETE", headers: { ...hdrs, Prefer: "return=minimal" } },
  );

  res.json({ ok: true, deleted: appts.length });
});

export default bookingRouter;
