param([switch]$SkipPublisher)
$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$statePath = Join-Path $project '.state'
$configuration = Get-Content -LiteralPath (Join-Path $statePath 'config.json') -Raw | ConvertFrom-Json
function Start-Worker([string]$Name, [string]$Script, [string[]]$WorkerArguments) {
    $pidPath = Join-Path $statePath ($Name + '.pid')
    if (Test-Path -LiteralPath $pidPath) {
        $workerId = [int](Get-Content -LiteralPath $pidPath -Raw)
        $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $workerId" -ErrorAction SilentlyContinue
        if ($existing -and $existing.CommandLine.Contains($Script)) { return }
    }
    $scriptPath = Join-Path $project ('bridge\' + $Script)
    $arguments = @('-u', ('"' + $scriptPath + '"')) + $WorkerArguments
    $worker = Start-Process -FilePath $configuration.python -ArgumentList $arguments -WorkingDirectory $project -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $statePath ($Name + '.log')) -RedirectStandardError (Join-Path $statePath ($Name + '.err'))
    Set-Content -LiteralPath $pidPath -Value $worker.Id
}
$dbArgs = @('--db', ('"' + $configuration.db + '"'), '--state', ('"' + $statePath + '"'))
if (-not (Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Worker 'server' 'serve.py' ($dbArgs + @('--port', '8766'))
}
Start-Worker 'semantic' 'semantic.py' ($dbArgs + @('--loop', '--interval', '120'))
if (-not $SkipPublisher) {
    Start-Worker 'publisher' 'publish.py' ($dbArgs + @('--repo', ('"' + $configuration.dataRepo + '"'), '--loop', '--interval', '120'))
}
