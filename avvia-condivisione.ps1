param()
$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$statePath = Join-Path $project '.state'
$configuration = Get-Content -LiteralPath (Join-Path $statePath 'config.json') -Raw | ConvertFrom-Json
if (-not $configuration.shareCollaborations) { exit }
$pidPath = Join-Path $statePath 'collaboration-publisher.pid'
if (Test-Path -LiteralPath $pidPath) {
    $workerId = [int](Get-Content -LiteralPath $pidPath -Raw)
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $workerId" -ErrorAction SilentlyContinue
    if ($existing -and $existing.CommandLine.Contains('share_collaborations.py')) { exit }
}
$scriptPath = Join-Path $project 'bridge\share_collaborations.py'
$workerArgs = @('-u', ('"'+$scriptPath+'"'), '--db', ('"'+$configuration.db+'"'), '--state', ('"'+$statePath+'"'),
    '--remote', $configuration.shareRemote, '--public-url', $configuration.shareUrl, '--snapshot-url', $configuration.shareSnapshot,
    '--loop', '--interval', '120')
$worker = Start-Process -FilePath $configuration.python -ArgumentList $workerArgs -WorkingDirectory $project -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $statePath 'collaboration-publisher.log') -RedirectStandardError (Join-Path $statePath 'collaboration-publisher.err')
Set-Content -LiteralPath $pidPath -Value $worker.Id
