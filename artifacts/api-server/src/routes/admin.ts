import { Router } from "express";
import type { Request, Response } from "express";

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

export default adminRouter;
