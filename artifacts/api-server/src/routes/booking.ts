import { Router } from "express";
import type { Request, Response } from "express";

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

  // Validate package has sessions
  const pkgRes = await fetch(
    `${url}/rest/v1/client_packages?id=eq.${client_package_id}&select=sessions_remaining,is_active`,
    { headers: svcHeaders(key) }
  );
  const [pkg] = (await pkgRes.json()) as { sessions_remaining: number; is_active: boolean }[];
  if (!pkg || !pkg.is_active || pkg.sessions_remaining <= 0) {
    res.status(400).json({ error: "No sessions remaining in this package." });
    return;
  }

  const end_time = addMinutes(start_time, duration_minutes);

  const insertRes = await fetch(`${url}/rest/v1/appointments`, {
    method: "POST",
    headers: { ...svcHeaders(key), Prefer: "return=representation" },
    body: JSON.stringify({
      client_id, trainer_id, client_package_id,
      appointment_date, start_time, end_time, duration_minutes,
      status: "scheduled", session_deducted: false,
      notes: notes ?? null,
    }),
  });

  if (!insertRes.ok) {
    const err = (await insertRes.json()) as { message?: string };
    res.status(500).json({ error: err.message ?? "Failed to create appointment." });
    return;
  }

  const [appointment] = (await insertRes.json()) as { id: string }[];
  res.status(201).json({ appointment });
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
    `${url}/rest/v1/appointments?id=eq.${appointment_id}&select=id,client_package_id,appointment_date,start_time,status,session_deducted`,
    { headers: svcHeaders(key) }
  );
  const [appt] = (await apptRes.json()) as {
    id: string; client_package_id: string; appointment_date: string;
    start_time: string; status: string; session_deducted: boolean;
  }[];

  if (!appt) { res.status(404).json({ error: "Appointment not found." }); return; }
  if (appt.status !== "scheduled") {
    res.status(400).json({ error: "Only scheduled appointments can be cancelled." });
    return;
  }

  const now = new Date();
  const apptTime = new Date(`${appt.appointment_date}T${appt.start_time}`);
  const within24hr = (apptTime.getTime() - now.getTime()) / (1000 * 60 * 60) < 24;
  const cancelledAt = now.toISOString();

  if (within24hr) {
    await fetch(`${url}/rest/v1/appointments?id=eq.${appointment_id}`, {
      method: "PATCH",
      headers: { ...svcHeaders(key), Prefer: "return=minimal" },
      body: JSON.stringify({ status: "forfeited", cancellation_within_24hr: true, cancelled_at: cancelledAt }),
    });
    res.json({ forfeited: true, message: "Cancelled within 24 hours — session forfeited per studio policy." });
  } else {
    await fetch(`${url}/rest/v1/appointments?id=eq.${appointment_id}`, {
      method: "PATCH",
      headers: { ...svcHeaders(key), Prefer: "return=minimal" },
      body: JSON.stringify({ status: "cancelled", cancellation_within_24hr: false, cancelled_at: cancelledAt }),
    });

    if (appt.session_deducted) {
      const pkgRes = await fetch(
        `${url}/rest/v1/client_packages?id=eq.${appt.client_package_id}&select=sessions_remaining,sessions_used`,
        { headers: svcHeaders(key) }
      );
      const [pkg2] = (await pkgRes.json()) as { sessions_remaining: number; sessions_used: number }[];
      if (pkg2) {
        await fetch(`${url}/rest/v1/client_packages?id=eq.${appt.client_package_id}`, {
          method: "PATCH",
          headers: { ...svcHeaders(key), Prefer: "return=minimal" },
          body: JSON.stringify({
            sessions_remaining: pkg2.sessions_remaining + 1,
            sessions_used: Math.max(0, pkg2.sessions_used - 1),
          }),
        });
      }
    }
    res.json({ forfeited: false, message: "Appointment cancelled. Session returned to your package." });
  }
});

export default bookingRouter;
