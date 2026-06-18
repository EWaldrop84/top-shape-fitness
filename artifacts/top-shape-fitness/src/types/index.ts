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
