# Jimmy Scheduler - Deploy Edge Function + Sync Credentials to Supabase
# Run from project root: .\supabase\deploy.ps1
# Credentials are stored in user_config table, so re-auth is fully automatic.

Write-Host "Jimmy Scheduler Deploy" -ForegroundColor Cyan
Write-Host ""

# 1. Deploy the Edge Function
Write-Host "1/3 Deploying scheduler-tick Edge Function..." -ForegroundColor Green
supabase functions deploy scheduler-tick --no-verify-jwt

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy failed. Make sure you have run:" -ForegroundColor Red
    Write-Host "  supabase login" -ForegroundColor Yellow
    Write-Host "  supabase link --project-ref <YOUR_PROJECT_REF>" -ForegroundColor Yellow
    exit 1
}

# 2. Set the two static secrets (URL + service role key)
Write-Host ""
Write-Host "2/3 Setting static secrets..." -ForegroundColor Green
$env_file = Join-Path $PSScriptRoot "../.env"
$lines = Get-Content $env_file
$supabase_url = ($lines | Select-String "^SUPABASE_URL=").ToString().Split("=")[1].Trim('"').Trim("'")
$supabase_key = ($lines | Select-String "^SUPABASE_KEY=").ToString().Split("=")[1].Trim('"').Trim("'")

if ($supabase_url) {
    supabase secrets set "SUPABASE_URL=$supabase_url"
}
if ($supabase_key) {
    supabase secrets set "SUPABASE_SERVICE_ROLE_KEY=$supabase_key"
}

# 3. Sync credentials to user_config table via Jimmy CLI
Write-Host ""
Write-Host "3/3 Syncing credentials to Supabase user_config table..." -ForegroundColor Green
Write-Host "(This allows automatic re-auth without manual secrets updates)" -ForegroundColor DarkGray

# Call jimmy to sync
bun run index.ts sync-credentials

Write-Host ""
Write-Host "Deploy complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run the SQL in supabase/functions/scheduler-tick/setup.sql" -ForegroundColor White
Write-Host "     to register the pg_cron job (one time only)" -ForegroundColor DarkGray
Write-Host "  2. Your tasks will now run every minute in Supabase" -ForegroundColor White
Write-Host "  3. Re-auth Gmail anytime - it auto-syncs to Supabase" -ForegroundColor White
Write-Host ""
