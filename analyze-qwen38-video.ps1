param(
    [Parameter(Mandatory = $true)]
    [string]$Video,

    [string]$Question = '请概括视频中的关键事件；仅在能确认时标出大致时间点。',
    [string]$Distro = 'Ubuntu'
)

$ErrorActionPreference = 'Stop'
$linuxHome = (& wsl -d $Distro -- printenv HOME).Trim()
if ($LASTEXITCODE -ne 0 -or -not $linuxHome) { throw '无法读取 WSL 用户目录。' }
$python = "$linuxHome/qwen38-vllm-video/.venv/bin/python"
$client = "$linuxHome/qwen38-vllm-video/analyze_video.py"
$videoArg = $Video

if (Test-Path -LiteralPath $Video -PathType Leaf) {
    $source = (Resolve-Path -LiteralPath $Video).Path
    $name = '{0}-{1}' -f [guid]::NewGuid().ToString('N').Substring(0, 8), [System.IO.Path]::GetFileName($source)
    $windowsVideoDir = '\\wsl$\' + $Distro + '\' + $linuxHome.TrimStart('/').Replace('/', '\') + '\qwen38-vllm-video\videos'
    $destination = Join-Path $windowsVideoDir $name
    Copy-Item -LiteralPath $source -Destination $destination
    $videoArg = "$linuxHome/qwen38-vllm-video/videos/$name"
}

& wsl -d $Distro -- $python $client $videoArg --question $Question
if ($LASTEXITCODE -ne 0) {
    throw "Video analysis failed (exit code $LASTEXITCODE)."
}
