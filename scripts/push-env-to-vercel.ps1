# Push local .env keys to Vercel project (production + preview)
# Usage (from repo root after vercel link):
#   powershell -File scripts/push-env-to-vercel.ps1 -EnvFile .env -Overrides @{ APP_ENV='production'; APP_URL='https://xxx.vercel.app' }

param(
  [string]$EnvFile = ".env",
  [hashtable]$Overrides = @{},
  [string[]]$SkipKeys = @("PORT")
)

if (-not (Test-Path $EnvFile)) {
  Write-Error "Env file not found: $EnvFile"
  exit 1
}

$skip = [System.Collections.Generic.HashSet[string]]::new([string[]]$SkipKeys)
$pairs = @{}

Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $key = $line.Substring(0, $idx).Trim()
  $val = $line.Substring($idx + 1).Trim()
  if ($val.StartsWith('"') -and $val.EndsWith('"')) {
    $val = $val.Substring(1, $val.Length - 2)
  }
  if ($skip.Contains($key)) { return }
  $pairs[$key] = $val
}

foreach ($k in $Overrides.Keys) {
  $pairs[$k] = [string]$Overrides[$k]
}

# Prefer GEMINI_MODEL_ID if only GEMINI_MODEL set
if (-not $pairs.ContainsKey("GEMINI_MODEL_ID") -and $pairs.ContainsKey("GEMINI_MODEL")) {
  $pairs["GEMINI_MODEL_ID"] = $pairs["GEMINI_MODEL"]
}

foreach ($key in ($pairs.Keys | Sort-Object)) {
  $value = $pairs[$key]
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host "skip empty $key"
    continue
  }
  Write-Host "upsert $key (len=$($value.Length))"
  # Remove existing then add for production + preview
  foreach ($envName in @("production", "preview")) {
    $value | npx vercel env add $key $envName --force 2>$null
    if (-not $?) {
      # older CLI: try without --force
      $value | npx vercel env add $key $envName 2>$null
    }
  }
}

Write-Host "Done. Redeploy with: npx vercel --prod"
