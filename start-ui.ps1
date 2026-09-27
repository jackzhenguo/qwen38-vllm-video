param(
    [string]$Distro = 'Ubuntu',
    [int]$Port = 7860,
    [string]$Python = ''
)

$ErrorActionPreference = 'Stop'
$resolvedRepo = (Resolve-Path -LiteralPath $PSScriptRoot).Path
if ($resolvedRepo -notmatch '^([A-Za-z]):\\(.*)$') { throw '项目需要位于 Windows 本地盘符下。' }
$linuxRepo = '/mnt/{0}/{1}' -f $Matches[1].ToLowerInvariant(), $Matches[2].Replace('\', '/')

if (-not $Python) {
    $linuxHome = (& wsl -d $Distro -- printenv HOME).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $linuxHome) { throw '无法读取 WSL 用户目录。' }
    $Python = "$linuxHome/qwen38-vllm-video/.venv/bin/python"
}

& wsl -d $Distro -- $Python -m uvicorn web_app:app --app-dir $linuxRepo --host 127.0.0.1 --port $Port
if ($LASTEXITCODE -ne 0) { throw "网页服务退出，代码 $LASTEXITCODE。" }
