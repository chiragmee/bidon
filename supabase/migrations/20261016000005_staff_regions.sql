-- Operations staff levels and regions (D-102). Existing Operations staff keep full access as admins; reviewers
-- appointed from now on cover only their regions. Regions match packages/domain/src/regions.ts.

alter table profiles add column staff_level text check (staff_level in ('admin', 'reviewer', 'removed'));
alter table profiles add column regions text[] not null default '{}'
  check (regions <@ array['north', 'west', 'central', 'south', 'north_east']::text[]);

update profiles set staff_level = 'admin' where role = 'ops';
