-- Migration 002: RLS policies so admins can read all user profiles
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Without this policy, the admin dashboard cannot join or query user profiles
-- for clients/trainers other than the currently logged-in admin.

-- Allow admins to read every row in public.users
create policy "Admin can read all users"
  on public.users
  for select
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow admins to update any row in public.users (needed for editing client profiles)
create policy "Admin can update all users"
  on public.users
  for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow admins to read all client records
create policy "Admin can read all clients"
  on public.clients
  for select
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow admins to update all client records
create policy "Admin can update all clients"
  on public.clients
  for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow admins to insert client records (for new client creation)
create policy "Admin can insert clients"
  on public.clients
  for insert
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow admins to read all client_packages
create policy "Admin can read all client_packages"
  on public.client_packages
  for select
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow admins to insert and update client_packages
create policy "Admin can insert client_packages"
  on public.client_packages
  for insert
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can update client_packages"
  on public.client_packages
  for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow admins to read all packages
create policy "Admin can read all packages"
  on public.packages
  for select
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow admins to insert and update packages
create policy "Admin can insert packages"
  on public.packages
  for insert
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admin can update packages"
  on public.packages
  for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );
