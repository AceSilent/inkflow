# InkFlow 项目全量审计报告

**审计日期**: 2025-12-26
**审计范围**: 全栈代码审计（前端 React + 后端 Rust）
**审计人员**: Claude Code (AI Architecture & QA Engineer)
**项目版本**: Sprint 3 完成

---

## 📑 目录

- [1. 需求覆盖度检查](#1-需求覆盖度检查)
- [2. 状态管理风险](#2-状态管理风险)
- [3. UI/UX 硬编码值](#3-uiux-硬编码值)
- [4. 文件操作风险](#4-文件操作风险)
- [5. 国际化准备度](#5-国际化准备度)
- [6. 其他发现](#6-其他发现)
- [7. 优先级总结](#7-优先级总结)
- [8. 修复工作量估算](#8-修复工作量估算)

---

## 1. 需求覆盖度检查

### 1.1 缺失的核心功能

| 优先级 | 功能模块 | 描述 | 影响范围 | 相关文件 |
|-------|---------|------|---------|---------|
| **High** | 侧边栏折叠功能 | 左右面板无法折叠，占用固定屏幕空间 | 小屏幕设备无法使用 | `Sidebar.tsx`, `RightPanel.tsx` |
| **Medium** | AI触发时长设置 | `aiTriggerDelay: 2000` 硬编码在store中，用户无法自定义 | 用户体验受限 | `editorStore.ts:104` |
| **Medium** | 创建小说工程UI | 后端 `create_new_novel` 已实现，但前端无入口 | 用户无法通过UI创建新项目 | 需新增组件 |
| **Low** | 多语言支持 (i18n) | 全部中文硬编码，无国际化框架 | 限制国际化扩展 | 全局 |
| **Low** | 主题切换 | 硬编码 dark 主题，无主题切换功能 | 用户无法个性化 | 全局 |
| **Low** | API配置UI | 需通过 `.env` 文件配置API，无可视化设置面板 | 普通用户配置门槛高 | 需新增组件 |

### 1.2 功能实现状态

#### ✅ 已完成功能
- [x] Monaco编辑器集成与沉浸式体验
- [x] AI幽灵文字建议系统
- [x] ChatGLM API集成
- [x] 本地小说工程管理（目录扫描、章节创建）
- [x] 全局大纲管理
- [x] 章节总结功能
- [x] AI讨论面板
- [x] 右侧辅助面板

#### ⚠️ 部分完成功能
- [~] 自动保存（存在重复定时器问题）
- [~] 错误处理（部分场景未覆盖）

#### ❌ 未实现功能
- [ ] 侧边栏折叠/展开
- [ ] AI触发延迟配置UI
- [ ] 创建新小说工程UI
- [ ] API密钥配置界面
- [ ] 主题切换
- [ ] 多语言支持

---

## 2. 状态管理风险

### 2.1 数据同步缺陷

| 优先级 | 问题 | 位置 | 风险描述 | 修复建议 |
|-------|------|------|---------|---------|
| **High** | 切换章节时幽灵文字未清理 | `workspaceStore.ts:206-229` | `selectChapter` 不清理 `editorStore` 的 `ghostText`，可能导致前一章的AI建议残留 | 在 `selectChapter` 中调用 `editorStore.clearGhostText()` |
| **High** | 状态隔离不足 | `editorStore.ts` & `workspaceStore.ts` | 两个Store相互独立，但 `editorStore.generateAISuggestion` 直接读取 `workspaceStore`，无事务保护 | 创建统一的 `useAppStore` 或使用 Zustand 的跨store通信模式 |
| **Medium** | 自动保存与编辑冲突 | `App.tsx:108` & `MainEditor.tsx:283` | 两处重复创建自动保存定时器，可能导致重复保存 | 移除 `App.tsx` 中的自动保存，统一在 `MainEditor` 中处理 |
| **Medium** | 章节加载状态不完整 | `workspaceStore.ts:206` | `selectChapter` 设置 `isLoading: true` 但失败时未重置 | 添加 finally 块确保状态重置 |
| **Low** | 错误状态未清理 | `workspaceStore.ts:376` | `clearError` 存在但未被调用，错误信息永久保留 | 在关键操作后调用 `clearError()` |

### 2.2 详细问题分析

#### 问题1: 幽灵文字状态泄漏

**当前代码** (`workspaceStore.ts:206-229`):
```typescript
selectChapter: async (chapter: ChapterInfo) => {
  set({ currentChapter: chapter, isLoading: true });

  try {
    const content = await invoke<string>('read_file', {
      path: chapter.path,
    });

    set({
      currentChapter: { ...chapter, word_count: content.length },
      isLoading: false,
    });

    // ❌ 问题：未清理 editorStore 的 ghostText
  } catch (error) {
    // ...
  }
}
```

**修复方案**:
```typescript
selectChapter: async (chapter: ChapterInfo) => {
  set({ currentChapter: chapter, isLoading: true });

  try {
    const content = await invoke<string>('read_file', {
      path: chapter.path,
    });

    // ✅ 修复：清理编辑器状态
    const editorState = useEditorStore.getState();
    editorState.clearGhostText();
    editorState.updateContent(content);

    set({
      currentChapter: { ...chapter, word_count: content.length },
      isLoading: false,
    });
  } catch (error) {
    // 添加 finally 确保 isLoading 重置
  } finally {
    set({ isLoading: false });
  }
}
```

#### 问题2: 自动保存重复

**位置**:
- `App.tsx:108` - `setInterval(() => { autoSave(); }, 30000)`
- `MainEditor.tsx:283` - `const autoSaveInterval = setInterval(() => { autoSave(); }, 30000)`

**修复**: 移除 `App.tsx` 中的定时器，统一由 `MainEditor` 管理。

---

## 3. UI/UX 硬编码值

### 3.1 需要提取到全局配置的数值

| 优先级 | 硬编码值 | 位置 | 建议配置项 | 默认值 |
|-------|---------|------|-----------|-------|
| **Medium** | `aiTriggerDelay: 2000` | `editorStore.ts:104` | `editor.aiTriggerDelay` | 2000ms |
| **Medium** | `30000` (自动保存) | `App.tsx:110`, `MainEditor.tsx:283` | `editor.autoSaveInterval` | 30000ms |
| **Medium** | `MIN_DISPLAY_TIME: 800` | `editorStore.ts:185` | `ai.minDisplayTime` | 800ms |
| **Medium** | `fontSize: 16` | `MainEditor.tsx:52` | `editor.fontSize` | 16px |
| **Medium** | `lineHeight: 1.8` | `MainEditor.tsx:54` | `editor.lineHeight` | 1.8 |
| **Low** | `width: 8px` (滚动条) | `MainEditor.tsx:526` | `ui.scrollbarWidth` | 8px |
| **Low** | `max_tokens: 500/800` | `EnhancedOutlinePanel.tsx:47,63` | `ai.summaryMaxTokens` | 500 |
| **Low** | `temperature: 0.7/0.8` | `EnhancedOutlinePanel.tsx:48,49` | `ai.temperature` | 0.7 |

### 3.2 颜色硬编码

| 优先级 | 硬编码颜色 | 使用频率 | 建议处理 |
|-------|-----------|---------|---------|
| **Low** | Tailwind颜色类 (gray-*, blue-*, etc.) | ~200+ 处 | 已使用Tailwind，但需定义 design tokens |
| **Low** | Monaco主题色 | `MainEditor.tsx` | 创建可配置的Monaco主题对象 |

### 3.3 建议的配置文件结构

```typescript
// src/config/editor.config.ts
export const EDITOR_CONFIG = {
  // AI 配置
  ai: {
    triggerDelay: 2000,
    minDisplayTime: 800,
    summaryMaxTokens: 500,
    temperature: 0.7,
    model: 'glm-4-plus',
  },

  // 编辑器配置
  editor: {
    fontSize: 16,
    lineHeight: 1.8,
    fontFamily: '"SF Pro Text", -apple-system, sans-serif',
    wordWrap: 'on',
    autoSaveInterval: 30000,
  },

  // UI 配置
  ui: {
    scrollbarWidth: 8,
    sidebarWidth: 320, // w-80
    rightPanelWidth: 384, // w-96
    theme: 'dark',
  },

  // 文件配置
  file: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedExtensions: ['.md', '.txt'],
  },
} as const;

// 类型安全
export type EditorConfig = typeof EDITOR_CONFIG;
```

---

## 4. 文件操作风险

### 4.1 后端安全性问题

| 优先级 | 风险 | 位置 | 严重程度 | 修复建议 |
|-------|------|------|---------|---------|
| **High** | 路径遍历攻击 | `file_system.rs:63-67` | 🔴 严重 | 添加路径白名单/沙盒检查 |
| **High** | 超大文件无限制 | `file_system.rs:229-231` | 🔴 严重 | 添加文件大小限制（10MB） |
| **High** | 空文件夹处理不完整 | `file_system.rs:119-125` | 🟡 中等 | 返回友好提示 |
| **Medium** | 并发写入冲突 | `file_system.rs:71-82` | 🟡 中等 | 使用文件锁或原子写入 |
| **Medium** | 字符编码未处理 | `file_system.rs:229` | 🟡 中等 | 添加编码检测和错误处理 |
| **Low** | 无效文件名处理 | `file_system.rs:202-226` | 🟢 轻微 | 返回错误而非默认值 |
| **Low** | 事务缺失 | `file_system.rs:390-429` | 🟢 轻微 | 使用临时目录+原子重命名 |

### 4.2 详细安全问题

#### 安全问题1: 路径遍历漏洞 (High)

**当前代码** (`file_system.rs:63-67`):
```rust
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    // ❌ 风险：未验证路径是否在允许的目录内
    // 攻击示例: "../../../etc/passwd"
    match fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}
```

**修复方案**:
```rust
#[tauri::command]
pub async fn read_file(path: String, allowed_base: String) -> Result<String, String> {
    use std::path::Path;

    // 拼接完整路径
    let full_path = Path::new(&allowed_base).join(&path);

    // 规范化路径（解析 .. 和 .）
    let canonical = fs::canonicalize(&full_path)
        .map_err(|e| format!("无法访问文件: {}", e))?;
    let base_canonical = fs::canonicalize(&allowed_base)
        .map_err(|e| format!("无法访问基础目录: {}", e))?;

    // 验证路径在允许的目录内
    if !canonical.starts_with(&base_canonical) {
        return Err("路径遍历攻击检测：尝试访问项目外的文件".to_string());
    }

    // 限制文件大小
    let metadata = fs::metadata(&canonical)?;
    if metadata.len() > 10 * 1024 * 1024 { // 10MB
        return Err("文件过大：超过10MB限制".to_string());
    }

    // 读取文件
    match fs::read_to_string(&canonical) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("无法读取文件: {}", e)),
    }
}
```

#### 安全问题2: 超大文件 DoS (High)

**当前代码** (`file_system.rs:229-231`):
```rust
// ❌ 风险：整个文件读入内存
let content = fs::read_to_string(file_path).unwrap_or_default();
let word_count = content.chars().count();
```

**修复方案**:
```rust
// ✅ 添加大小检查
let metadata = fs::metadata(file_path)
    .map_err(|e| format!("无法获取文件元数据: {}", e))?;

// 限制文件大小为 10MB
const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;
if metadata.len() > MAX_FILE_SIZE {
    return Err(format!("文件过大: {} 字节，超过限制 {} 字节",
        metadata.len(), MAX_FILE_SIZE));
}

// 读取文件
let content = fs::read_to_string(file_path)
    .map_err(|e| format!("无法读取文件: {}", e))?;
```

#### 安全问题3: 并发写入冲突 (Medium)

**当前代码** (`file_system.rs:71-82`):
```rust
// ❌ 风险：多个AI总结同时写入可能覆盖
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    // ... 省略目录创建
    match fs::write(&path, content) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write file: {}", e)),
    }
}
```

**修复方案**:
```rust
// ✅ 使用原子写入
use std::io::Write;
use std::fs::File;

#[tauri::command]
pub async fn write_file_safe(path: String, content: String) -> Result<(), String> {
    // 确保父目录存在
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建目录: {}", e))?;
    }

    // 使用临时文件 + 原子重命名
    let temp_path = format!("{}.tmp", path);

    {
        let mut file = File::create(&temp_path)
            .map_err(|e| format!("无法创建临时文件: {}", e))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("写入失败: {}", e))?;
    }

    // 原子重命名
    fs::rename(&temp_path, &path)
        .map_err(|e| format!("保存失败: {}", e))?;

    Ok(())
}
```

### 4.3 前端文件操作风险

| 问题 | 位置 | 风险 | 建议 |
|------|------|------|------|
| `alert()` 使用 | `EnhancedOutlinePanel.tsx:38,95,102` | 阻塞UI，用户体验差 | 替换为Toast通知组件 |
| 同步文件读取 | `workspaceStore.ts:211-213` | 可能阻塞UI | 添加loading状态 |
| 无取消机制 | AI请求无取消 | 用户无法中断长时间操作 | 实现AbortController |

---

## 5. 国际化准备度

### 5.1 中文硬编码统计

| 文件 | 中文文本数量 | 估计提取工时 | 示例 |
|------|-------------|-------------|------|
| `workspaceStore.ts` | ~50 处 | 2h | "工作区已打开", "加载章节失败" |
| `editorStore.ts` | ~20 处 | 1h | "上帝视角", "前情提要" |
| `App.tsx` | ~15 处 | 1h | "AI-Powered Novel Editor" |
| `Sidebar/*.tsx` | ~40 处 | 2h | "章节列表", "暂无章节" |
| `RightPanel/*.tsx` | ~35 处 | 2h | "大纲管理", "AI讨论" |
| **总计** | **~160+ 处** | **~8h** | - |

### 5.2 国际化框架评估

| 框架 | 推荐度 | 学习曲线 | TypeScript支持 | 社区活跃度 |
|------|-------|---------|---------------|-----------|
| `react-i18next` | ⭐⭐⭐⭐⭐ | 低 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| `@lingui/react` | ⭐⭐⭐⭐ | 中 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| `formatjs/react-intl` | ⭐⭐⭐⭐ | 中 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

**推荐**: `react-i18next` - 最成熟、文档完善、社区活跃。

### 5.3 接入难度评估

- **工作量**: 中等（约2-3天）
- **风险**: 低（向后兼容，可渐进式迁移）
- **技术难度**: 低

### 5.4 实施步骤

#### 步骤1: 安装依赖
```bash
pnpm add i18next react-i18next i18next-browser-languagedetector
```

#### 步骤2: 创建配置
```typescript
// src/i18n/config.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
```

#### 步骤3: 创建语言文件
```json
// src/i18n/locales/zh-CN.json
{
  "sidebar": {
    "chapterList": "章节列表",
    "outline": "大纲讨论",
    "noChapters": "暂无章节",
    "newChapter": "新建章节"
  },
  "editor": {
    "aiThinking": "AI思考中...",
    "autoSave": "自动保存已启用",
    "wordCount": "字数"
  }
}

// src/i18n/locales/en-US.json
{
  "sidebar": {
    "chapterList": "Chapter List",
    "outline": "Outline Discussion",
    "noChapters": "No chapters yet",
    "newChapter": "New Chapter"
  },
  "editor": {
    "aiThinking": "AI thinking...",
    "autoSave": "Auto-save enabled",
    "wordCount": "Word count"
  }
}
```

#### 步骤4: 替换硬编码
```tsx
// 之前
<h3>章节列表</h3>

// 之后
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
<h3>{t('sidebar.chapterList')}</h3>
```

#### 步骤5: 添加语言切换器
```tsx
// src/components/LanguageSwitcher.tsx
export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <select value={i18n.language} onChange={(e) => changeLanguage(e.target.value)}>
      <option value="zh-CN">简体中文</option>
      <option value="en-US">English</option>
    </select>
  );
};
```

---

## 6. 其他发现

### 6.1 性能问题

| 优先级 | 问题 | 位置 | 影响 | 建议 |
|-------|------|------|------|------|
| **Medium** | 无虚拟滚动 | `ChapterList.tsx:112-148` | 章节过多时卡顿 | 使用 `react-window` |
| **Low** | Monaco包过大 | `build output: 3.4MB` | 首屏加载慢 | 启用代码分割 |
| **Low** | 无缓存机制 | AI请求无缓存 | 重复请求浪费资源 | 使用 `localStorage` 缓存响应 |
| **Low** | 无防抖搜索 | 章节列表搜索（如存在） | 频繁触发计算 | 已有 `useDebounce` hook |

### 6.2 代码质量问题

| 优先级 | 问题 | 位置 | 修复建议 | 预计工时 |
|-------|------|------|---------|---------|
| **Medium** | 重复代码 | `parseOutlineText` 出现在3个文件中 | 提取为共享工具函数 | 1h |
| **Low** | 类型断言过多 | `as { content: string }` 多处使用 | 改进类型定义 | 2h |
| **Low** | Console日志未清理 | 生产环境仍有调试日志 | 使用环境变量控制 | 1h |
| **Low** | 魔法数字 | 如 `80, 237` 等 | 提取为命名常量 | 1h |

### 6.3 具体代码示例

#### 重复代码问题

**问题**: `parseOutlineText` 在以下3个文件中重复：
- `src/components/Sidebar/OutlinePanel.tsx:33-88`
- `src/components/RightPanel/EnhancedOutlinePanel.tsx:108-162`
- `src/store/workspaceStore.ts:393-427`

**解决方案**: 创建共享工具函数
```typescript
// src/utils/outlineParser.ts
export function parseOutlineText(text: string): NovelOutline {
  const lines = text.split('\n');
  const outline: NovelOutline = {
    title: '',
    summary: '',
    characters: [],
    plot_points: [],
    world_setting: '',
  };

  // ... 统一解析逻辑

  return outline;
}

// 在各处导入使用
import { parseOutlineText } from '../../utils/outlineParser';
```

---

## 7. 优先级总结

### 7.1 必须立即修复 (High Priority)

| ID | 问题 | 类型 | 预计工时 | 修复顺序 |
|----|------|------|---------|---------|
| H1 | 路径遍历漏洞 | 安全 | 2h | 1 |
| H2 | 幽灵文字状态泄漏 | 状态管理 | 1h | 2 |
| H3 | 超大文件无限制 | 安全 | 1h | 3 |
| H4 | 并发写入冲突 | 安全 | 2h | 4 |

**总计**: 6工时 (1个工作日)

### 7.2 近期应修复 (Medium Priority)

| ID | 问题 | 类型 | 预计工时 | 修复顺序 |
|----|------|------|---------|---------|
| M1 | 侧边栏折叠功能 | 功能缺失 | 4h | 5 |
| M2 | 创建小说UI | 功能缺失 | 3h | 6 |
| M3 | API配置UI | 功能缺失 | 4h | 7 |
| M4 | AI触发时长配置 | 功能缺失 | 2h | 8 |
| M5 | 状态隔离改进 | 架构 | 4h | 9 |
| M6 | 虚拟滚动 | 性能 | 3h | 10 |
| M7 | 自动保存重复 | Bug | 1h | 11 |
| M8 | 配置值提取 | 代码质量 | 2h | 12 |

**总计**: 23工时 (3个工作日)

### 7.3 长期改进 (Low Priority)

| ID | 问题 | 类型 | 预计工时 | 修复顺序 |
|----|------|------|---------|---------|
| L1 | 国际化支持 | 功能缺失 | 16h | 13 |
| L2 | 主题切换 | 功能缺失 | 6h | 14 |
| L3 | 代码重构 | 可维护性 | 5h | 15 |
| L4 | 缓存机制 | 性能 | 4h | 16 |
| L5 | Monaco代码分割 | 性能 | 3h | 17 |
| L6 | 清理Console日志 | 代码质量 | 1h | 18 |

**总计**: 35工时 (约5个工作日)

---

## 8. 修复工作量估算

### 8.1 总工时统计

| 优先级 | 问题数量 | 预计工时 | 建议时间 |
|-------|---------|---------|---------|
| High | 4 | 6h | 1个工作日 |
| Medium | 8 | 23h | 3个工作日 |
| Low | 6 | 35h | 5个工作日 |
| **总计** | **18** | **64h** | **9个工作日** |

### 8.2 建议修复计划

#### Sprint 3.1: 安全与稳定性 (Week 1)
- ✅ H1: 路径遍历漏洞修复 (2h)
- ✅ H2: 幽灵文字状态泄漏 (1h)
- ✅ H3: 超大文件限制 (1h)
- ✅ H4: 并发写入保护 (2h)
- ✅ M7: 自动保存重复 (1h)
- ✅ M8: 配置值提取 (2h)

**交付物**:
- 安全漏洞修复
- 状态同步问题解决
- 全局配置文件

#### Sprint 3.2: 功能完善 (Week 2)
- ⏳ M1: 侧边栏折叠 (4h)
- ⏳ M2: 创建小说UI (3h)
- ⏳ M3: API配置UI (4h)
- ⏳ M4: AI触发配置 (2h)
- ⏳ M5: 状态隔离改进 (4h)
- ⏳ M6: 虚拟滚动 (3h)

**交付物**:
- 完整的用户界面
- 可配置的编辑器设置
- 性能优化

#### Sprint 3.3: 国际化与优化 (Week 3)
- 📋 L1: 国际化支持 (16h)
- 📋 L2: 主题切换 (6h)
- 📋 L3: 代码重构 (5h)
- 📋 L4: 缓存机制 (4h)
- 📋 L5: Monaco分割 (3h)
- 📋 L6: 清理日志 (1h)

**交付物**:
- 多语言支持
- 主题系统
- 性能优化
- 代码质量提升

### 8.3 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 工期延误 | 中 | 高 | 预留20%缓冲时间 |
| 兼容性问题 | 低 | 中 | 充分测试，保留回滚方案 |
| 新bug引入 | 中 | 中 | Code Review + 单元测试 |
| 性能回归 | 低 | 低 | 性能基准测试 |

---

## 9. 附录

### 9.1 审计方法论

本次审计采用的方法：
1. **静态代码分析** - 手动代码审查
2. **模式匹配** - 搜索已知反模式
3. **需求对比** - 对照设计文档
4. **安全扫描** - 路径遍历、注入等
5. **性能分析** - Bundle分析、渲染路径

### 9.2 工具清单

- **编辑器**: VS Code
- **搜索**: Grep/Ripgrep
- **类型检查**: TypeScript Compiler
- **构建检查**: Vite Build
- **后端检查**: Cargo Check

### 9.3 参考文档

- `InkFlow-Technical-Design-Document.md`
- `CLAUDE.md`
- `SPRINT2_IMPLEMENTATION.md`
- Tauri 官方文档
- React 最佳实践

### 9.4 审计人员签名

**审计人**: Claude Code (AI Assistant)
**审计日期**: 2025-12-26
**下次审计建议**: Sprint 4 开始前

---

## 10. 变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| 1.0 | 2025-12-26 | 初始版本，完整审计报告 | Claude Code |

---

**报告结束**

如需针对任何问题生成详细的修复代码，请参考对应的优先级编号 (H1-H4, M1-M8, L1-L6)。
