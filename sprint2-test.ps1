# InkFlow Sprint 2 成果测试脚本
# 建议使用 VS Code 以 UTF-8 with BOM 编码保存

$OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "=== 开始 InkFlow Sprint 2 成果测试 ===" -ForegroundColor Green

# 测试计数器
$totalTests = 0
$passedTests = 0
$failedTests = 0

function Test-Step {
    param(
        [string]$TestName,
        [scriptblock]$TestCode,
        [string]$ExpectedResult = "Success"
    )

    $totalTests++
    Write-Host "`n[Test $($totalTests)] $TestName" -ForegroundColor Yellow

    try {
        $result = & $TestCode
        if ($result -eq $ExpectedResult) {
            Write-Host "✅ 通过" -ForegroundColor Green
            $passedTests++
        } else {
            Write-Host "❌ 失败 - 期望: $ExpectedResult, 实际: $result" -ForegroundColor Red
            $failedTests++
        }
    } catch {
        Write-Host "❌ 错误: $($_.Exception.Message)" -ForegroundColor Red
        $failedTests++
    }
}

# 检查当前目录
$currentDir = Get-Location
if (-not (Test-Path "src-tauri\Cargo.toml") -or -not (Test-Path "package.json")) {
    Write-Host "[错误] 请在项目根目录运行此测试脚本" -ForegroundColor Red
    exit 1
}

Write-Host "当前工作目录: $currentDir" -ForegroundColor Blue

# 1. 检查前端依赖
Test-Step -TestName "检查 package.json 新增依赖" -TestCode {
    $packageJson = Get-Content "package.json" | ConvertFrom-Json

    $requiredDeps = @(
        "@monaco-editor/react",
        "zustand",
        "framer-motion",
        "monaco-editor"
    )

    $missingDeps = @()
    foreach ($dep in $requiredDeps) {
        if (-not $packageJson.dependencies.PSObject.Properties.Name -contains $dep) {
            $missingDeps += $dep
        }
    }

    if ($missingDeps.Count -eq 0) {
        return "Success"
    } else {
        return "Missing dependencies: $($missingDeps -join ', ')"
    }
}

Test-Step -TestName "检查 node_modules 是否存在" -TestCode {
    if (Test-Path "node_modules") {
        return "Success"
    } else {
        return "node_modules not found - run npm install"
    }
}

# 2. 检查新创建的文件结构
Test-Step -TestName "检查 Zustand Store 文件" -TestCode {
    if (Test-Path "src\store\editorStore.ts") {
        return "Success"
    } else {
        return "editorStore.ts not found"
    }
}

Test-Step -TestName "检查编辑器组件文件" -TestCode {
    $requiredFiles = @(
        "src\components\Editor\MainEditor.tsx",
        "src\components\Editor\GhostTextManager.ts",
        "src\components\Editor\FeedbackPanel.tsx"
    )

    $missingFiles = @()
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            $missingFiles += $file
        }
    }

    if ($missingFiles.Count -eq 0) {
        return "Success"
    } else {
        return "Missing files: $($missingFiles -join ', ')"
    }
}

Test-Step -TestName "检查 Hook 和样式文件" -TestCode {
    $requiredFiles = @(
        "src\hooks\useDebounce.ts",
        "src\styles\editor.css"
    )

    $missingFiles = @()
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            $missingFiles += $file
        }
    }

    if ($missingFiles.Count -eq 0) {
        return "Success"
    } else {
        return "Missing files: $($missingFiles -join ', ')"
    }
}

# 3. TypeScript 编译检查
Test-Step -TestName "TypeScript 类型检查" -TestCode {
    try {
        $tscResult = npm run build 2>&1
        if ($LASTEXITCODE -eq 0) {
            return "Success"
        } else {
            return "TypeScript compilation failed"
        }
    } catch {
        return "TypeScript check error: $($_.Exception.Message)"
    }
}

# 4. 前端构建测试
Test-Step -TestName "前端构建验证" -TestCode {
    try {
        # 清理之前的构建
        if (Test-Path "dist") {
            Remove-Item -Recurse -Force "dist"
        }

        $buildResult = npm run build 2>&1
        if ($LASTEXITCODE -eq 0 -and (Test-Path "dist")) {
            return "Success"
        } else {
            return "Build failed"
        }
    } catch {
        return "Build error: $($_.Exception.Message)"
    }
}

# 5. Rust 后端编译检查
Test-Step -TestName "Rust 后端编译检查" -TestCode {
    try {
        Push-Location "src-tauri"
        $cargoCheck = cargo check 2>&1
        $exitCode = $LASTEXITCODE
        Pop-Location

        if ($exitCode -eq 0) {
            return "Success"
        } else {
            return "Rust compilation failed"
        }
    } catch {
        return "Rust check error: $($_.Exception.Message)"
    }
}

# 6. 检查关键代码内容
Test-Step -TestName "验证 Zustand Store 实现" -TestCode {
    try {
        $storeContent = Get-Content "src\store\editorStore.ts" -Raw

        $requiredKeywords = @(
            "create<EditorState",
            "useEditorStore",
            "setGhostText",
            "acceptSuggestion",
            "generateAISuggestion",
            "updateContent"
        )

        $missingKeywords = @()
        foreach ($keyword in $requiredKeywords) {
            if ($storeContent -notmatch [regex]::Escape($keyword)) {
                $missingKeywords += $keyword
            }
        }

        if ($missingKeywords.Count -eq 0) {
            return "Success"
        } else {
            return "Missing keywords: $($missingKeywords -join ', ')"
        }
    } catch {
        return "Store verification error: $($_.Exception.Message)"
    }
}

Test-Step -TestName "验证 Monaco Editor 集成" -TestCode {
    try {
        $editorContent = Get-Content "src\components\Editor\MainEditor.tsx" -Raw

        $requiredKeywords = @(
            "@monaco-editor/react",
            "GhostTextManager",
            "handleEditorMount",
            "onDidChangeModelContent",
            "onDidChangeCursorPosition"
        )

        $missingKeywords = @()
        foreach ($keyword in $requiredKeywords) {
            if ($editorContent -notmatch [regex]::Escape($keyword)) {
                $missingKeywords += $keyword
            }
        }

        if ($missingKeywords.Count -eq 0) {
            return "Success"
        } else {
            return "Missing keywords: $($missingKeywords -join ', ')"
        }
    } catch {
        return "Editor verification error: $($_.Exception.Message)"
    }
}

Test-Step -TestName "验证 Framer Motion 集成" -TestCode {
    try {
        $feedbackContent = Get-Content "src\components\Editor\FeedbackPanel.tsx" -Raw

        $requiredKeywords = @(
            "framer-motion",
            "AnimatePresence",
            "motion.div",
            "initial.*animate.*exit"
        )

        $missingKeywords = @()
        foreach ($keyword in $requiredKeywords) {
            if ($feedbackContent -notmatch $keyword) {
                $missingKeywords += $keyword
            }
        }

        if ($missingKeywords.Count -eq 0) {
            return "Success"
        } else {
            return "Missing keywords: $($missingKeywords -join ', ')"
        }
    } catch {
        return "Feedback panel verification error: $($_.Exception.Message)"
    }
}

Test-Step -TestName "验证 CSS 样式实现" -TestCode {
    try {
        $cssContent = Get-Content "src\styles\editor.css" -Raw

        $requiredKeywords = @(
            ".ghost-text",
            ".monaco-editor",
            "@keyframes pulse",
            ".feedback-panel"
        )

        $missingKeywords = @()
        foreach ($keyword in $requiredKeywords) {
            if ($cssContent -notmatch $keyword) {
                $missingKeywords += $keyword
            }
        }

        if ($missingKeywords.Count -eq 0) {
            return "Success"
        } else {
            return "Missing keywords: $($missingKeywords -join ', ')"
        }
    } catch {
        return "CSS verification error: $($_.Exception.Message)"
    }
}

# 7. 功能集成测试
Test-Step -TestName "检查 App.tsx 集成" -TestCode {
    try {
        $appContent = Get-Content "src\App.tsx" -Raw

        $requiredImports = @(
            "MainEditor",
            "useEditorStore",
            "./styles/editor.css"
        )

        $missingImports = @()
        foreach ($import in $requiredImports) {
            if ($appContent -notmatch [regex]::Escape($import)) {
                $missingImports += $import
            }
        }

        if ($missingImports.Count -eq 0) {
            return "Success"
        } else {
            return "Missing imports: $($missingImports -join ', ')"
        }
    } catch {
        return "App verification error: $($_.Exception.Message)"
    }
}

Test-Step -TestName "验证文件导入路径" -TestCode {
    try {
        # 检查主要文件的导入路径是否正确
        $issues = @()

        # 检查 MainEditor 导入
        $mainEditor = Get-Content "src\components\Editor\MainEditor.tsx" -Raw
        if ($mainEditor -notmatch "from ['""]../../store/editorStore['""]") {
            $issues += "MainEditor store import path"
        }

        # 检查 App.tsx 导入
        $appContent = Get-Content "src\App.tsx" -Raw
        if ($appContent -notmatch "from ['""]./components/Editor/MainEditor['""]") {
            $issues += "App MainEditor import path"
        }

        if ($issues.Count -eq 0) {
            return "Success"
        } else {
            return "Import path issues: $($issues -join ', ')"
        }
    } catch {
        return "Import verification error: $($_.Exception.Message)"
    }
}

# 8. 文档完整性检查
Test-Step -TestName "检查 Sprint 2 文档" -TestCode {
    if (Test-Path "SPRINT2_IMPLEMENTATION.md") {
        $docContent = Get-Content "SPRINT2_IMPLEMENTATION.md" -Raw
        if ($docContent -match "## 🎯 实现概述" -and $docContent -match "## 📁 新增文件结构") {
            return "Success"
        } else {
            return "Documentation incomplete"
        }
    } else {
        return "SPRINT2_IMPLEMENTATION.md not found"
    }
}

# 9. 代码质量检查
Test-Step -TestName "检查代码文件大小和复杂度" -TestCode {
    try {
        $fileStats = @()

        $fileStats += [PSCustomObject]@{
            File = "editorStore.ts"
            Size = (Get-Item "src\store\editorStore.ts").Length
            Lines = (Get-Content "src\store\editorStore.ts").Count
        }

        $fileStats += [PSCustomObject]@{
            File = "MainEditor.tsx"
            Size = (Get-Item "src\components\Editor\MainEditor.tsx").Length
            Lines = (Get-Content "src\components\Editor\MainEditor.tsx").Count
        }

        $fileStats += [PSCustomObject]@{
            File = "FeedbackPanel.tsx"
            Size = (Get-Item "src\components\Editor\FeedbackPanel.tsx").Length
            Lines = (Get-Content "src\components\Editor\FeedbackPanel.tsx").Count
        }

        # 检查文件大小是否合理 (至少 1KB，不超过 100KB)
        $sizesValid = $fileStats | Where-Object { $_.Size -gt 1000 -and $_.Size -lt 100000 }

        if ($sizesValid.Count -eq $fileStats.Count) {
            return "Success"
        } else {
            return "File size issues detected"
        }
    } catch {
        return "Code quality check error: $($_.Exception.Message)"
    }
}

# 10. Tauri 开发环境测试
Test-Step -TestName "检查 Tauri 开发环境" -TestCode {
    try {
        $tauriCheck = npm run tauri --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            return "Success"
        } else {
            return "Tauri CLI check failed"
        }
    } catch {
        return "Tauri environment error: $($_.Exception.Message)"
    }
}

# 生成测试报告
Write-Host "`n=== Sprint 2 测试报告 ===" -ForegroundColor Blue
Write-Host "总测试数: $totalTests" -ForegroundColor White
Write-Host "通过: $passedTests" -ForegroundColor Green
Write-Host "失败: $failedTests" -ForegroundColor Red

$successRate = if ($totalTests -gt 0) { [math]::Round(($passedTests / $totalTests) * 100, 1) } else { 0 }
Write-Host "成功率: $successRate%" -ForegroundColor $(if ($successRate -ge 80) { "Green" } elseif ($successRate -ge 60) { "Yellow" } else { "Red" })

# 功能验证总结
Write-Host "`n=== 功能验证总结 ===" -ForegroundColor Blue

Write-Host "`n📦 核心组件状态:" -ForegroundColor Cyan
Write-Host "  • Zustand Store: $(-join (if (Test-Path 'src\store\editorStore.ts') { '✅' } else { '❌' }))"
Write-Host "  • Monaco Editor: $(-join (if (Test-Path 'src\components\Editor\MainEditor.tsx') { '✅' } else { '❌' }))"
Write-Host "  • Ghost Text Manager: $(-join (if (Test-Path 'src\components\Editor\GhostTextManager.ts') { '✅' } else { '❌' }))"
Write-Host "  • Feedback Panel: $(-join (if (Test-Path 'src\components\Editor\FeedbackPanel.tsx') { '✅' } else { '❌' }))"
Write-Host "  • Custom Hooks: $(-join (if (Test-Path 'src\hooks\useDebounce.ts') { '✅' } else { '❌' }))"
Write-Host "  • Styling: $(-join (if (Test-Path 'src\styles\editor.css') { '✅' } else { '❌' }))"

Write-Host "`n🔧 技术集成状态:" -ForegroundColor Cyan
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$tsStatus = if ($packageJson.devDependencies.'typescript') { '✅' } else { '❌' }
$monacoStatus = if ($packageJson.dependencies.'@monaco-editor/react') { '✅' } else { '❌' }
$zustandStatus = if ($packageJson.dependencies.zustand) { '✅' } else { '❌' }
$framerStatus = if ($packageJson.dependencies.'framer-motion') { '✅' } else { '❌' }
$tauriStatus = if ($packageJson.dependencies.'@tauri-apps/api') { '✅' } else { '❌' }

Write-Host "  • TypeScript: $tsStatus"
Write-Host "  • Monaco Editor: $monacoStatus"
Write-Host "  • Zustand: $zustandStatus"
Write-Host "  • Framer Motion: $framerStatus"
Write-Host "  • Tauri API: $tauriStatus"

# 推荐的下一步操作
Write-Host "`n🚀 推荐的下一步操作:" -ForegroundColor Yellow

if ($successRate -ge 80) {
    Write-Host "  ✅ Sprint 2 实现质量良好，可以开始功能测试" -ForegroundColor Green
    Write-Host "  • 运行 'npm run tauri dev' 启动开发环境" -ForegroundColor White
    Write-Host "  • 测试 AI 建议功能和幽灵文字显示" -ForegroundColor White
    Write-Host "  • 验证反馈面板的动画效果" -ForegroundColor White
} elseif ($successRate -ge 60) {
    Write-Host "  ⚠️ 部分功能需要修复，建议先解决失败的测试" -ForegroundColor Yellow
    Write-Host "  • 检查依赖安装: 'npm install'" -ForegroundColor White
    Write-Host "  • 修复 TypeScript 类型错误" -ForegroundColor White
    Write-Host "  • 验证文件导入路径" -ForegroundColor White
} else {
    Write-Host "  ❌ 多个核心功能未正确实现，需要全面检查" -ForegroundColor Red
    Write-Host "  • 确认所有文件都已创建" -ForegroundColor White
    Write-Host "  • 检查 package.json 依赖配置" -ForegroundColor White
    Write-Host "  • 运行完整的项目重建" -ForegroundColor White
}

Write-Host "`n=== Sprint 2 测试完成 ===" -ForegroundColor $(if ($successRate -ge 80) { "Green" } elseif ($successRate -ge 60) { "Yellow" } else { "Red" })