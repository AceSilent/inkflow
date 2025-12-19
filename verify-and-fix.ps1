# InkFlow Sprint 1 验证和修复脚本
# 建议使用 VS Code 以 UTF-8 with BOM 编码保存

$OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "--- 开始 InkFlow Sprint 1 验证 ---" -ForegroundColor Green

# 检查当前目录
$currentDir = Get-Location
if (-not (Test-Path "src-tauri\Cargo.toml")) {
    Write-Host "[错误] 请在项目根目录运行此脚本" -ForegroundColor Red
    exit 1
}

Write-Host "当前工作目录: $currentDir" -ForegroundColor Blue

# 1. 检查 Rust 环境
Write-Host "1. 检查 Rust 环境..." -ForegroundColor Yellow
try {
    $rustVersion = rustc --version
    Write-Host "成功: Rust版本为 $rustVersion" -ForegroundColor Green
} catch {
    Write-Host "[错误] Rust 未安装或不在 PATH 环境变量中" -ForegroundColor Red
    Write-Host "请先安装 Rust: https://rustup.rs/" -ForegroundColor Yellow
    exit 1
}

# 2. 检查前端构建
Write-Host "2. 验证前端构建..." -ForegroundColor Yellow
try {
    # 尝试执行 pnpm build
    pnpm run build
    if ($LASTEXITCODE -eq 0) {
        Write-Host "成功: 前端构建通过" -ForegroundColor Green
    } else {
        Write-Host "[失败] 前端构建未通过" -ForegroundColor Red
    }
} catch {
    Write-Host "[错误] pnpm 命令执行失败，请确保已安装 Node.js 和 pnpm" -ForegroundColor Red
}

# 3. 检查 Rust 编译
Write-Host "3. 验证 Rust 后端编译..." -ForegroundColor Yellow
try {
    Push-Location "src-tauri"
    cargo check
    if ($LASTEXITCODE -eq 0) {
        Write-Host "成功: Rust 后端检查通过" -ForegroundColor Green
    } else {
        Write-Host "[注意] Rust 编译有误，正在尝试清理缓存后重试..." -ForegroundColor Red
        cargo clean
        cargo check
    }
} catch {
    Write-Host "[错误] cargo 命令执行失败" -ForegroundColor Red
} finally {
    Pop-Location
}

# 4. 验证 Tauri 开发环境
Write-Host "4. 验证 Tauri CLI 工具..." -ForegroundColor Yellow
try {
    $tauriCheck = pnpm tauri --version
    Write-Host "成功: Tauri CLI 版本为 $tauriCheck" -ForegroundColor Green
} catch {
    Write-Host "[错误] 未找到 Tauri CLI，请检查 package.json 依赖" -ForegroundColor Red
}

# 5. 项目统计信息
Write-Host ""
Write-Host "--- 项目统计信息 ---" -ForegroundColor Blue
Write-Host "==================" -ForegroundColor Blue

$tsFiles = (Get-ChildItem -Path "src" -Include "*.ts","*.tsx" -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count
$rsFiles = (Get-ChildItem -Path "src-tauri\src" -Filter "*.rs" -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count

Write-Host "前端 TypeScript/React 文件: $tsFiles 个" -ForegroundColor White
Write-Host "后端 Rust 源文件: $rsFiles 个" -ForegroundColor White

# 统计估算代码行数
$tsLines = (Get-Content -Path "src\**\*.ts","src\**\*.tsx" -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
Write-Host "估算总代码行数: $tsLines 行" -ForegroundColor White

Write-Host ""
Write-Host "--- Sprint 1 验证完成 ---" -ForegroundColor Green

# 6. 下一步指导
Write-Host "下一步计划 (Sprint 2):" -ForegroundColor Blue
Write-Host "1. 集成 Monaco Editor 核心组件" -ForegroundColor White
Write-Host "2. 使用 Zustand 搭建状态管理" -ForegroundColor White
Write-Host "3. 联调真实的 AI API 接口" -ForegroundColor White
Write-Host "4. 完善本地文件操作 API (Rust 侧)" -ForegroundColor White

Write-Host ""
Write-Host "提示: 如果运行仍有乱码，请在 VS Code 中点击右下角 UTF-8，选择 '通过编码保存' -> 'UTF-8 with BOM'" -ForegroundColor Cyan