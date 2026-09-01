$ErrorActionPreference = "Stop"

$container = "supabase_db_AlmaworksInternal"
$database = "almaworks_upgrade_test"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$baseline = Join-Path $root "tests/database-revamp/production-baseline.sql"
$bootstrap = Join-Path $root "tests/database-revamp/production-bootstrap.sql"
$seed = Join-Path $root "tests/database-revamp/production-upgrade-seed.sql"
$assertions = Join-Path $root "tests/database-revamp/production-upgrade-assertions.sql"
$migrations = Get-ChildItem (Join-Path $root "supabase/migrations/*_database_hardening_cutover_stage_*.sql") |
  Sort-Object Name

if ((docker ps --format "{{.Names}}" | Where-Object { $_ -eq $container }).Count -ne 1) {
  throw "Expected the exact local Supabase database container $container."
}
if ($migrations.Count -ne 2) { throw "Expected exactly two ordered generated database hardening cutover migrations." }

function Invoke-SqlFile([string]$path) {
  Get-Content -LiteralPath $path -Raw |
    docker exec -i $container psql -U postgres -d $database -v ON_ERROR_STOP=1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed while applying $path" }
}

try {
  docker exec $container dropdb -U postgres --if-exists $database | Out-Null
  docker exec $container createdb -U postgres $database | Out-Null
  Invoke-SqlFile $bootstrap
  Invoke-SqlFile $baseline
  Invoke-SqlFile $seed
  @("BEGIN;") + ($migrations | ForEach-Object { Get-Content -LiteralPath $_.FullName }) + @("COMMIT;") |
    docker exec -i $container psql -U postgres -d $database -v ON_ERROR_STOP=1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Generated migration failed against the production-shaped clone." }
  Invoke-SqlFile $assertions
  Write-Output "Production-shaped upgrade passed: 20 tables, 0 views, 20 RLS tables, 7 legacy profiles preserved."
}
finally {
  docker exec $container dropdb -U postgres --if-exists $database | Out-Null
}
