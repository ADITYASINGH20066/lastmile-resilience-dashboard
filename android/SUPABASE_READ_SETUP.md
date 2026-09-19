# Android Supabase data access

The Android app uses the Supabase URL and anon key from `android/local.properties`.
It must never contain the Supabase service-role key.

If the app reports `anon key can see no rows` while the Supabase dashboard contains data,
enable read policies for the tables used by the role workspaces. Run this in the Supabase
SQL editor, then refresh the Android app:

```sql
alter table public.hydro_stations enable row level security;
alter table public.hydro_readings enable row level security;
alter table public.alerts enable row level security;
alter table public.rule_evaluations enable row level security;

create policy "public read hydro stations"
on public.hydro_stations for select to anon using (true);

create policy "public read hydro readings"
on public.hydro_readings for select to anon using (true);

create policy "public read alerts"
on public.alerts for select to anon using (true);

create policy "public read rule evaluations"
on public.rule_evaluations for select to anon using (true);
```

If a policy with the same name already exists, keep the existing policy or choose a new
unique name. These are read-only policies; Android still cannot insert, update, or delete
Supabase records.