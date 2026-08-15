<#
.SYNOPSIS
  Vendors the Superpowers skill library into this repo's .claude\skills\.

.DESCRIPTION
  Cowork cloud sessions cannot write to .claude\ over the device bridge, so this
  script does the unpack locally. Run it from the repo root.

  Two modes:
    -FromZip <path>   unpack the bundle Claude delivered (offline, pinned commit)
    (default)         git clone the upstream repo and copy skills\ (always latest)

.EXAMPLE
  .\scripts\install-superpowers.ps1 -FromZip .\scripts\superpowers-vendor.zip
.EXAMPLE
  .\scripts\install-superpowers.ps1
#>
[CmdletBinding()]
param(
  [string]$FromZip,
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$claudeDir = Join-Path $RepoRoot '.claude'
$skillsDir = Join-Path $claudeDir 'skills'

# --- superpowers skill names, used for collision detection and clean re-install
$spSkills = @(
  'brainstorming','dispatching-parallel-agents','executing-plans',
  'finishing-a-development-branch','receiving-code-review','requesting-code-review',
  'subagent-driven-development','systematic-debugging','test-driven-development',
  'using-git-worktrees','using-superpowers','verification-before-completion',
  'writing-plans','writing-skills'
)

if (-not (Test-Path $claudeDir)) { New-Item -ItemType Directory -Path $claudeDir | Out-Null }
if (-not (Test-Path $skillsDir)) { New-Item -ItemType Directory -Path $skillsDir | Out-Null }

# --- refuse to silently clobber non-superpowers skills that share a name
$collisions = @()
foreach ($s in $spSkills) {
  $p = Join-Path $skillsDir $s
  if ((Test-Path $p) -and -not $Force) { $collisions += $s }
}
if ($collisions.Count -gt 0) {
  Write-Warning "These skill folders already exist and will be REPLACED:`n  $($collisions -join "`n  ")"
  Write-Warning "Re-run with -Force to overwrite, or rename them first."
  exit 1
}

$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("sp-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null

try {
  if ($FromZip) {
    $zipPath = (Resolve-Path $FromZip).Path
    Write-Host "Unpacking $zipPath ..."
    Expand-Archive -Path $zipPath -DestinationPath $staging -Force
    $srcSkills   = Join-Path $staging '.claude\skills'
    $srcSidecar  = Join-Path $staging '.claude\superpowers'
  } else {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git not found on PATH; use -FromZip instead." }
    Write-Host "Cloning obra/superpowers ..."
    git clone --depth 1 --quiet https://github.com/obra/superpowers.git (Join-Path $staging 'repo')
    $srcSkills  = Join-Path $staging 'repo\skills'
    $srcSidecar = $null
  }

  if (-not (Test-Path $srcSkills)) { throw "No skills\ directory found in source." }

  $n = 0
  Get-ChildItem -Path $srcSkills -Directory | ForEach-Object {
    $dest = Join-Path $skillsDir $_.Name
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Copy-Item -Recurse -Path $_.FullName -Destination $dest
    $n++
    Write-Host "  + .claude\skills\$($_.Name)"
  }

  if ($srcSidecar -and (Test-Path $srcSidecar)) {
    $destSidecar = Join-Path $claudeDir 'superpowers'
    if (Test-Path $destSidecar) { Remove-Item -Recurse -Force $destSidecar }
    Copy-Item -Recurse -Path $srcSidecar -Destination $destSidecar
    Write-Host "  + .claude\superpowers  (hooks, manifest, LICENSE, VENDORED.md)"
  }

  Write-Host ""
  Write-Host "Installed $n superpowers skills into $skillsDir" -ForegroundColor Green
  Write-Host ""
  Write-Host "Verify:  Get-ChildItem '$skillsDir' -Directory | Select-Object Name"
  Write-Host "In Claude Code, the skills are discovered automatically on next session start."
  Write-Host ""
  Write-Host "Prefer an auto-updating install? Instead of this script, run in Claude Code:" -ForegroundColor Yellow
  Write-Host "  /plugin marketplace add obra/superpowers"
  Write-Host "  /plugin install superpowers@superpowers-dev"
  Write-Host "(then delete the vendored copies so you don't have two of each skill)"
}
finally {
  if (Test-Path $staging) { Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue }
}
