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

// Deduct one session from a package and fire SMS alerts based on new remaining count.
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

// POST /api/booking/create
bookingRouter.post("/booking/create", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caller = await verifyToken(url, key, token);
  if (!caller) { res.status(401).json({ error: "Invalid session." }); return; }

  const { trainer_id, client_id, client_package_id, appointment_date, start_time, duration_minutes, notes } =
    req.body as {
      trainer_id: string; client_id: string; client_package_id: string;
      appointment_date: string; start_time: string; duration_minutes: 30 | 45 | 60; notes?: string;
    };

  if (!trainer_id || !client_id || !client_package_id || !appointment_date || !start_time || !duration_minutes) {
    res.status(400).json({ error: "Missing required fields." });
    return;
  }

  const pkgRes = await fetch(
    `${url}/rest/v1/client_packages?id=eq.${client_package_id}&select=sessions_remaining,sessions_used,is_active,owner_client_id`,
    { headers: svcHeaders(key) },
  );
  const [pkg] = (await pkgRes.json()) as {
    sessions_remaining: number; sessions_used: number;
    is_active: boolean; owner_client_id: string;
  }[];
  if (!pkg || !pkg.is_active || pkg.sessions_remaining <= 0) {
    res.status(400).json({ error: "No sessions remaining in this package." });
    return;
  }

  // Determine whether the appointment falls within 24 hours from now
  const apptTime = new Date(`${appointment_date}T${start_time}`);
  const hoursUntil = (apptTime.getTime() - Date.now()) / (1000 * 60 * 60);
  const deductNow = hoursUntil <= 24;
  const end_time = addMinutes(start_time, duration_minutes);
  const now = new Date().toISOString();

  const insertRes = await fetch(`${url}/rest/v1/appointments`, {
    method: "POST",
    headers: { ...svcHeaders(key), Prefer: "return=representation" },
    body: JSON.stringify({
      client_id, trainer_id, client_package_id,
      appointment_date, start_time, end_time, duration_minutes,
      status: "scheduled",
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

  // Non-blocking post-response work
  (async () => {
    try {
      let newRemaining = pkg.sessions_remaining;

      // Deduct package if within 24hrs
      if (deductNow) {
        newRemaining = await deductSessionFromPackage(url, key, appointment.id, client_package_id, pkg);
      }

      // Fetch client + trainer for SMS
      const [client, trainer] = await Promise.all([
        getClientInfo(url, key, client_id),
        getTrainerInfo(url, key, trainer_id),
      ]);

      // Booking confirmation
      if (client?.phone && trainer) {
        await sendBookingConfirmation(url, key, client, trainer, {
          appointment_date, start_time, duration_minutes,
        });
      }

      // Low-package / renewal alerts (only if we deducted immediately)
      if (deductNow && client?.phone) {
        if (newRemaining === 3) await sendLowPackageAlert(url, key, client, newRemaining);
        else if (newRemaining === 1) await sendRenewalReminder(url, key, client);
      }
    } catch { /* never crash the response */ }
  })();
});

// POST /api/booking/cancel
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
    `${url}/rest/v1/appointments?id=eq.${appointment_id}&select=id,client_id,trainer_id,client_package_id,appointment_date,start_time,status,session_deducted`,
    { headers: svcHeaders(key) },
  );
  const [appt] = (await apptRes.json()) as {
    id: string; client_id: string; trainer_id: string; client_package_id: string;
    appointment_date: string; start_time: string; status: string; session_deducted: boolean;
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

  // Case 1 — already deducted AND within 24hrs of appointment → forfeit, no return
  // Case 2 — already deducted AND more than 24hrs out → cancel + return session
  // Case 3 — not yet deducted → cancel, no adjustment needed
  const within24hr = hoursUntilAppt < 24;
  const forfeited = appt.session_deducted && within24hr;

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

  // Case 2 only — return the session
  if (appt.session_deducted && !within24hr) {
    const pkgRes = await fetch(
      `${url}/rest/v1/client_packages?id=eq.${appt.client_package_id}&select=sessions_remaining,sessions_used,is_active`,
      { headers: svcHeaders(key) },
    );
    const [pkg] = (await pkgRes.json()) as {
      sessions_remaining: number; sessions_used: number; is_active: boolean;
    }[];
    if (pkg) {
      const newRemaining = pkg.sessions_remaining + 1;
      await fetch(`${url}/rest/v1/client_packages?id=eq.${appt.client_package_id}`, {
        method: "PATCH",
        headers: { ...svcHeaders(key), Prefer: "return=minimal" },
        body: JSON.stringify({
          sessions_remaining: newRemaining,
          sessions_used: Math.max(0, pkg.sessions_used - 1),
          // Reactivate package if it was deactivated due to 0 sessions
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

  // Non-blocking SMS
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
        const clientName = client.first_name;
        tasks.push(sendTrainerCancellationAlert(url, key, trainer, clientName, apptRef));
      }
      await Promise.all(tasks);
    } catch { /* never crash */ }
  })();
});

export default bookingRouter;
