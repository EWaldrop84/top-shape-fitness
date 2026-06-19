export type UserRole = "admin" | "trainer" | "client";

export interface AppUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string;
  is_active: boolean;
}

export interface Package {
  id: string;
  name: string;
  session_count: number;
  duration_days: number;
  is_active: boolean;
}

export interface ClientPackage {
  id: string;
  package_id: string;
  owner_client_id: string;
  sessions_total: number;
  sessions_remaining: number;
  sessions_used: number;
  purchase_date: string | null;
  expiration_date: string | null;
  expiration_waived: boolean;
  is_active: boolean;
  is_shared: boolean;
  shared_with_client_id: string | null;
  packages?: Package;
}

export interface ClientWithRelations {
  id: string;
  user_id: string;
  notes: string | null;
  waiver_signed: boolean;
  waiver_date: string | null;
  created_by: string | null;
  users: AppUser | null;
  client_packages?: ClientPackage[];
}

export interface Appointment {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: "scheduled" | "completed" | "cancelled" | "no_show" | "forfeited";
  notes: string | null;
  trainers?: {
    users?: {
      first_name: string | null;
      last_name: string | null;
    };
  };
}
