# push.ps1 — đẩy / xóa file hoặc thư mục trên GitHub repo tih-anbinh/vuon-hoc-tap
# Cách dùng:
#   .\push.ps1 toan3.html                              # đẩy 1 file
#   .\push.ps1 toan3.html "feat: cải thiện game"       # đẩy + message
#   .\push.ps1 read-oasis                              # đẩy cả thư mục (đệ quy)
#   .\push.ps1 read-oasis -Exclude dist,bak            # đẩy thư mục, bỏ qua dist/ và bak/
#   .\push.ps1 read-oasis/dist -Delete                 # XÓA thư mục dist/ khỏi repo
#   .\push.ps1 secret.txt -Delete                      # XÓA 1 file khỏi repo
#
# PAT: đặt vào file "push_pat.txt" cùng thư mục (1 dòng, không có khoảng trắng)
# hoặc set biến môi trường: $env:GH_PAT = "ghp_..."

param(
    [Parameter(Mandatory)][string]$Path,
    [string]$Message = "",
    [string[]]$Exclude = @(),   # tên thư mục/file cần bỏ qua (không cần đường dẫn đầy đủ)
    [switch]$Delete             # xóa Path khỏi repo thay vì đẩy lên
)

$ErrorActionPreference = 'Stop'

function To-Utf8JsonBody($Object, [int]$Depth = 6) {
    $json = $Object | ConvertTo-Json -Depth $Depth -Compress
    return [regex]::Replace($json, '[^\u0000-\u007F]', {
        param($match)
        '\u{0:x4}' -f [int][char]$match.Value
    })
}

# --- Đọc PAT ---
$pat = $env:GH_PAT
if (-not $pat) {
    $patFile = "C:\Users\huytran\.github\.push_pat.txt"
    if (-not [System.IO.Path]::IsPathRooted($patFile)) { $patFile = Join-Path $PSScriptRoot $patFile }
    if (Test-Path $patFile) { $pat = (Get-Content $patFile -Raw).Trim() }
}
if (-not $pat) {
    Write-Error "Chưa có PAT. Tạo file push_pat.txt trong cùng thư mục, hoặc set `$env:GH_PAT`."
    exit 1
}

$root = $PSScriptRoot
$repo = "tih-anbinh/vuon-hoc-tap"
$h    = @{ Authorization="token $pat"; 'User-Agent'='pwsh' }

# --- Helper: lấy danh sách file trong repo theo prefix ---
function Get-RepoFiles([string]$prefix) {
    # Lấy recursive tree của HEAD
    $ref  = Invoke-RestMethod "https://api.github.com/repos/$repo/git/ref/heads/main" -Headers $h
    $c0   = Invoke-RestMethod "https://api.github.com/repos/$repo/git/commits/$($ref.object.sha)" -Headers $h
    $tree = Invoke-RestMethod "https://api.github.com/repos/$repo/git/trees/$($c0.tree.sha)?recursive=1" -Headers $h
    # Khớp đúng file, hoặc mọi file bên trong thư mục prefix/ (tránh 'app.css' khớp nhầm 'app.css.bak')
    return $tree.tree | Where-Object { $_.type -eq 'blob' -and ($_.path -eq $prefix -or $_.path.StartsWith("$prefix/")) }
}

# ════════════════════════════════════════════════════════════
# MODE: DELETE — xóa file/thư mục khỏi repo
# ════════════════════════════════════════════════════════════
if ($Delete) {
    $repoPrefix = ($Path -replace '\\','/').TrimStart('/')
    Write-Host "=== DELETE '$repoPrefix' khỏi $repo ==="

    # Tìm tất cả blob trong repo khớp prefix
    $toDelete = @(Get-RepoFiles $repoPrefix)   # @() để 1 kết quả vẫn là mảng (PS 5.1)
    if ($toDelete.Count -eq 0) {
        Write-Host "Không tìm thấy file nào khớp '$repoPrefix' trong repo. Không có gì để xóa."
        exit 0
    }
    Write-Host "Sẽ xóa $($toDelete.Count) file(s):"
    $toDelete | ForEach-Object { Write-Host "  - $($_.path)" }
    $confirm = Read-Host "`nXác nhận xóa? (y/N)"
    if ($confirm -notmatch '^[yY]') { Write-Host "Hủy."; exit 0 }

    if (-not $Message) { $Message = "chore: delete $repoPrefix" }

    # Tạo tree entries với sha=null để xóa
    $ref  = Invoke-RestMethod "https://api.github.com/repos/$repo/git/ref/heads/main" -Headers $h
    $c0   = Invoke-RestMethod "https://api.github.com/repos/$repo/git/commits/$($ref.object.sha)" -Headers $h
    $treeItems = @($toDelete | ForEach-Object {
        @{ path=$_.path; mode='100644'; type='blob'; sha=$null }
    })
    $tree = Invoke-RestMethod "https://api.github.com/repos/$repo/git/trees" `
              -Method Post -Headers $h -ContentType 'application/json' `
              -Body (To-Utf8JsonBody @{ base_tree=$c0.tree.sha; tree=$treeItems })
    $nc = Invoke-RestMethod "https://api.github.com/repos/$repo/git/commits" `
              -Method Post -Headers $h -ContentType 'application/json' `
              -Body (To-Utf8JsonBody @{ message=$Message; tree=$tree.sha; parents=@($ref.object.sha) })
    Invoke-RestMethod "https://api.github.com/repos/$repo/git/refs/heads/main" `
        -Method Patch -Headers $h -ContentType 'application/json' `
        -Body (To-Utf8JsonBody @{ sha=$nc.sha }) | Out-Null
    Write-Host "`nDone: $($nc.sha.Substring(0,8)) — $Message"
    exit 0
}

# ════════════════════════════════════════════════════════════
# MODE: PUSH — đẩy file/thư mục lên repo
# ════════════════════════════════════════════════════════════
$fpath = if ([System.IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $root $Path }
if (-not (Test-Path $fpath)) { Write-Error "Không tìm thấy: $fpath"; exit 1 }

$isDir = (Get-Item $fpath).PSIsContainer

if ($isDir) {
    $fullRoot = (Resolve-Path $root).Path.TrimEnd('\','/') + [System.IO.Path]::DirectorySeparatorChar
    $dirName  = [System.IO.Path]::GetFileName($fpath.TrimEnd('\','/'))
    # fpathSlash đảm bảo có trailing separator để Substring cắt đúng
    $fpathSlash = $fpath.TrimEnd('\','/') + [System.IO.Path]::DirectorySeparatorChar
    # Extension backup luôn bị bỏ qua
    $skipExts = @('.bak','.tmp','.orig','.swp')
    $files = Get-ChildItem -Path $fpath -Recurse -File | Where-Object {
        # Bỏ qua theo extension backup
        if ($skipExts -contains $_.Extension.ToLower()) { return $false }
        # Bỏ qua theo tên thư mục/file trong danh sách Exclude
        $parts = $_.FullName.Substring($fpathSlash.Length).TrimStart('\','/') -split '[/\\]'
        $skip  = $false
        foreach ($ex in $Exclude) { if ($parts -contains $ex) { $skip = $true; break } }
        -not $skip
    }
    if ($files.Count -eq 0) { Write-Error "Không có file nào sau khi lọc Exclude."; exit 1 }
    $entries = $files | ForEach-Object {
        $fullItem = (Resolve-Path $_.FullName).Path
        if ($fullItem.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $rPath = $fullItem.Substring($fullRoot.Length) -replace '\\','/'
        } else {
            $rel = $_.FullName.Substring($fpathSlash.Length)
            $rPath = "$dirName/$($rel -replace '\\','/')"
        }
        @{ localPath=$_.FullName; repoPath=$rPath }
    }
    if (-not $Message) {
        $dirRel = if ((Resolve-Path $fpath).Path.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            (Resolve-Path $fpath).Path.Substring($fullRoot.Length) -replace '\\','/'
        } else { $dirName }
        $Message = "chore: update $dirRel/"
    }
    if ($Exclude.Count -gt 0) { Write-Host "(Bỏ qua: $($Exclude -join ', '))" }
} else {
    # Giữ nguyên đường dẫn tương đối so với thư mục gốc (read-oasis/assets/app.css → read-oasis/assets/app.css),
    # KHÔNG chỉ lấy tên file — nếu không, file trong thư mục con sẽ bị đẩy nhầm lên gốc repo.
    $fullRoot = (Resolve-Path $root).Path.TrimEnd('\','/') + [System.IO.Path]::DirectorySeparatorChar
    $fullFile = (Resolve-Path $fpath).Path
    if ($fullFile.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $repoPath = $fullFile.Substring($fullRoot.Length) -replace '\\','/'
    } else {
        $repoPath = [System.IO.Path]::GetFileName($fpath)
    }
    $entries = @(@{ localPath=$fpath; repoPath=$repoPath })
    if (-not $Message) { $Message = "chore: update $repoPath" }
}

Write-Host "=== Push $($entries.Count) file(s) → $repo ==="
$entries | ForEach-Object { Write-Host "  $($_.repoPath)  ($([Math]::Round((Get-Item $_.localPath).Length/1024,1)) KB)" }

# --- Tạo blob cho từng file ---
Write-Host "`nUploading blobs..."
$treeItems = @()
foreach ($e in $entries) {
    $b64  = [Convert]::ToBase64String([IO.File]::ReadAllBytes($e.localPath))
    $blob = Invoke-RestMethod "https://api.github.com/repos/$repo/git/blobs" `
              -Method Post -Headers $h -ContentType 'application/json' `
              -Body (To-Utf8JsonBody @{ content=$b64; encoding='base64' })
    $treeItems += @{ path=$e.repoPath; mode='100644'; type='blob'; sha=$blob.sha }
    Write-Host "  blob OK: $($e.repoPath)"
}

# --- Lấy HEAD, tạo tree + commit ---
$ref  = Invoke-RestMethod "https://api.github.com/repos/$repo/git/ref/heads/main" -Headers $h
$c0   = Invoke-RestMethod "https://api.github.com/repos/$repo/git/commits/$($ref.object.sha)" -Headers $h

$tree = Invoke-RestMethod "https://api.github.com/repos/$repo/git/trees" `
          -Method Post -Headers $h -ContentType 'application/json' `
          -Body (To-Utf8JsonBody @{ base_tree=$c0.tree.sha; tree=$treeItems })

$nc = Invoke-RestMethod "https://api.github.com/repos/$repo/git/commits" `
          -Method Post -Headers $h -ContentType 'application/json' `
          -Body (To-Utf8JsonBody @{ message=$Message; tree=$tree.sha; parents=@($ref.object.sha) })

Invoke-RestMethod "https://api.github.com/repos/$repo/git/refs/heads/main" `
    -Method Patch -Headers $h -ContentType 'application/json' `
    -Body (To-Utf8JsonBody @{ sha=$nc.sha }) | Out-Null

Write-Host "`nDone: $($nc.sha.Substring(0,8)) — $Message"
