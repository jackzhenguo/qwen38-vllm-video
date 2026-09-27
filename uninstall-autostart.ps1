param(
    [string]$Distro = 'Ubuntu',
    [string]$TaskName = 'Qwen Video Desk Autostart'
)

$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
& wsl.exe -d $Distro -u root -- /usr/bin/systemctl disable --now qwen-video-web.service qwen-video-vllm.service
if ($LASTEXITCODE -ne 0) { throw '停止 WSL 服务失败。' }
& wsl.exe -d $Distro -u root -- /usr/bin/rm -f /etc/systemd/system/qwen-video-web.service /etc/systemd/system/qwen-video-vllm.service
if ($LASTEXITCODE -ne 0) { throw '删除 WSL 服务配置失败。' }
& wsl.exe -d $Distro -u root -- /usr/bin/systemctl daemon-reload
if ($LASTEXITCODE -ne 0) { throw '重载 systemd 失败。' }
Write-Host '已移除自动启动任务和 WSL 服务。'
