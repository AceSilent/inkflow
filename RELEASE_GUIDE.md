# 🚀 InkFlow 发布指南

本文档说明如何使用 GitHub Actions 自动构建并发布 InkFlow 的多平台安装包。

## ✅ 配置检查清单

- [x] `.github/workflows/release.yml` - GitHub Actions 配置
- [x] `src-tauri/tauri.conf.json` - Tauri 配置
- [x] `src-tauri/icons/` - 应用图标（所有平台）
- [x] 版本号：`0.1.0`（开发中）

## 📦 支持的平台

| 平台 | 架构 | 输出格式 |
|------|------|---------|
| **Windows** | x64 | `.msi` (安装程序) + `.exe` (NSIS 安装程序) |
| **macOS** | Intel (x64) | `.dmg` |
| **macOS** | Apple Silicon (M1/M2/M3) | `.dmg` |
| **Linux** | x64 | `.deb` (Debian/Ubuntu) + `.AppImage` (通用) |

## 🎯 发布步骤

### 第一步：更新版本号

编辑 `src-tauri/tauri.conf.json`：

```json
{
  "package": {
    "productName": "InkFlow",
    "version": "0.1.0" // 修改为你的新版本号
  }
}
```

**版本号格式建议：**
- `0.1.0` - 第一个公开版本
- `0.1.1` - Bug 修复版本
- `0.2.0` - 新功能版本
- `1.0.0` - 稳定版本

### 第二步：提交代码

```bash
git add .
git commit -m "chore: bump version to 0.1.0"
git push origin master
```

### 第三步：创建版本标签

```bash
git tag v0.1.0
git push origin v0.1.0
```

**重要：** 标签必须以 `v` 开头，后跟版本号（如 `v0.1.0`、`v1.0.0`）

### 第四步：监控构建进度

1. 打开 GitHub 项目页面
2. 点击 **Actions** 选项卡
3. 你会看到 `Release InkFlow` 工作流正在运行

**预计构建时间：**
- Windows: ~10 分钟
- macOS (Intel): ~12 分钟
- macOS (Apple Silicon): ~12 分钟
- Linux: ~8 分钟

总计约 **15-20 分钟**（四个平台并行构建）

### 第五步：检查并发布 Release

1. 构建完成后，点击 **Releases** 选项卡
2. 你会看到一个标题为 `InkFlow v0.1.0` 的**草稿 (Draft)**
3. 点击进入，检查以下内容：
   - ✅ 所有平台的安装包都已上传
   - ✅ 文件大小合理（通常 50-150MB）
   - ✅ 自动生成的更新日志正确
4. 确认无误后，点击右上角的 **Publish release** 按钮

## 📂 用户下载方式

发布后，用户可以在 Releases 页面下载对应平台的安装包：

### Windows 用户
- `InkFlow_0.1.0_x64_en-US.msi` - 推荐（Windows 安装程序）
- `InkFlow_0.1.0_x64-setup.exe` - NSIS 安装程序

### macOS 用户
- `InkFlow_0.1.0_x64.dmg` - Intel Mac
- `InkFlow_0.1.0_aarch64.dmg` - Apple Silicon Mac (M1/M2/M3)

### Linux 用户
- `inkflow_0.1.0_amd64.deb` - Debian/Ubuntu 用户
- `InkFlow_0.1.0.appimage` - 通用 Linux 格式

## 🔄 更新现有版本

当你想发布新版本时：

1. **更新版本号**（如 `0.1.0` → `0.1.1`）
2. **提交代码**
3. **创建新标签**（如 `v0.1.1`）
4. **自动构建并发布**

## ⚠️ 注意事项

### 首次发布前

1. ✅ 确保所有图标文件都存在
2. ✅ 测试应用在本地能正常运行
3. ✅ 检查 `tauri.conf.json` 中的应用信息
4. ✅ 确保 `.gitignore` 已正确配置（避免上传敏感信息）

### Windows 证书

当前配置 `certificateThumbprint: null`，适合个人开发：
- ✅ 用户安装时会显示"未知发布者"警告（正常）
- ❌ 如果你有代码签名证书，可以在 `tauri.conf.json` 中配置

### macOS 签名

当前配置 `signingIdentity: null`：
- ✅ 可以正常安装和运行
- ⚠️ 用户需要右键点击 .dmg 文件，选择"打开"才能安装（macOS 安全机制）
- ❌ 如果你有 Apple Developer 账号，可以配置签名以避免警告

## 🧪 测试构建（不发布）

如果你想测试构建流程但不发布，可以：

```bash
# 本地构建单个平台
npm run tauri build

# 或者手动触发 GitHub Actions（不创建 tag）
# 在 GitHub 网页上：Actions → Release InkFlow → Run workflow
```

## 📚 相关资源

- [Tauri 官方文档](https://tauri.app/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [语义化版本控制](https://semver.org/lang/zh-CN/)

---

**Happy Coding! 🎉**
