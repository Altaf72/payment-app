-- Dedicated Owner Will Pay flag for payment applications.
-- Run once in the Supabase SQL Editor.

alter table public.applications
  add column if not exists owner_will_pay boolean not null default false;

-- Preserve records created before this dedicated field existed. The old text
-- marker becomes a checkbox value and is removed from the remarks text.
update public.applications
set owner_will_pay = true,
    remarks = nullif(regexp_replace(remarks, '\s*\|?\s*Owner Will Pay\s*$', '', 'i'), '')
where owner_will_pay = false
  and remarks ~* 'Owner Will Pay\s*$';
