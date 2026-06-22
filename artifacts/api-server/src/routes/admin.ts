import { Router } from "express";
import type { Request, Response } from "express";
import { sendLowPackageAlert, sendRenewalReminder } from "../sms";

const adminRouter = Router();

adminRouter.post("/admin/create-client", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    res.status(503).json({
      error: "Server not configured for user creation. SUPABASE_SERVICE_ROLE_KEY is missing.",
    });
    return;
  }

  // Verify caller's JWT via Supabase
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!verifyRes.ok) {
    res.status(401).json({ error: "Invalid or expired session. Please log in again." });
    return;
  }

  const callerAuth = (await verifyRes.json()) as { id: string };

  // Check admin role in public.users
  const userCheckRes = await fetch(
    `${supabaseUrl}/rest/v1/users?id=eq.${callerAuth.id}&select=role&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }
  );
  const [callerUser] = (await userCheckRes.json()) as { role: string }[];
  if (!callerUser || callerUser.role !== "admin") {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const { first_name, last_name, email, phone, notes } = req.body as {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    notes?: string;
  };

  if (!email || !phone) {
    res.status(400).json({ error: "Email and phone are required." });
    return;
  }

  // Generate temp password: TopShape + last 4 digits of phone
  const digits = phone.replace(/\D/g, "");
  const last4 = digits.slice(-4).padStart(4, "0");
  const tempPassword = `TopShape${last4}`;

  // Create Supabase auth user
  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { first_name, last_name, phone },
    }),
  });

  if (!createRes.ok) {
    const err = (await createRes.json()) as { message?: string; msg?: string };
    res.status(400).json({ error: err.message ?? err.msg ?? "Failed to create auth user." });
    return;
  }

  const newAuthUser = (await createRes.json()) as { id: string };

  // Insert into public.users
  const insertUserRes = await fetch(`${supabaseUrl}/rest/v1/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      id: newAuthUser.id,
      email,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      phone: phone ?? null,
      role: "client",
      is_active: true,
    }),
  });

  if (!insertUserRes.ok) {
    // Best-effort rollback of auth user
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${newAuthUser.id}`, {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    res.status(500).json({ error: "Failed to create user profile. Auth user rolled back." });
    return;
  }

  const [newUser] = (await insertUserRes.json()) as { id: string }[];

  // Insert into public.clients
  const insertClientRes = await fetch(`${supabaseUrl}/rest/v1/clients`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: newAuthUser.id,
      notes: notes ?? null,
      waiver_signed: false,
      created_by: callerAuth.id,
    }),
  });

  if (!insertClientRes.ok) {
    res.status(500).json({ error: "User created but failed to create client record." });
    return;
  }

  const [newClient] = (await insertClientRes.json()) as { id: string }[];

  res.status(201).json({
    client: { ...newClient, users: newUser },
    tempPassword,
  });
});

// POST /api/admin/deduct-sessions — process pending session deductions with SMS alerts
adminRouter.post("/admin/deduct-sessions", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const verifyRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!verifyRes.ok) { res.status(401).json({ error: "Invalid session." }); return; }

  const hdrs = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // Fetch all scheduled, not-yet-deducted appointments (include client_id for share resolution)
  const apptRes = await fetch(
    `${url}/rest/v1/appointments?status=eq.scheduled&session_deducted=eq.false` +
    `&select=id,client_id,client_package_id,appointment_date,start_time`,
    { headers: hdrs },
  );
  const appointments = (await apptRes.json()) as {
    id: string; client_id: string; client_package_id: string | null;
    appointment_date: string; start_time: string;
  }[];

  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let deducted = 0;

  for (const appt of appointments) {
    // Only deduct if within 24 hours
    if (new Date(`${appt.appointment_date}T${appt.start_time}`) > cutoff) continue;

    // Resolve which package to deduct from:
    // 1. Use appt.client_package_id if set
    // 2. Otherwise look for client's own active package
    // 3. Otherwise look for a shared package via client_package_shares
    let resolvedPackageId = appt.client_package_id;
    if (!resolvedPackageId) {
      const ownRes = await fetch(
        `${url}/rest/v1/client_packages?owner_client_id=eq.${appt.client_id}&is_active=eq.true&select=id&limit=1`,
        { headers: hdrs },
      );
      const [ownPkg] = (await ownRes.json()) as { id: string }[];
      if (ownPkg) {
        resolvedPackageId = ownPkg.id;
      } else {
        const shareRes = await fetch(
          `${url}/rest/v1/client_package_shares?shared_client_id=eq.${appt.client_id}&select=client_package_id&limit=1`,
          { headers: hdrs },
        );
        const [share] = (await shareRes.json()) as { client_package_id: string }[];
        if (share) resolvedPackageId = share.client_package_id;
      }
    }
    if (!resolvedPackageId) continue; // no package found — skip

    // Fetch package + owner info
    const pkgRes = await fetch(
      `${url}/rest/v1/client_packages?id=eq.${resolvedPackageId}` +
      `&select=sessions_remaining,sessions_used,owner_client_id,` +
      `clients!owner_client_id(user_id,users!clients_user_id_fkey(first_name,phone))`,
      { headers: hdrs },
    );
    const [pkg] = (await pkgRes.json()) as {
      sessions_remaining: number;
      sessions_used: number;
      owner_client_id: string;
      clients: { user_id: string; users: { first_name: string; phone: string | null } };
    }[];
    if (!pkg || pkg.sessions_remaining <= 0) continue;

    const newRemaining = pkg.sessions_remaining - 1;
    const now = new Date().toISOString();

    // Stamp resolved package_id back onto appointment if it was missing, and mark deducted
    const apptPatch: Record<string, unknown> = { session_deducted: true, deducted_at: now };
    if (!appt.client_package_id) apptPatch.client_package_id = resolvedPackageId;

    await Promise.all([
      fetch(`${url}/rest/v1/appointments?id=eq.${appt.id}`, {
        method: "PATCH",
        headers: { ...hdrs, Prefer: "return=minimal" },
        body: JSON.stringify(apptPatch),
      }),
      fetch(`${url}/rest/v1/client_packages?id=eq.${resolvedPackageId}`, {
        method: "PATCH",
        headers: { ...hdrs, Prefer: "return=minimal" },
        body: JSON.stringify({
          sessions_remaining: newRemaining,
          sessions_used: pkg.sessions_used + 1,
          ...(newRemaining === 0 ? { is_active: false } : {}),
        }),
      }),
    ]);
    deducted++;

    // Fire SMS alerts based on new sessions_remaining (non-blocking)
    const clientUser = pkg.clients?.users;
    if (clientUser?.phone && pkg.clients?.user_id) {
      const client = {
        user_id: pkg.clients.user_id,
        first_name: clientUser.first_name ?? "there",
        phone: clientUser.phone,
      };
      if (newRemaining === 3) {
        sendLowPackageAlert(url, key, client, newRemaining).catch(() => {});
      } else if (newRemaining === 1) {
        sendRenewalReminder(url, key, client).catch(() => {});
      }
    }
  }

  res.json({ deducted });
});

// POST /api/admin/sync-payroll — create payroll_sessions from completed appointments
adminRouter.post("/admin/sync-payroll", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const verifyRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!verifyRes.ok) { res.status(401).json({ error: "Invalid session." }); return; }

  const { week_start, week_end } = req.body as { week_start?: string; week_end?: string };
  if (!week_start || !week_end) {
    res.status(400).json({ error: "week_start and week_end required." });
    return;
  }

  const hdrs = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // Fetch completed appointments in the week
  const apptRes = await fetch(
    `${url}/rest/v1/appointments?status=eq.completed` +
    `&appointment_date=gte.${week_start}&appointment_date=lte.${week_end}` +
    `&select=id,trainer_id,appointment_date,duration_minutes`,
    { headers: hdrs },
  );
  const appointments = (await apptRes.json()) as {
    id: string; trainer_id: string; appointment_date: string; duration_minutes: number;
  }[];

  // Fetch existing payroll_session appointment_ids to avoid duplicates
  const existingRes = await fetch(
    `${url}/rest/v1/payroll_sessions?pay_period_start=eq.${week_start}&pay_period_end=eq.${week_end}&select=appointment_id`,
    { headers: hdrs },
  );
  const existing = new Set(
    ((await existingRes.json()) as { appointment_id: string }[]).map((r) => r.appointment_id),
  );

  const toInsert = appointments
    .filter((a) => !existing.has(a.id))
    .map((a) => ({
      appointment_id: a.id,
      trainer_id: a.trainer_id,
      session_date: a.appointment_date,
      duration_minutes: a.duration_minutes,
      hours: Number((a.duration_minutes / 60).toFixed(2)),
      pay_period_start: week_start,
      pay_period_end: week_end,
      color_code: "tomato",
    }));

  if (toInsert.length === 0) {
    res.json({ created: 0 });
    return;
  }

  const insertRes = await fetch(`${url}/rest/v1/payroll_sessions`, {
    method: "POST",
    headers: { ...hdrs, Prefer: "return=minimal" },
    body: JSON.stringify(toInsert),
  });

  if (!insertRes.ok) {
    const err = (await insertRes.json()) as { message?: string };
    res.status(500).json({ error: err.message ?? "Failed to insert payroll records." });
    return;
  }

  res.json({ created: toInsert.length });
});

// POST /api/admin/complete-appointment
adminRouter.post("/admin/complete-appointment", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const verifyRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!verifyRes.ok) { res.status(401).json({ error: "Invalid session." }); return; }

  const { appointment_id } = req.body as { appointment_id: string };
  if (!appointment_id) { res.status(400).json({ error: "appointment_id required." }); return; }

  const hdrs = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  await fetch(`${url}/rest/v1/appointments?id=eq.${appointment_id}`, {
    method: "PATCH",
    headers: hdrs,
    body: JSON.stringify({ status: "completed" }),
  });

  res.json({ ok: true });
});

// POST /api/admin/waive-expiry — mark a client package's expiration as waived
adminRouter.post("/admin/waive-expiry", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const verifyRes = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!verifyRes.ok) { res.status(401).json({ error: "Invalid session." }); return; }

  const { package_id } = req.body as { package_id?: string };
  if (!package_id) { res.status(400).json({ error: "package_id required." }); return; }

  const hdrs = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  const patchRes = await fetch(`${url}/rest/v1/client_packages?id=eq.${package_id}`, {
    method: "PATCH",
    headers: hdrs,
    body: JSON.stringify({ expiration_waived: true }),
  });

  if (!patchRes.ok) {
    const err = (await patchRes.json()) as { message?: string };
    res.status(500).json({ error: err.message ?? "Failed to waive expiry." });
    return;
  }

  res.json({ ok: true });
});

// ── POST /api/admin/backfill-recurring ──────────────────────────────────────
// Finds orphan recurring appointments (is_recurring=true, recurring_series_id IS NULL),
// groups them into series records, and generates 52 weeks of future occurrences per series.
adminRouter.post("/admin/backfill-recurring", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = authHeader.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!key || !url) { res.status(503).json({ error: "Server misconfigured." }); return; }

  const hdrs = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const verifyRes = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!verifyRes.ok) { res.status(401).json({ error: "Invalid session." }); return; }
  const caller = (await verifyRes.json()) as { id: string };
  const userRes = await fetch(`${url}/rest/v1/users?id=eq.${caller.id}&select=role&limit=1`, { headers: hdrs });
  const [callerUser] = (await userRes.json()) as { role: string }[];
  if (!callerUser || callerUser.role !== "admin") { res.status(403).json({ error: "Admin access required." }); return; }

  function localAddMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(":").map(Number);
    const total = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  // Fetch all orphan recurring appointments (no series ID yet)
  const orphanRes = await fetch(
    `${url}/rest/v1/appointments?is_recurring=eq.true&recurring_series_id=is.null&select=id,trainer_id,client_id,client_package_id,appointment_date,start_time,duration_minutes`,
    { headers: hdrs },
  );
  const orphans = (await orphanRes.json()) as {
    id: string; trainer_id: string; client_id: string; client_package_id: string | null;
    appointment_date: string; start_time: string; duration_minutes: number;
  }[];

  if (!Array.isArray(orphans) || orphans.length === 0) {
    res.json({ seriesCreated: 0, occurrencesCreated: 0, message: "No orphan recurring appointments found." });
    return;
  }

  // Group by trainer_id + client_id + start_time (each unique combo = one recurring series)
  const groups = new Map<string, typeof orphans>();
  for (const appt of orphans) {
    const groupKey = `${appt.trainer_id}__${appt.client_id}__${appt.start_time}`;
    const g = groups.get(groupKey) ?? [];
    g.push(appt);
    groups.set(groupKey, g);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  let seriesCreated = 0;
  let occurrencesCreated = 0;

  for (const appts of groups.values()) {
    const { trainer_id, client_id, client_package_id, start_time, duration_minutes } = appts[0];

    // Infer days of week from existing appointment dates
    const daysOfWeek = [...new Set(appts.map((a) => new Date(a.appointment_date + "T12:00:00").getDay()))];

    // Create the recurring_series record
    const seriesCreateRes = await fetch(`${url}/rest/v1/recurring_series`, {
      method: "POST",
      headers: { ...hdrs, Prefer: "return=representation" },
      body: JSON.stringify({ trainer_id, client_id, client_package_id, days_of_week: daysOfWeek, start_time, duration_minutes }),
    });
    if (!seriesCreateRes.ok) continue;
    const [series] = (await seriesCreateRes.json()) as { id: string }[];
    if (!series?.id) continue;

    // Stamp all orphan appointments in this group with the new series ID
    await fetch(
      `${url}/rest/v1/appointments?trainer_id=eq.${trainer_id}&client_id=eq.${client_id}&start_time=eq.${start_time}&is_recurring=eq.true&recurring_series_id=is.null`,
      { method: "PATCH", headers: { ...hdrs, Prefer: "return=minimal" }, body: JSON.stringify({ recurring_series_id: series.id }) },
    );

    seriesCreated++;

    // Fetch already-existing appointments for this slot on or after today (avoid duplicates)
    const existingRes = await fetch(
      `${url}/rest/v1/appointments?trainer_id=eq.${trainer_id}&client_id=eq.${client_id}&start_time=eq.${start_time}&appointment_date=gte.${todayStr}&select=appointment_date`,
      { headers: hdrs },
    );
    const existingList = (await existingRes.json()) as { appointment_date: string }[];
    const existingDates = new Set(existingList.map((a) => a.appointment_date));

    // Generate 52 weeks of future occurrences for each day of week in this series
    const end_time = localAddMinutes(start_time, duration_minutes);
    const newAppts: object[] = [];

    for (let week = 0; week < 52; week++) {
      for (const dow of daysOfWeek) {
        const d = new Date(today);
        d.setDate(d.getDate() + week * 7 + ((dow - today.getDay() + 7) % 7));
        if (d < today) continue;
        const dateStr = d.toISOString().split("T")[0];
        if (existingDates.has(dateStr)) continue;
        existingDates.add(dateStr); // prevent within-run duplication

        newAppts.push({
          trainer_id, client_id, client_package_id,
          appointment_date: dateStr, start_time, end_time, duration_minutes,
          status: "scheduled", session_type: "training",
          session_deducted: false, is_recurring: true,
          recurring_days: daysOfWeek, recurring_series_id: series.id,
        });
      }
    }

    for (let i = 0; i < newAppts.length; i += 100) {
      const batch = newAppts.slice(i, i + 100);
      const r = await fetch(`${url}/rest/v1/appointments`, {
        method: "POST",
        headers: { ...hdrs, Prefer: "return=minimal" },
        body: JSON.stringify(batch),
      });
      if (r.ok) occurrencesCreated += batch.length;
    }
  }

  res.json({ seriesCreated, occurrencesCreated });
});

export default adminRouter;
