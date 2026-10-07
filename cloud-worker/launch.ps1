# Starts a Claude Code cloud session on the current repository (Windows PowerShell 5.1 or later).
# Same arguments as coordinator-method/launch.exp, without needing expect.
# Usage, from inside the repository, in a real terminal (a Desktop terminal tab or Windows Terminal):
#   powershell.exe -NoProfile -File "$HOME\.claude\skills\cloud-worker\launch.ps1" <task file> <rules file|none> <log file> [model] [effort] [-DryRun] [-Force] [-Ref <ref>]
# The prompt is: /model and /effort lines, the task file, the "Worker brief" section of
# coordinator-method/SKILL.md, then the rules file (pass none for no rules; a lone - cannot be bound by PowerShell). Model and effort come from model-mix.
# Unlike launch.exp this script never checks out or pulls: it refuses to start when the branch is not pushed.
# A new cloud session needs a terminal (TTY). The session URL is printed by claude in that terminal:
# read it there and append a line "URL: <url>" to the log file.
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$TaskFile,
  [Parameter(Mandatory = $true, Position = 1)][string]$RulesFile,
  [Parameter(Mandatory = $true, Position = 2)][string]$LogFile,
  [Parameter(Position = 3)][string]$Model = 'sonnet',
  [Parameter(Position = 4)][string]$Effort = 'high',
  [string]$Ref = '',
  [switch]$DryRun,
  [switch]$Force,
  [switch]$NoTtyCheck,
  [string]$Exe = 'claude',
  [string[]]$ExeArgs = @()
)
$ErrorActionPreference = 'Stop'
$maxEscaped = 28000   # Windows caps a command line near 32,500 characters; stay well under it.

function Fail([string]$msg, [int]$code) { [Console]::Error.WriteLine("launch.ps1: $msg"); exit $code }
function Read-Utf8([string]$path) { [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $path).Path, [System.Text.Encoding]::UTF8) }
# Stderr from git (not a repository, no upstream) must not become a terminating error under 'Stop': the callers test for empty output.
function Invoke-Git { $ErrorActionPreference = 'Continue'; & git @args 2>$null }
# Windows PowerShell 5.1 drops embedded double quotes in native arguments; this escaping restores them.
# PowerShell 7.3 and later pass arguments correctly on their own (not tested here: no pwsh on this machine).
function Quote-Arg([string]$s) {
  if ($PSVersionTable.PSVersion -ge [version]'7.3' -and $PSNativeCommandArgumentPassing -ne 'Legacy') { return $s }
  $s = $s -replace '(\\*)"', '$1$1\"'
  return ($s -replace '(\\+)$', '$1$1')
}

$taskFull = (Resolve-Path -LiteralPath $TaskFile).Path   # resolve before changing directory
$rulesFull = $null
if ($RulesFile -ne 'none' -and $RulesFile -ne '-') { $rulesFull = (Resolve-Path -LiteralPath $RulesFile).Path }
$logDir = Split-Path -Parent ([System.IO.Path]::GetFullPath($LogFile))
if ($logDir -and -not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFull = [System.IO.Path]::GetFullPath($LogFile)

$root = (Invoke-Git rev-parse --show-toplevel)
if (-not $root) { Fail 'run it from inside a git repository with a GitHub remote' 2 }
Set-Location -LiteralPath $root
$branch = (Invoke-Git rev-parse --abbrev-ref HEAD)
$sha = (Invoke-Git rev-parse HEAD)
$upstream = (Invoke-Git rev-parse --abbrev-ref '@{u}')
$ahead = 0
if ($upstream) { $ahead = [int](Invoke-Git rev-list --count '@{u}..HEAD') }
$dirty = @(Invoke-Git status --porcelain --untracked-files=no)

if (-not $Force) {
  if (-not $upstream) { Fail "branch '$branch' has no upstream: push it first, the cloud VM clones the remote, not this checkout (-Force to ignore)" 3 }
  if ($ahead -gt 0) { Fail "branch '$branch' has $ahead unpushed commit(s): push first, the worker would not see them (-Force to ignore)" 3 }
  if ($dirty.Count -gt 0) { Fail 'tracked files have uncommitted changes: commit or stash them (a bundle upload would send them unfiltered) (-Force to ignore)' 3 }
}

$prompt = "/model $Model`n/effort $Effort`n`n" + (Read-Utf8 $taskFull).TrimEnd()
$skillPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'coordinator-method\SKILL.md'
if (Test-Path -LiteralPath $skillPath) {
  $m = [regex]::Match((Read-Utf8 $skillPath), '(?s)## Worker brief\r?\n(.*)$')
  if ($m.Success) { $prompt += "`n`n" + $m.Groups[1].Value.Trim() }
  else { Fail "no '## Worker brief' section in $skillPath" 2 }
} else { Fail "coordinator-method/SKILL.md not found next to cloud-worker ($skillPath)" 2 }
if ($rulesFull) { $prompt += "`n`n" + (Read-Utf8 $rulesFull).TrimEnd() }
$prompt = $prompt -replace "`r`n", "`n"

$argText = Quote-Arg $prompt
$promptFile = "$logFull.prompt.txt"
[System.IO.File]::WriteAllText($promptFile, $prompt, (New-Object System.Text.UTF8Encoding($false)))
$header = @("launch: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "repo: $root", "branch: $branch @ $sha", "model: $Model effort: $Effort", "prompt: $promptFile ($($prompt.Length) chars, $($argText.Length) as argument)")
[System.IO.File]::WriteAllText($logFull, (($header -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
$header | ForEach-Object { Write-Host $_ }

if ($argText.Length -gt $maxEscaped) {
  Fail "prompt is $($argText.Length) characters as an argument (limit $maxEscaped): commit the plan into the repo and make the task a short pointer to it" 4
}
if ($DryRun) { Write-Host 'dry run: nothing launched'; exit 0 }
if (-not $NoTtyCheck -and ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected)) {
  Fail 'a new cloud session needs a real terminal (TTY): run this in a terminal tab, not through a pipe or a background shell' 5
}

$cliArgs = @($ExeArgs) + @('--model', $Model, '--effort', $Effort)
if ($Ref) { $cliArgs += @('--ref', $Ref) }
$cliArgs += @('--cloud', $argText)
& $Exe @cliArgs
exit $LASTEXITCODE
