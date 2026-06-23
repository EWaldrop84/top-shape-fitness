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
  price_paid_cents?: number | null;
  duration_minutes?: number | null;
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
  client_id: string;
  trainer_id: string;
  client_package_id: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: "scheduled" | "completed" | "cancelled" | "no_show" | "forfeited";
  session_type: "training" | "consultation";
  session_deducted: boolean;
  cancellation_within_24hr: boolean;
  forfeiture_waived: boolean;
  cancelled_at: string | null;
  notes: string | null;
  is_recurring: boolean;
  recurring_days: number[] | null;
  recurring_series_id: string | null;
  trainers?: {
    users?: {
      first_name: string | null;
      last_name: string | null;
    };
  };
}

export interface TimeBlock {
  id: string;
  trainer_id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: "time_off" | "personal" | "admin" | "other";
  notes: string | null;
  is_recurring: boolean;
  recurring_days: number[] | null;
  recurring_series_id: string | null;
  is_cancelled: boolean;
  created_by: string | null;
  created_at: string;
}

export interface RecurringSeries {
  id: string;
  trainer_id: string;
  client_id: string;
  client_package_id: string | null;
  days_of_week: number[];
  start_time: string;
  duration_minutes: number;
  is_active: boolean;
  created_at: string;
}

export interface ClientCustomPricing {
  id: string;
  client_id: string;
  package_name: string;
  session_count: number;
  custom_price_cents: number;
  is_active: boolean;
  created_at: string;
}

export interface Trainer {
  id: string;
  user_id: string;
  display_color: string | null;
  bio: string | null;
  is_active: boolean;
}

export interface TrainerWithName extends Trainer {
  first_name: string | null;
  last_name: string | null;
}

export interface TrainerAppointment {
  id: string;
  client_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: "scheduled" | "completed" | "cancelled" | "no_show" | "forfeited";
  notes: string | null;
  is_recurring: boolean;
  recurring_series_id: string | null;
  clientName?: string;
}

export interface PayrollSession {
  id: string;
  appointment_id: string;
  trainer_id: string;
  session_date: string;
  duration_minutes: number;
  hours: number;
  pay_period_start: string;
  pay_period_end: string;
  color_code: "tomato" | "charcoal" | null;
  notes: string | null;
  clientName?: string;
}

export interface AvailabilityBlock {
  id: string;
  trainer_id: string;
  day_of_week: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  specific_date: string | null;
  is_active: boolean;
}
