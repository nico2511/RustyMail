# Generates src-tauri/app-icon.png (envelope on transparent background), then:
#   npx tauri icon src-tauri/app-icon.png
Add-Type -AssemblyName System.Drawing
$size = 512
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
$accent = [System.Drawing.Color]::FromArgb(200, 149, 108)
$brush = New-Object System.Drawing.SolidBrush $accent
$pen = New-Object System.Drawing.Pen $brush, 28
$rect = New-Object System.Drawing.Rectangle 96, 150, 320, 200
$g.DrawRectangle($pen, $rect)
$pts = @(
    [System.Drawing.Point]::new(96, 150),
    [System.Drawing.Point]::new(256, 300),
    [System.Drawing.Point]::new(416, 150)
)
$g.DrawLines($pen, $pts)
$repoRoot = Split-Path $PSScriptRoot -Parent
$out = Join-Path $repoRoot (Join-Path 'src-tauri' 'app-icon.png')
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host "Saved $out"
