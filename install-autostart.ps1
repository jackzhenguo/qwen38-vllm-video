param(
    [string]$Distro = 'Ubuntu',
    [string]$TaskName = 'Qwen Video Desk Autostart'
)

$ErrorActionPreference = 'Stop'

function Invoke-Wsl {
    param([string[]]$Arguments)
    $output = & wsl.exe -d $Distro -- @Arguments
    if ($LASTEXITCODE -ne 0) { throw "WSL 命令失败：$($Arguments -join ' ')" }
    return $output
}

$repoPath = (Resolve-Path -LiteralPath $PSScriptRoot).Path
if ($repoPath -notmatch '^([A-Za-z]):\\(.*)$') { throw '项目需要位于 Windows 本地盘符下。' }
$linuxRepo = '/mnt/{0}/{1}' -f $Matches[1].ToLowerInvariant(), $Matches[2].Replace('\', '/')
if ($linuxRepo -match '\s') { throw '目前自动启动脚本不支持含空格的项目路径。' }

$linuxHome = (Invoke-Wsl -Arguments @('printenv', 'HOME') | Select-Object -First 1).Trim()
$linuxUser = (Invoke-Wsl -Arguments @('id', '-un') | Select-Object -First 1).Trim()
$runtime = "$linuxHome/qwen38-vllm-video"
Invoke-Wsl -Arguments @('test', '-x', "$runtime/serve.sh") | Out-Null
Invoke-Wsl -Arguments @('test', '-x', "$runtime/.venv/bin/python") | Out-Null
Invoke-Wsl -Arguments @('test', '-f', "$linuxRepo/web_app.py") | Out-Null

$vllmUnit = @"
[Unit]
Description=Qwen Video Desk - vLLM model server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$linuxUser
WorkingDirectory=$runtime
Environment=HOME=$linuxHome
ExecStart=$runtime/serve.sh
Restart=always
RestartSec=20
TimeoutStopSec=90

[Install]
WantedBy=multi-user.target
"@

$webUnit = @"
[Unit]
Description=Qwen Video Desk - local web interface
After=qwen-video-vllm.service
Wants=qwen-video-vllm.service

[Service]
Type=simple
User=$linuxUser
WorkingDirectory=$linuxRepo
Environment=HOME=$linuxHome
Environment=QWEN_VIDEO_DIR=$runtime/videos
ExecStart=$runtime/.venv/bin/python -m uvicorn web_app:app --app-dir $linuxRepo --host 127.0.0.1 --port 7860
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"@

$vllmUnit | & wsl.exe -d $Distro -u root -- /usr/bin/tee /etc/systemd/system/qwen-video-vllm.service | Out-Null
if ($LASTEXITCODE -ne 0) { throw '写入 vLLM 服务失败。' }
$webUnit | & wsl.exe -d $Distro -u root -- /usr/bin/tee /etc/systemd/system/qwen-video-web.service | Out-Null
if ($LASTEXITCODE -ne 0) { throw '写入网页服务失败。' }

& wsl.exe -d $Distro -u root -- /usr/bin/systemctl daemon-reload
if ($LASTEXITCODE -ne 0) { throw 'systemd 无法加载服务配置。' }
& wsl.exe -d $Distro -u root -- /usr/bin/systemctl enable qwen-video-vllm.service qwen-video-web.service
if ($LASTEXITCODE -ne 0) { throw '启用 systemd 服务失败。' }

$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wsl.exe" -Argument "-d $Distro -- /usr/bin/sleep infinity"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $account
$trigger.Delay = 'PT30S'
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description '登录 Windows 后保持 WSL 运行，自动启动 Qwen Video Desk。' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
& wsl.exe -d $Distro -u root -- /usr/bin/systemctl start qwen-video-vllm.service qwen-video-web.service
if ($LASTEXITCODE -ne 0) { throw '启动 WSL 服务失败。' }

Write-Host "已安装 Windows 登录任务：$TaskName"
Write-Host '已启用 WSL 服务：qwen-video-vllm、qwen-video-web'
Write-Host '重新登录 Windows 后会自动启动。模型加载完成后打开 http://localhost:7860/'
