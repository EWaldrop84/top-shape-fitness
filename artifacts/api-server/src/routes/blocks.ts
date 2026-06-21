import { Router } from "express";
import type { Request, Response } from "express";

const blocksRouter = Router();

function svcHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function verifyToken(supabaseUrl: string, key: string, token: string): Promise<{ id: string } | null> {
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json() as Promise<{ id: string }>;
}

async function getUserRole(url: string, key: string, userId: string): Promise<string | null> {
  const r = await fetch(`${url}/rest/v1/users?id=eq.${userId}&select=role&limit=1`, {
    headers: svcHeaders(key),
  });
  const [u] = (await r.json()) as { role: string }[];
  return u?.role ?? null;
}

async function getTrainerId(url: string, key: string, userId: string): Promise<string | null> {
  const r = await fetch(`${url}/rest/v1/trainers?user_id=eq.${userId}&select=id&limit=1`, {
    headers: svcHeaders(key),
  });
  const [t] = (await r.json()) as { id: string }[];
  return t?.id ?? null;
}

// Resolve the effective trainer_id for this request based on caller role
async function resolveTrainerId(
  url: string, key: string, callerId: string, requestedTrainerId?: string
): Promise<{ trainerId: string; role: string } | { error: string }> {
  const [role, trainerIdForUser] = await Promise.all([
    getUserRole(url, key, callerId),
    getTrainerId(url, key, callerId),
  ]);

  if (role === "admin") {
    return { trainerId: requestedTrainerId ?? trainerIdForUser ?? "", role };
  }
  if (role === "trainer") {
    if (!trainerIdForUser) return { error: "Trainer record not found." };
    return { trainerId: trainerIdForUser, role };
  }
  return { error: "Insufficient permissions." };
}

const VALID_REASONS = ["time_off", "personal", "admin", "other"];

// ── POST /api/blocks/create ──────────────────────────────────────────────────
blocksRouter.post("/blocks/create", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caller = await verifyToken(url, key, token);
  if (!caller) { res.status(401).json({ error: "Invalid session." }); return; }

  const { trainer_id, date, start_time, end_time, reason = "time_off", notes } = req.body as {
    trainer_id?: string; date: string; start_time: string; end_time: string;
    reason?: string; notes?: string;
  };

  if (!date || !start_time || !end_time) {
    res.status(400).json({ error: "date, start_time, and end_time are required." }); return;
  }
  if (!VALID_REASONS.includes(reason)) {
    res.status(400).json({ error: "Invalid reason." }); return;
  }

  const resolved = await resolveTrainerId(url, key, caller.id, trainer_id);
  if ("error" in resolved) { res.status(403).json({ error: resolved.error }); return; }

  const insertRes = await fetch(`${url}/rest/v1/time_blocks`, {
    method: "POST",
    headers: { ...svcHeaders(key), Prefer: "return=representation" },
    body: JSON.stringify({
      trainer_id: resolved.trainerId, date, start_time, end_time, reason,
      notes: notes ?? null, is_recurring: false, created_by: caller.id,
    }),
  });

  if (!insertRes.ok) {
    const err = (await insertRes.json()) as { message?: string };
    res.status(500).json({ error: err.message ?? "Failed to create block." }); return;
  }

  const [block] = (await insertRes.json()) as { id: string }[];
  res.status(201).json({ block });
});

// ── POST /api/blocks/create-recurring ───────────────────────────────────────
blocksRouter.post("/blocks/create-recurring", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caller = await verifyToken(url, key, token);
  if (!caller) { res.status(401).json({ error: "Invalid session." }); return; }

  const { trainer_id, start_time, end_time, reason = "time_off", notes, recurring_days } = req.body as {
    trainer_id?: string; start_time: string; end_time: string;
    reason?: string; notes?: string; recurring_days: number[];
  };

  if (!start_time || !end_time || !recurring_days?.length) {
    res.status(400).json({ error: "start_time, end_time, and recurring_days are required." }); return;
  }
  if (!VALID_REASONS.includes(reason)) {
    res.status(400).json({ error: "Invalid reason." }); return;
  }

  const resolved = await resolveTrainerId(url, key, caller.id, trainer_id);
  if ("error" in resolved) { res.status(403).json({ error: resolved.error }); return; }

  const hdrs = svcHeaders(key);

  // Create the series record
  const seriesRes = await fetch(`${url}/rest/v1/time_block_series`, {
    method: "POST",
    headers: { ...hdrs, Prefer: "return=representation" },
    body: JSON.stringify({
      trainer_id: resolved.trainerId, days_of_week: recurring_days,
      start_time, end_time, reason, notes: notes ?? null, created_by: caller.id,
    }),
  });
  if (!seriesRes.ok) {
    const err = (await seriesRes.json()) as { message?: string };
    res.status(500).json({ error: err.message ?? "Failed to create series." }); return;
  }
  const [series] = (await seriesRes.json()) as { id: string }[];

  // Generate 52 weeks of block instances
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const blocks: object[] = [];

  for (let week = 0; week < 52; week++) {
    for (const dayOfWeek of recurring_days) {
      const d = new Date(today);
      const offset = (dayOfWeek - today.getDay() + 7) % 7;
      d.setDate(d.getDate() + week * 7 + offset);
      if (d < today) continue;
      const dateStr = d.toISOString().split("T")[0];
      blocks.push({
        trainer_id: resolved.trainerId, date: dateStr, start_time, end_time, reason,
        notes: notes ?? null, is_recurring: true, recurring_days,
        recurring_series_id: series.id, created_by: caller.id,
      });
    }
  }

  let created = 0;
  for (let i = 0; i < blocks.length; i += 100) {
    const batch = blocks.slice(i, i + 100);
    const r = await fetch(`${url}/rest/v1/time_blocks`, {
      method: "POST",
      headers: { ...hdrs, Prefer: "return=minimal" },
      body: JSON.stringify(batch),
    });
    if (r.ok) created += batch.length;
  }

  res.status(201).json({ series: { id: series.id }, created });
});

// ── POST /api/blocks/stop-recurring ─────────────────────────────────────────
blocksRouter.post("/blocks/stop-recurring", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caller = await verifyToken(url, key, token);
  if (!caller) { res.status(401).json({ error: "Invalid session." }); return; }

  const { series_id } = req.body as { series_id: string };
  if (!series_id) { res.status(400).json({ error: "series_id required." }); return; }

  const hdrs = svcHeaders(key);

  // Fetch series to verify ownership
  const seriesRes = await fetch(`${url}/rest/v1/time_block_series?id=eq.${series_id}&select=trainer_id&limit=1`, {
    headers: hdrs,
  });
  const [series] = (await seriesRes.json()) as { trainer_id: string }[];
  if (!series) { res.status(404).json({ error: "Series not found." }); return; }

  const resolved = await resolveTrainerId(url, key, caller.id, series.trainer_id);
  if ("error" in resolved) { res.status(403).json({ error: resolved.error }); return; }
  // Trainers can only stop their own series
  if (resolved.role === "trainer" && series.trainer_id !== resolved.trainerId) {
    res.status(403).json({ error: "Cannot modify another trainer's blocks." }); return;
  }

  const today = new Date().toISOString().split("T")[0];

  await Promise.all([
    fetch(`${url}/rest/v1/time_block_series?id=eq.${series_id}`, {
      method: "PATCH",
      headers: { ...hdrs, Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false }),
    }),
    fetch(`${url}/rest/v1/time_blocks?recurring_series_id=eq.${series_id}&date=gte.${today}&is_cancelled=eq.false`, {
      method: "PATCH",
      headers: { ...hdrs, Prefer: "return=minimal" },
      body: JSON.stringify({ is_cancelled: true }),
    }),
  ]);

  res.json({ ok: true });
});

// ── DELETE /api/blocks/:id ───────────────────────────────────────────────────
blocksRouter.delete("/blocks/:id", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.slice(7);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!token || !key || !url) { res.status(401).json({ error: "Unauthorized" }); return; }

  const caller = await verifyToken(url, key, token);
  if (!caller) { res.status(401).json({ error: "Invalid session." }); return; }

  const blockId = req.params.id;

  // Fetch the block to check ownership
  const blockRes = await fetch(`${url}/rest/v1/time_blocks?id=eq.${blockId}&select=id,trainer_id&limit=1`, {
    headers: svcHeaders(key),
  });
  const [block] = (await blockRes.json()) as { id: string; trainer_id: string }[];
  if (!block) { res.status(404).json({ error: "Block not found." }); return; }

  const [role, trainerIdForUser] = await Promise.all([
    getUserRole(url, key, caller.id),
    getTrainerId(url, key, caller.id),
  ]);

  if (role === "trainer" && block.trainer_id !== trainerIdForUser) {
    res.status(403).json({ error: "Cannot delete another trainer's blocks." }); return;
  }

  await fetch(`${url}/rest/v1/time_blocks?id=eq.${blockId}`, {
    method: "PATCH",
    headers: { ...svcHeaders(key), Prefer: "return=minimal" },
    body: JSON.stringify({ is_cancelled: true }),
  });

  res.json({ ok: true });
});

export default blocksRouter;
