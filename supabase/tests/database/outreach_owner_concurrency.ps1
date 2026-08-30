$ErrorActionPreference = "Stop"

$container = "supabase_db_AlmaworksInternal"
$docker = (Get-Command docker -ErrorAction Stop).Source
$semesterId = "91000000-0000-0000-0000-000000000001"
$actorId = "92000000-0000-0000-0000-000000000001"
$ownerId = "92000000-0000-0000-0000-000000000002"
$assignedOpportunityId = "95000000-0000-0000-0000-000000000001"
$racingOpportunityId = "95000000-0000-0000-0000-000000000002"
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) "almaworks-task7-concurrency"
$script:sqlCounter = 0

function Invoke-Psql {
  param([Parameter(Mandatory)][string]$Sql)

  $script:sqlCounter += 1
  $fileStem = "task7_sync_$($script:sqlCounter)"
  $localSql = Join-Path $testDirectory "$fileStem.sql"
  [IO.File]::WriteAllText($localSql, $Sql)
  & $docker cp $localSql "${container}:/tmp/$fileStem.sql" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to copy synchronous SQL into the local database container." }

  $output = & $docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atqf "/tmp/$fileStem.sql"
  if ($LASTEXITCODE -ne 0) {
    throw "Local psql command failed with exit code $LASTEXITCODE."
  }
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
    "exec",
    "-e",
    "PGAPPNAME=$ApplicationName",
    $container,
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-f",
    "/tmp/$FileStem.sql"
  ) -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
}

function Read-ProcessOutput {
  param([Parameter(Mandatory)][string]$FileStem)

  $stdout = Join-Path $testDirectory "$FileStem.stdout"
  $stderr = Join-Path $testDirectory "$FileStem.stderr"
  return "stdout:`n$([IO.File]::ReadAllText($stdout))`nstderr:`n$([IO.File]::ReadAllText($stderr))"
}

$cleanupSql = @"
set session_replication_role = replica;
delete from public.outreach_activities where opportunity_id in ('$assignedOpportunityId', '$racingOpportunityId');
delete from public.outreach_opportunities where id in ('$assignedOpportunityId', '$racingOpportunityId');
delete from public.outreach_contacts where id in ('94000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000002');
delete from public.semester_memberships where semester_id = '$semesterId';
delete from public.semesters where id = '$semesterId';
delete from public.profiles where id in ('$actorId', '$ownerId');
delete from auth.users where id in ('$actorId', '$ownerId');
set session_replication_role = origin;
drop table if exists public.task7_concurrency_gate;
"@

$blockerProcess = $null
$suspensionProcess = $null
$assignmentProcess = $null

if (-not (Test-Path -LiteralPath $testDirectory)) {
  New-Item -ItemType Directory -Path $testDirectory | Out-Null
}

try {
  Invoke-Psql -Sql $cleanupSql | Out-Null
  Invoke-Psql -Sql @"
insert into public.semesters (id, name, start_date, end_date, lifecycle_status)
values ('$semesterId', 'Task 7 concurrency', '2027-01-01', '2027-06-30', 'active');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('$actorId', 'authenticated', 'authenticated', 'task7-concurrency-actor@example.test', '{}'::jsonb, '{"full_name":"Task 7 Actor"}'::jsonb),
  ('$ownerId', 'authenticated', 'authenticated', 'task7-concurrency-owner@example.test', '{}'::jsonb, '{"full_name":"Task 7 Owner"}'::jsonb);
update public.profiles set role = 'admin', status = 'approved' where id in ('$actorId', '$ownerId');
insert into public.semester_memberships (id, semester_id, profile_id, role, status)
values
  ('93000000-0000-0000-0000-000000000001', '$semesterId', '$actorId', 'admin', 'active'),
  ('93000000-0000-0000-0000-000000000002', '$semesterId', '$ownerId', 'admin', 'active');
insert into public.outreach_contacts (id, full_name, email)
values
  ('94000000-0000-0000-0000-000000000001', 'Assigned fixture', 'task7-assigned@example.test'),
  ('94000000-0000-0000-0000-000000000002', 'Racing fixture', 'task7-racing@example.test');
insert into public.outreach_opportunities (id, semester_id, contact_id, owner_profile_id, stage)
values ('$assignedOpportunityId', '$semesterId', '94000000-0000-0000-0000-000000000001', '$ownerId', 'prospect');
"@ | Out-Null

  $blockerProcess = New-PsqlProcess -ApplicationName "task7_blocker" -FileStem "task7_blocker" -Sql @"
begin;
select id from public.outreach_opportunities where id = '$assignedOpportunityId' for update;
select pg_sleep(60);
commit;
"@
  Wait-ForCondition -Description "the blocker to hold the assigned opportunity row" -Condition {
    (Invoke-Psql -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = 'task7_blocker' and wait_event_type = 'Timeout' and wait_event = 'PgSleep'") -eq "1"
  }

  $suspensionProcess = New-PsqlProcess -ApplicationName "task7_suspension" -FileStem "task7_suspension" -Sql @"
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"$actorId","role":"authenticated"}', false);
select * from public.suspend_outreach_membership(
  '$semesterId',
  '$ownerId',
  'Concurrency regression',
  (select updated_at from public.semester_memberships where profile_id = '$ownerId' and semester_id = '$semesterId')
);
"@
  Wait-ForCondition -Description "suspension to hold the membership lock and wait on assigned work" -Condition {
    (Invoke-Psql -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = 'task7_suspension' and wait_event_type = 'Lock'") -eq "1"
  }

  $assignmentProcess = New-PsqlProcess -ApplicationName "task7_assignment" -FileStem "task7_assignment" -Sql @"
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"$actorId","role":"authenticated"}', false);
insert into public.outreach_opportunities (id, semester_id, contact_id, owner_profile_id, stage)
values ('$racingOpportunityId', '$semesterId', '94000000-0000-0000-0000-000000000002', '$ownerId', 'prospect');
"@

  Wait-ForCondition -Description "the concurrent assignment to wait on the membership lock" -Condition {
    (Invoke-Psql -Sql "select count(*) from pg_catalog.pg_stat_activity where application_name = 'task7_assignment' and wait_event_type = 'Lock'") -eq "1"
  }
  Invoke-Psql -Sql "select pg_terminate_backend(pid) from pg_catalog.pg_stat_activity where application_name = 'task7_blocker' and pid <> pg_backend_pid()" | Out-Null

  foreach ($process in @($blockerProcess, $suspensionProcess, $assignmentProcess)) {
    if (-not $process.WaitForExit(10000)) {
      throw "A concurrency test process did not finish within 10 seconds."
    }
    $process.Refresh()
  }

  $suspensionError = [IO.File]::ReadAllText((Join-Path $testDirectory "task7_suspension.stderr")).Trim()
  $assignmentError = [IO.File]::ReadAllText((Join-Path $testDirectory "task7_assignment.stderr")).Trim()

  if ($suspensionError.Length -gt 0) {
    throw "Suspension failed unexpectedly. $(Read-ProcessOutput -FileStem 'task7_suspension')"
  }
  if ($assignmentError -notmatch "ERROR:") {
    throw "Concurrent assignment succeeded after suspension held the membership lock. $(Read-ProcessOutput -FileStem 'task7_assignment')"
  }

  $finalState = Invoke-Psql -Sql @"
select sm.status::text || '|' || count(oo.id)::text
from public.semester_memberships sm
left join public.outreach_opportunities oo
  on oo.semester_id = sm.semester_id
 and oo.owner_profile_id = sm.profile_id
 and oo.stage not in ('converted', 'closed')
where sm.semester_id = '$semesterId' and sm.profile_id = '$ownerId'
group by sm.status;
"@
  if ($finalState -ne "suspended|0") {
    throw "Unsafe final owner state: $finalState (expected suspended|0)."
  }

  Write-Output "PASS: concurrent assignment waited for suspension and was rejected; final state is suspended|0."
} finally {
  try {
    Invoke-Psql -Sql "select pg_terminate_backend(pid) from pg_catalog.pg_stat_activity where application_name in ('task7_blocker','task7_suspension','task7_assignment') and pid <> pg_backend_pid()" | Out-Null
  } catch { }
  foreach ($process in @($blockerProcess, $suspensionProcess, $assignmentProcess)) {
    if ($null -ne $process -and -not $process.HasExited) {
      $process.WaitForExit(3000) | Out-Null
    }
  }
  try { Invoke-Psql -Sql $cleanupSql | Out-Null } catch { }
}
