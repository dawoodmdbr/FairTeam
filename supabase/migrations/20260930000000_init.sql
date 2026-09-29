-- Supabase Migration: Initial Schema for Fair Team Matcher

create type session_mode as enum ('friend', 'class');
create type session_status as enum ('draft', 'open', 'revealed', 'locked', 'expired');

create table sessions (
  id uuid primary key default gen_random_uuid(),
  mode session_mode not null,
  team_size int not null check (team_size >= 2),
  status session_status not null default 'draft',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create table campus_domains (
  letter char(1) primary key,
  domain text not null unique
);

insert into campus_domains (letter, domain) values
  ('F', 'cfd.nu.edu.pk'),
  ('L', 'lhr.nu.edu.pk'),
  ('I', 'isb.nu.edu.pk')
on conflict (letter) do nothing;

create table participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text,                -- Friend Mode
  roll_number text,         -- Class Mode, format '24F-3053'
  has_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint one_identifier check (
    (name is not null and roll_number is null) or
    (name is null and roll_number is not null)
  ),
  unique (session_id, roll_number)
);

create table question_definitions (
  id uuid primary key default gen_random_uuid(),
  mode session_mode not null,
  text text not null,
  type text not null check (type in ('scale', 'single_choice', 'multi_select')),
  options jsonb,             -- e.g. ["0-5","5-10","10-15","15+"] or scale bounds
  sort_order int not null
);

create table question_responses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  question_id uuid not null references question_definitions(id),
  value jsonb not null,
  unique (participant_id, question_id)
);

create table ranking_responses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  ranked_participant_id uuid not null references participants(id) on delete cascade,
  position int not null check (position between 1 and 5),
  unique (participant_id, ranked_participant_id),
  constraint no_self_rank check (participant_id <> ranked_participant_id)
);

create table avoid_responses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  avoided_participant_id uuid not null references participants(id) on delete cascade,
  unique (participant_id, avoided_participant_id),
  constraint no_self_avoid check (participant_id <> avoided_participant_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  team_number int not null,
  fairness_score numeric not null,
  score_breakdown jsonb not null
);

create table team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  unique (participant_id)   -- a participant belongs to exactly one team per session
);

create table alternative_groupings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  rank int not null check (rank in (2, 3)),
  fairness_score numeric not null,
  teams_summary jsonb not null
);

create table rate_limit_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,   -- IP address or roll number
  endpoint text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists rate_limit_lookup on rate_limit_attempts (identifier, endpoint, attempted_at);

-- Row-Level Security (RLS)
alter table ranking_responses enable row level security;
alter table avoid_responses enable row level security;
-- No client role (anon/authenticated) may SELECT these directly.
-- Only the service-role key, used inside Edge Functions, may read them.
create policy "no client read" on ranking_responses for select using (false);
create policy "no client read" on avoid_responses for select using (false);

alter table question_responses enable row level security;
create policy "organizer reads all in own sessions" on question_responses
  for select using (
    exists (
      select 1 from participants p join sessions s on s.id = p.session_id
      where p.id = question_responses.participant_id
        and s.created_by = auth.uid()
    )
  );

alter table sessions enable row level security;
create policy "organizer full access to own sessions" on sessions
  for all using (auth.uid() = created_by);
create policy "anyone can read open or revealed sessions by id" on sessions
  for select using (true);

alter table participants enable row level security;
create policy "organizer full access to participants in own sessions" on participants
  for all using (
    exists (select 1 from sessions s where s.id = participants.session_id and s.created_by = auth.uid())
  );
create policy "participants readable for session participants" on participants
  for select using (true);

alter table campus_domains enable row level security;
create policy "campus domains public read" on campus_domains
  for select using (true);

alter table question_definitions enable row level security;
create policy "question definitions public read" on question_definitions
  for select using (true);

alter table teams enable row level security;
create policy "organizer reads own session teams" on teams
  for select using (
    exists (select 1 from sessions s where s.id = teams.session_id and s.created_by = auth.uid())
  );
create policy "participant reads own team (friend mode)" on teams
  for select using (
    exists (
      select 1 from team_memberships tm
      join participants p on p.id = tm.participant_id
      join sessions s on s.id = teams.session_id
      where tm.team_id = teams.id
        and s.mode = 'friend'
        and s.status in ('revealed','locked')
    )
  );

alter table team_memberships enable row level security;
create policy "team memberships readable by session owner or member" on team_memberships
  for select using (true);

alter table alternative_groupings enable row level security;
create policy "organizer reads alternatives for own session" on alternative_groupings
  for select using (
    exists (select 1 from sessions s where s.id = alternative_groupings.session_id and s.created_by = auth.uid())
  );

alter table rate_limit_attempts enable row level security;
create policy "service role access only for rate limit attempts" on rate_limit_attempts
  for all using (false);

-- Seed Data for question_definitions
insert into question_definitions (mode, text, type, options, sort_order) values
  ('friend', 'Weekly hours available for the project', 'single_choice', '["0-5","5-10","10-15","15+"]'::jsonb, 1),
  ('friend', 'Work rhythm: early starter vs. last-minute pusher', 'scale', '{"min":1,"max":5}'::jsonb, 2),
  ('friend', 'Most active hours', 'single_choice', '["Morning","Afternoon","Evening","Night"]'::jsonb, 3),
  ('friend', 'Communication style: calls/meetings vs. async text', 'scale', '{"min":1,"max":5}'::jsonb, 4),
  ('friend', 'Planning style: detailed task boards vs. figure-it-out-as-you-go', 'scale', '{"min":1,"max":5}'::jsonb, 5),
  ('friend', 'Conflict handling: speaks up immediately vs. avoids confrontation', 'scale', '{"min":1,"max":5}'::jsonb, 6),
  ('friend', 'Preferred role(s)', 'multi_select', '["Frontend","Backend","Design","Docs","Testing","Management"]'::jsonb, 7),
  ('friend', 'Topic interest', 'multi_select', '["Web","Mobile","AI","ERP","Other"]'::jsonb, 8),
  ('class', 'Weekly hours available for coursework project', 'single_choice', '["0-5","5-10","10-15","15+"]'::jsonb, 1),
  ('class', 'Prefers coding vs. testing vs. documentation', 'multi_select', '["Coding","Testing","Documentation"]'::jsonb, 2),
  ('class', 'Prefers leading vs. following in a group', 'scale', '{"min":1,"max":5}'::jsonb, 3),
  ('class', 'Comfort level in this course''s subject area', 'scale', '{"min":1,"max":5}'::jsonb, 4),
  ('class', 'Preferred meeting style', 'single_choice', '["In-person","Online"]'::jsonb, 5),
  ('class', 'Work rhythm: early starter vs. last-minute pusher', 'scale', '{"min":1,"max":5}'::jsonb, 6);
