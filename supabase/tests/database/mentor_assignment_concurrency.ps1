$ErrorActionPreference = "Stop"

$container = if ([string]::IsNullOrWhiteSpace($env:TASK2_ASSIGNMENT_CONCURRENCY_CONTAINER)) {
  "supabase_db_AlmaworksInternal"
} else {
  $env:TASK2_ASSIGNMENT_CONCURRENCY_CONTAINER
}
$docker = (Get-Command docker -ErrorAction Stop).Source
$semesterId = "b1000000-0000-0000-0000-000000000001"
$adminId = "b2000000-0000-0000-0000-000000000001"
$mentorId = "b2000000-0000-0000-0000-000000000011"
$duplicateMentorScheduleId = "b7000000-0000-0000-0000-000000000099"
$startupOneId = "b2000000-0000-0000-0000-000000000021"
$startupTwoId = "b2000000-0000-0000-0000-000000000022"
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) "almaworks-task2-assignment-concurrency"
$script:sqlCounter = 0

function Invoke-Psql {
  param([Parameter(Mandatory)][string]$Sql)

  $script:sqlCounter += 1
  $fileStem = "task2_sync_$($script:sqlCounter)"
  $localSql = Join-Path $testDirectory "$fileStem.sql"
  [IO.File]::WriteAllText($localSql, $Sql)
  & $docker cp $localSql "${container}:/tmp/$fileStem.sql" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to copy synchronous SQL into the local database container." }

  $output = & $docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atqf "/tmp/$fileStem.sql"
  if ($LASTEXITCODE -ne 0) { throw "Local psql command failed with exit code $LASTEXITCODE." }
  return ($output | Out-String).Trim()
}

function Wait-ForCondition {
  param(
    [Parameter(Mandatory)][scriptblock]$Condition,
    [Parameter(Mandatory)][string]$Description,
    [int]$TimeoutMilliseconds = 10000
  )

  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMilliseconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (& $Condition) { return }
    Start-Sleep -Milliseconds 50
  }
  throw "Timed out waiting for $Description."
}

function New-PsqlProcess {
  param(
    [Parameter(Mandatory)][string]$ApplicationName,
    [Parameter(Mandatory)][string]$Sql,
    [Parameter(Mandatory)][string]$FileStem
  )

  $localSql = Join-Path $testDirectory "$FileStem.sql"
  $stdout = Join-Path $testDirectory "$FileStem.stdout"
  $stderr = Join-Path $testDirectory "$FileStem.stderr"
  [IO.File]::WriteAllText($localSql, $Sql)
  & $docker cp $localSql "${container}:/tmp/$FileStem.sql" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to copy $FileStem SQL into the local database container." }

  return Start-Process -FilePath $docker -ArgumentList @(
    "exec", "-e", "PGAPPNAME=$ApplicationName", $container,
    "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "/tmp/$FileStem.sql"
  ) -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
}

function Assert-ProcessOutcome {
  param(
    [Parameter(Mandatory)][System.Diagnostics.Process]$Process,
    [Parameter(Mandatory)][string]$FileStem,
    [Parameter(Mandatory)][AllowEmptyString()][string]$ExpectedError
  )

  if (-not $Process.WaitForExit(10000)) { throw "$FileStem did not finish within 10 seconds." }
  $stdout = [IO.File]::ReadAllText((Join-Path $testDirectory "$FileStem.stdout"))
  $stderr = [IO.File]::ReadAllText((Join-Path $testDirectory "$FileStem.stderr"))
  if ($ExpectedError.Length -eq 0) {
    if (($stdout + $stderr) -match "ERROR:") { throw "$FileStem failed unexpectedly. stdout:$stdout stderr:$stderr" }
  } elseif (($stdout + $stderr) -notmatch [regex]::Escape($ExpectedError)) {
    throw "$FileStem did not fail with '$ExpectedError'. stdout:$stdout stderr:$stderr"
  }
}

if (-not (Test-Path -LiteralPath $testDirectory)) {
  New-Item -ItemType Directory -Path $testDirectory | Out-Null
}

$cleanupSql = @"
drop trigger if exists task2_assignment_sleep on public.sessions;
drop function if exists public.task2_assignment_sleep();
delete from public.mentor_assignment_audit where semester_id = '$semesterId';
delete from public.mentor_assignment_requests where semester_id = '$semesterId';
delete from public.sessions where semester_id = '$semesterId';
delete from public.availability where user_id in ('$mentorId');
delete from public.startup_team_memberships where semester_id = '$semesterId';
delete from public.mentor_semesters where semester_id = '$semesterId';
delete from public.mentor_profiles where profile_id = '$mentorId';
delete from public.startup_semesters where semester_id = '$semesterId';
delete from public.mentors where semester_id = '$semesterId';
delete from public.startups where semester_id = '$semesterId';
delete from public.session_dates where semester_id = '$semesterId';
delete from public.semester_memberships where semester_id = '$semesterId';
delete from public.startup_organizations where id in ('b5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000002');
delete from public.semesters where id = '$semesterId';
delete from auth.users where id in ('$adminId', '$mentorId', '$startupOneId', '$startupTwoId');
do `$body`$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.mentors'::regclass
      and conname = 'mentors_user_id_semester_id_key'
  ) then
    alter table public.mentors
      add constraint mentors_user_id_semester_id_key unique (user_id, semester_id);
  end if;
end;
`$body`$;
"@

$capacityA = $null
$capacityB = $null
$duplicateSlotA = $null
$duplicateSlotB = $null
$alternateA = $null
$alternateB = $null

try {
  Invoke-Psql -Sql $cleanupSql | Out-Null
  Invoke-Psql -Sql @"
insert into public.semesters (id, name, start_date, end_date, lifecycle_status)
values ('$semesterId', 'Task 2 assignment concurrency', '2027-01-01', '2027-06-30', 'active');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('$adminId', 'authenticated', 'authenticated', 'task2-admin@example.test', '{}', '{}'),
  ('$mentorId', 'authenticated', 'authenticated', 'task2-mentor@example.test', '{}', '{}'),
  ('$startupOneId', 'authenticated', 'authenticated', 'task2-startup-one@example.test', '{}', '{}'),
  ('$startupTwoId', 'authenticated', 'authenticated', 'task2-startup-two@example.test', '{}', '{}');
update public.profiles set role = case
  when id = '$adminId' then 'admin'::public.user_role
  when id = '$mentorId' then 'mentor'::public.user_role
  else 'startup'::public.user_role
end, status = 'approved'
where id in ('$adminId', '$mentorId', '$startupOneId', '$startupTwoId');
insert into public.semester_memberships (id, semester_id, profile_id, role, status)
values
  ('b3000000-0000-0000-0000-000000000001', '$semesterId', '$adminId', 'admin', 'active'),
  ('b3000000-0000-0000-0000-000000000011', '$semesterId', '$mentorId', 'mentor', 'active'),
  ('b3000000-0000-0000-0000-000000000021', '$semesterId', '$startupOneId', 'startup', 'active'),
  ('b3000000-0000-0000-0000-000000000022', '$semesterId', '$startupTwoId', 'startup', 'active');
insert into public.mentor_profiles (profile_id, expertise_tags) values ('$mentorId', array['Product strategy']);
insert into public.mentor_semesters (semester_id, semester_membership_id, capacity, readiness_status)
values ('$semesterId', 'b3000000-0000-0000-0000-000000000011', 1, 'ready');
insert into public.startup_organizations (id, name, slug) values
  ('b5000000-0000-0000-0000-000000000001', 'Task 2 startup one', 'task2-startup-one'),
  ('b5000000-0000-0000-0000-000000000002', 'Task 2 startup two', 'task2-startup-two');
insert into public.startup_semesters (id, semester_id, startup_organization_id, mentorship_needs, preferred_expertise_tags, readiness_status)
values
  ('b6000000-0000-0000-0000-000000000001', '$semesterId', 'b5000000-0000-0000-0000-000000000001', array['Product strategy'], array['Product strategy'], 'ready'),
  ('b6000000-0000-0000-0000-000000000002', '$semesterId', 'b5000000-0000-0000-0000-000000000002', array['Product strategy'], array['Product strategy'], 'ready');
insert into public.startup_team_memberships (semester_id, startup_semester_id, semester_membership_id, is_primary_contact)
values
  ('$semesterId', 'b6000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000021', true),
  ('$semesterId', 'b6000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000022', true);
alter table public.mentors drop constraint if exists mentors_user_id_semester_id_key;
insert into public.mentors (id, user_id, semester_id, full_name, expertise_tags, is_active)
values
  ('b7000000-0000-0000-0000-000000000011', '$mentorId', '$semesterId', 'Task 2 mentor', array['Product strategy'], true),
  ('$duplicateMentorScheduleId', '$mentorId', '$semesterId', 'Task 2 duplicate legacy mentor', array['Product strategy'], false);
insert into public.startups (id, user_id, semester_id, name, preferred_tags)
values
  ('b8000000-0000-0000-0000-000000000001', '$startupOneId', '$semesterId', 'Task 2 startup one', array['Product strategy']),
  ('b8000000-0000-0000-0000-000000000002', '$startupTwoId', '$semesterId', 'Task 2 startup two', array['Product strategy']);
insert into public.session_dates (id, semester_id, date, label)
values
  ('b9000000-0000-0000-0000-000000000001', '$semesterId', '2027-01-08', 'Week 1'),
  ('b9000000-0000-0000-0000-000000000002', '$semesterId', '2027-01-15', 'Week 2');
create function public.task2_assignment_sleep() returns trigger language plpgsql as `$body`$
begin
  if current_setting('application_name') in ('task2_duplicate_slot_a', 'task2_alternate_a') then
    new.mentor_id := '$duplicateMentorScheduleId';
  end if;
  perform pg_catalog.pg_sleep(3);
  return new;
end;
`$body`$;
create trigger task2_assignment_sleep before insert on public.sessions
for each row execute function public.task2_assignment_sleep();
"@ | Out-Null

  $capacityA = New-PsqlProcess -ApplicationName "task2_capacity_a" -FileStem "task2_capacity_a" -Sql @"
set role authenticated;
select set_config('request.jwt.claim.sub', '$adminId', false);
select public.commit_mentor_assignment('$semesterId', 'b9000000-0000-0000-0000-000000000001', '3:30-4:15', 'b6000000-0000-0000-0000-000000000001', '$mentorId', 'capacity-a');
"@
  Wait-ForCondition -Description "capacity assignment A to reach the post-check session trigger" -Condition {
    (Invoke-Psql -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = 'task2_capacity_a' and wait_event = 'PgSleep'") -eq "1"
  }
  $capacityB = New-PsqlProcess -ApplicationName "task2_capacity_b" -FileStem "task2_capacity_b" -Sql @"
set role authenticated;
select set_config('request.jwt.claim.sub', '$adminId', false);
select public.commit_mentor_assignment('$semesterId', 'b9000000-0000-0000-0000-000000000002', '3:30-4:15', 'b6000000-0000-0000-0000-000000000002', '$mentorId', 'capacity-b');
"@
  Wait-ForCondition -Description "capacity assignment B to wait for the mentor-capacity lock" -Condition {
    (Invoke-Psql -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = 'task2_capacity_b' and wait_event_type = 'Lock'") -eq "1"
  }
  Assert-ProcessOutcome -Process $capacityA -FileStem "task2_capacity_a" -ExpectedError ""
  Assert-ProcessOutcome -Process $capacityB -FileStem "task2_capacity_b" -ExpectedError "Mentor capacity has been reached"

  Invoke-Psql -Sql @"
delete from public.mentor_assignment_audit where semester_id = '$semesterId';
delete from public.mentor_assignment_requests where semester_id = '$semesterId';
delete from public.sessions where semester_id = '$semesterId';
update public.mentor_semesters set capacity = 4 where semester_id = '$semesterId';
"@ | Out-Null

  $duplicateSlotA = New-PsqlProcess -ApplicationName "task2_duplicate_slot_a" -FileStem "task2_duplicate_slot_a" -Sql @"
set role authenticated;
select set_config('request.jwt.claim.sub', '$adminId', false);
select public.commit_mentor_assignment('$semesterId', 'b9000000-0000-0000-0000-000000000001', '3:30-4:15', 'b6000000-0000-0000-0000-000000000001', '$mentorId', 'duplicate-slot-a');
"@
  Wait-ForCondition -Description "duplicate-profile slot assignment A to reach the post-check session trigger" -Condition {
    (Invoke-Psql -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = 'task2_duplicate_slot_a' and wait_event = 'PgSleep'") -eq "1"
  }
  $duplicateSlotB = New-PsqlProcess -ApplicationName "task2_duplicate_slot_b" -FileStem "task2_duplicate_slot_b" -Sql @"
set role authenticated;
select set_config('request.jwt.claim.sub', '$adminId', false);
select public.commit_mentor_assignment('$semesterId', 'b9000000-0000-0000-0000-000000000001', '3:30-4:15', 'b6000000-0000-0000-0000-000000000002', '$mentorId', 'duplicate-slot-b');
"@
  Wait-ForCondition -Description "duplicate-profile slot assignment B to wait for the profile lock" -Condition {
    (Invoke-Psql -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = 'task2_duplicate_slot_b' and wait_event_type = 'Lock'") -eq "1"
  }
  Assert-ProcessOutcome -Process $duplicateSlotA -FileStem "task2_duplicate_slot_a" -ExpectedError ""
  Assert-ProcessOutcome -Process $duplicateSlotB -FileStem "task2_duplicate_slot_b" -ExpectedError "Mentor is already assigned in this slot"

  Invoke-Psql -Sql @"
delete from public.mentor_assignment_audit where semester_id = '$semesterId';
delete from public.mentor_assignment_requests where semester_id = '$semesterId';
delete from public.sessions where semester_id = '$semesterId';
"@ | Out-Null

  $alternateA = New-PsqlProcess -ApplicationName "task2_alternate_a" -FileStem "task2_alternate_a" -Sql @"
set role authenticated;
select set_config('request.jwt.claim.sub', '$adminId', false);
select public.commit_mentor_assignment('$semesterId', 'b9000000-0000-0000-0000-000000000001', '3:30-4:15', 'b6000000-0000-0000-0000-000000000001', '$mentorId', 'alternate-a');
"@
  Wait-ForCondition -Description "alternate-slot assignment A to reach the post-check session trigger" -Condition {
    (Invoke-Psql -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = 'task2_alternate_a' and wait_event = 'PgSleep'") -eq "1"
  }
  $alternateB = New-PsqlProcess -ApplicationName "task2_alternate_b" -FileStem "task2_alternate_b" -Sql @"
set role authenticated;
select set_config('request.jwt.claim.sub', '$adminId', false);
select public.commit_mentor_assignment('$semesterId', 'b9000000-0000-0000-0000-000000000001', '4:15-5:00', 'b6000000-0000-0000-0000-000000000001', '$mentorId', 'alternate-b');
"@
  Wait-ForCondition -Description "alternate-slot assignment B to wait for the mentor/startup/date lock" -Condition {
    (Invoke-Psql -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = 'task2_alternate_b' and wait_event_type = 'Lock'") -eq "1"
  }
  Assert-ProcessOutcome -Process $alternateA -FileStem "task2_alternate_a" -ExpectedError ""
  Assert-ProcessOutcome -Process $alternateB -FileStem "task2_alternate_b" -ExpectedError "Second slot must use a different mentor unless overridden"

  $finalState = Invoke-Psql -Sql "select count(*) from public.sessions where semester_id = '$semesterId'"
  if ($finalState -ne "1") { throw "Unsafe alternate-slot final state: $finalState sessions (expected 1)." }
  Write-Output "PASS: capacity, duplicate-profile mentor-slot, and duplicate-profile alternate-slot races serialize; one competing call is rejected in each case."
} finally {
  try {
    Invoke-Psql -Sql "select pg_terminate_backend(pid) from pg_catalog.pg_stat_activity where application_name in ('task2_capacity_a','task2_capacity_b','task2_duplicate_slot_a','task2_duplicate_slot_b','task2_alternate_a','task2_alternate_b') and pid <> pg_backend_pid()" | Out-Null
  } catch { }
  foreach ($process in @($capacityA, $capacityB, $duplicateSlotA, $duplicateSlotB, $alternateA, $alternateB)) {
    if ($null -ne $process -and -not $process.HasExited) { $process.WaitForExit(3000) | Out-Null }
  }
  try { Invoke-Psql -Sql $cleanupSql | Out-Null } catch { }
}
