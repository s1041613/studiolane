-- Local demo data. Every name, handle and price here is invented.
-- Rental dates are relative to the day of `supabase db reset`, so the
-- pages always have something near today to show.

insert into pricing_plans (id, role, applies_to, room_a_rate, room_b_rate) values
  ('00000000-0000-4000-8000-000000000101', 'customer', '一般客人', 600, 400),
  ('00000000-0000-4000-8000-000000000102', 'teacher', '駐館老師', 300, 200),
  ('00000000-0000-4000-8000-000000000103', 'staff', '工作人員', 0, 0),
  ('00000000-0000-4000-8000-000000000104', 'teacher', '週末老師', 400, 300);

insert into purpose_settings (purpose, allowed_roles) values
  ('dance', '{teacher,staff,customer}'),
  ('aerobics', '{teacher,staff,customer}'),
  ('yoga', '{teacher,staff,customer}'),
  ('performance', '{teacher}'),
  ('workshop', '{teacher}'),
  ('private_lesson', '{teacher}'),
  ('front_desk', '{staff}'),
  ('photography', '{staff,customer}');

insert into purpose_role_pricing (purpose, role, mode, rate_a, rate_b, pay_percent) values
  ('performance', 'teacher', 'price', 100, 100, null),
  ('workshop', 'teacher', 'discount', null, null, 50),
  ('photography', 'customer', 'price', 800, 500, null);

insert into roster (id, name, role, pricing_plan_id, instagram) values
  ('00000000-0000-4000-8000-000000000201', '林小雨', 'teacher', '00000000-0000-4000-8000-000000000102', 'xiaoyu.demo'),
  ('00000000-0000-4000-8000-000000000202', '陳大樹', 'teacher', '00000000-0000-4000-8000-000000000104', 'bigtree_demo'),
  ('00000000-0000-4000-8000-000000000203', '王小草', 'staff', '00000000-0000-4000-8000-000000000103', null),
  ('00000000-0000-4000-8000-000000000204', '張雲朵', 'teacher', '00000000-0000-4000-8000-000000000102', 'cloud.demo');

insert into roster (name, role, pricing_plan_id, instagram, archived_at) values
  ('李星星', 'teacher', '00000000-0000-4000-8000-000000000102', 'star_demo', now() - interval '30 days');

insert into rental_rules (room, weekday, start_time, end_time, reason, kind) values
  ('BOTH', 1, '19:00', '22:00', '上課時段', 'class_hours'),
  ('A', 3, '19:00', '21:00', '上課時段', 'class_hours'),
  ('B', 6, '10:00', '12:00', '場地保養', 'rental');

insert into rental_rules (room, weekday, start_time, end_time, reason, on_date, effect) values
  ('A', extract(isodow from current_date + 7)::integer, '09:00', '12:00', '特別開放', current_date + 7, 'open');

-- Times are Asia/Taipei wall-clock times.
insert into rentals
  (room, renter_type, renter_id, renter_name, purpose, starts_at, ends_at, status, payment_state, payment_method, amount, handler, note)
values
  ('A', 'roster', '00000000-0000-4000-8000-000000000201', '林小雨', 'dance',
    ((current_date + 1) + time '18:00') at time zone 'Asia/Taipei',
    ((current_date + 1) + time '20:00') at time zone 'Asia/Taipei',
    'registered', 'paid', 'transfer', 600, '王小草', ''),
  ('B', 'roster', '00000000-0000-4000-8000-000000000202', '陳大樹', 'private_lesson',
    ((current_date + 2) + time '14:00') at time zone 'Asia/Taipei',
    ((current_date + 2) + time '15:00') at time zone 'Asia/Taipei',
    'awaiting_payment', 'unpaid', 'on_site', 300, '王小草', ''),
  ('A', 'customer', null, '周小貓', 'yoga',
    ((current_date + 3) + time '10:00') at time zone 'Asia/Taipei',
    ((current_date + 3) + time '12:00') at time zone 'Asia/Taipei',
    'pending', 'unpaid', 'on_site', 1200, null, '想借瑜珈墊'),
  ('B', 'customer', null, '吳小狗', 'photography',
    ((current_date + 3) + time '10:30') at time zone 'Asia/Taipei',
    ((current_date + 3) + time '11:30') at time zone 'Asia/Taipei',
    'pending', 'unpaid', 'transfer', 500, null, ''),
  ('A', 'roster', '00000000-0000-4000-8000-000000000203', '王小草', 'front_desk',
    ((current_date - 2) + time '13:00') at time zone 'Asia/Taipei',
    ((current_date - 2) + time '17:00') at time zone 'Asia/Taipei',
    'completed', 'not_required', null, 0, '王小草', ''),
  ('B', 'roster', '00000000-0000-4000-8000-000000000204', '張雲朵', 'workshop',
    ((current_date - 5) + time '19:00') at time zone 'Asia/Taipei',
    ((current_date - 5) + time '21:00') at time zone 'Asia/Taipei',
    'cancelled', 'unpaid', 'transfer', 200, '王小草', '老師改期');
