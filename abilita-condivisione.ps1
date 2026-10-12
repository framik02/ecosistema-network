# Run only after authorization to publish collaboration data to the public repository.
param([switch]$ConfirmPublicCollaborations)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmPublicCollaborations) { throw 'Conferma esplicita richiesta per pubblicare i dati delle collaborazioni.' }
$configPath = Join-Path $PSScriptRoot '.state\config.json'
$configuration = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$configuration | Add-Member -NotePropertyName shareCollaborations -NotePropertyValue $true -Force
$configuration | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
$starter = Join-Path $PSScriptRoot 'avvia-condivisione.ps1'
$shell = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
if (-not $shell) { $shell = (Get-Command powershell.exe).Source }
$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'Ecosistema - collaborazioni.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$shortcut.TargetPath = $shell
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -File "' + $starter + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Sincronizza esclusivamente le collaborazioni osservate.'
$shortcut.Save()
& $starter
