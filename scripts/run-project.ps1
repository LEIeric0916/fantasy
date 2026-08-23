param(
  [Parameter(Position = 0, Mandatory = $true)]
  [ValidateSet("dev", "build", "test")]
  [string]$Task,

  [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
  [string[]]$ToolArgs
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$projectTemp = Join-Path $projectRoot "project-temp\runtime"
$npmCache = Join-Path $projectRoot "project-temp\npm-cache"
New-Item -ItemType Directory -Force $projectTemp, $npmCache | Out-Null

$env:TEMP = $projectTemp
$env:TMP = $projectTemp
$env:npm_config_cache = $npmCache

switch ($Task) {
  "dev" {
    & node (Join-Path $projectRoot "node_modules/vite/bin/vite.js") @ToolArgs
    $exitCode = $LASTEXITCODE
  }
  "build" {
    & node (Join-Path $projectRoot "node_modules/typescript/bin/tsc") -b
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
      & node (Join-Path $projectRoot "node_modules/vite/bin/vite.js") build
      $exitCode = $LASTEXITCODE
    }
  }
  "test" {
    & node (Join-Path $projectRoot "node_modules/vitest/vitest.mjs") @ToolArgs
    $exitCode = $LASTEXITCODE
  }
}

exit $exitCode
