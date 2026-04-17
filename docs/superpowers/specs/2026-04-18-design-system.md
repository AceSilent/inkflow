# 设计系统 · 文学刊物 Aesthetic

**Spec Date**: 2026-04-18
**Scope**: 全站视觉语言（跨页面）
**Status**: Design locked, pending implementation plan

## 目的

把 AutoNovel-Studio 的前端从"通用工具界面"重定位为"文学刊物编辑室"。所有页面（Sidebar、TitleBar、TabBar、BrainstormPanel、AuthorChat、Outline、Chapter Workbench、Settings）共享同一套视觉语言，让产品在用户第一眼就传递"这是作家工作的地方"。

这份 spec **只定义视觉语言**（tokens + 签名组件 + 字体）。功能层改动不在此 spec 内。

## 美学方向

**Literary Journal · 文学刊物**。灵感：《纽约客》、《人间》、独立文学杂志。不是"AI 产品"气质，是"人在办刊"气质。

### 不要做什么

- 不用 Inter / Roboto / 通用系统字
- 不用紫色渐变、霓虹紫
- 不用圆角 12px 以上（会显产品化）
- 不用 macOS glass morphism
- 不堆 emoji 做装饰

## 调色板

### Light 默认主题
| Token | Hex | 用途 |
|---|---|---|
| `--bg` | `#f4ede0` | 主底色（奶油纸） |
| `--bg-elevated` | `#faf5ea` | 卡片/浮层 |
| `--bg-subtle` | `#ebe3d3` | 次级区块/hover |
| `--ink` | `#1a1411` | 主文字（深墨） |
| `--ink-secondary` | `#6a5a4d` | 次要文字（暖灰） |
| `--ink-muted` | `#9a8e7f` | 辅助文字 |
| `--accent` | `#8a2e1a` | 赤氧红（强调、首字母、on-state） |
| `--accent-soft` | `rgba(138,46,26,0.08)` | 赤氧红背景态 |
| `--border-strong` | `#1a1411` | 主分隔线（hairline 单线） |
| `--border-subtle` | `rgba(26,20,17,0.18)` | 次分隔 |
| `--success` | `#2d5a3d` | 审核通过/approved |
| `--warning` | `#a06820` | severity 3 |
| `--danger` | `#8a2e1a` | severity 4+（复用 accent） |

### Dark 备选主题（Library Espresso）
| Token | Hex | 用途 |
|---|---|---|
| `--bg` | `#1f1712` | 深咖啡底 |
| `--bg-elevated` | `#2a1f18` | 卡片/浮层 |
| `--bg-subtle` | `#2f241c` | 次级/hover |
| `--ink` | `#e6d5b8` | 主文字（做旧羊皮纸） |
| `--ink-secondary` | `#8a7a64` | 次要文字 |
| `--ink-muted` | `#6a5a4a` | 辅助文字 |
| `--accent` | `#b04a30` | 砖红 |
| `--accent-soft` | `rgba(176,74,48,0.15)` | 砖红背景态 |
| `--gold` | `#d4a444` | 古籍金（标题、on-state、用于拉层次） |
| `--border-strong` | `rgba(230,213,184,0.35)` | 主分隔 |
| `--border-subtle` | `rgba(230,213,184,0.15)` | 次分隔 |
| `--success` | `#6a9670` | approved |
| `--warning` | `#d4a444` | severity 3（复用金） |
| `--danger` | `#c85c3c` | severity 4+ |

**说明**：
- Light 只有 4 个主色（底/墨/红/灰），留白承载气质
- Dark 多出 `--gold` 一个层次，这是 Dark 版的签名色；Light 版没有对应物，保持 Light 的极简
- 5 审稿人色盘（设定/节奏/文风/角色/因果）在两套主题都独立定义（见下方）

### 5 审稿人色盘（与主色区分）

Light / Dark 共用（数值上保持区分度）：

| 审稿人 | Light hue | Dark hue |
|---|---|---|
| 设定 (lore) | `#a04820` 橙棕 | `#d4823c` 亮橙 |
| 节奏 (pacing) | `#3a6890` 墨蓝 | `#70a0d0` 亮蓝 |
| 文风 (ai_tone) | `#6a4890` 墨紫 | `#a080d0` 亮紫 |
| 角色 (character) | `#4a7848` 墨绿 | `#80b080` 亮绿 |
| 因果 (causality) | `#8a5028` 赭石 | `#d09050` 赭金 |
| 用户批注 | `#2d5a3d` forest | `#6a9670` 冷松 |

审稿人颜色用于正文高亮下划线 + 右栏评论作者名色。

## 字体系统

```css
/* Fraunces — 可变衬线（标题、装饰、罗马数字、小大写标签） */
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..900,0..100&display=swap');

/* Noto Serif SC — 中文正文 */
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300..900&display=swap');
```

### 字族分配

- `--font-display: "Fraunces", "Noto Serif SC", Georgia, serif`
  - 标题、章节名、品牌 wordmark
  - 推荐用法：`font-variation-settings: "opsz" 144, "SOFT" 50`（大号时柔和收笔）

- `--font-body: "Noto Serif SC", "Fraunces", Georgia, serif`
  - 正文阅读、对话、评论文本
  - 建议：`font-weight: 400`，行高 `1.85`

- `--font-label: "Fraunces", serif` with `font-variant: small-caps`
  - UI 标签（卷名、状态、状态栏）
  - 大写 + `letter-spacing: 0.22em` + `font-weight: 500`

- `--font-mono` 暂不单独引入；如有代码片段用系统 `ui-monospace`

### 字号阶梯

| Token | Size | 用途 |
|---|---|---|
| `--fs-hero` | `34px` | 章节首页主标题 |
| `--fs-display` | `22px` | Tab 内页面主标题 |
| `--fs-heading` | `16px` | 区块标题 |
| `--fs-body` | `13px` | 正文 |
| `--fs-small` | `11px` | 次要信息 |
| `--fs-label` | `9px` | 小大写标签（配 `letter-spacing: 0.22em`） |

## 签名组件（Typography Primitives）

这些是文学刊物气质的核心标识。放在 `frontend/src/typography.css`，以工具类 + 组件类形式提供。

### 1. 首字母下沉（Drop Cap）

段落首字母放大、下沉、赤色。用于章节正文第一段、chat 回复首段、长段评论等。

```css
.drop-cap::first-letter {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 34px;
  float: left;
  margin-right: 4px;
  line-height: 0.9;
  color: var(--accent);
  text-indent: 0;
}
```

### 2. 竖排侧标签（Vertical Rail）

左侧垂直竖排的小大写标签，显示"Ch. i / xvi"之类定位。用于 Chapter Workbench 最左列、Outline 卷边。

```css
.rail-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-family: var(--font-label);
  font-variant: small-caps;
  font-size: var(--fs-label);
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--accent);
}
```

### 3. 罗马数字徽章

所有章节/卷号/页码显示为罗马数字（"Ch. I / XVI"、"Rev. III"、"第 i 卷"）。数据层仍是阿拉伯数字，渲染时转换。

提供工具函数 `toRoman(n: number): string` 在 `frontend/src/utils/roman.ts`。

应用位置：Tab 标签、状态栏、卷/章侧边树。

### 4. 题词（Epigraph）

章节/页面副标题下方的斜体引言块。单条细线左边界。

```css
.epigraph {
  font-style: italic;
  font-size: var(--fs-small);
  color: var(--ink-secondary);
  border-left: 1px solid var(--border-strong);
  padding-left: 8px;
  margin-bottom: 12px;
}
```

### 5. Hairline 分隔

所有分隔线默认 `1px solid var(--border-strong)`，不使用 box-shadow 或多像素边界。少数需要强调的区域（如工作台顶栏/底栏）用 hairline 全宽。

### 6. 品牌 Wordmark

标题栏的品牌字样。用 Fraunces 300 + 斜体 + 首字母 `SOFT 100`（柔和收笔）+ 中间点分隔：

```
AutoNovel · Studio
```

## Motion

克制。整个产品只在三处用动画：

1. **进入动画**：Tab 打开时内容 `fade + translateY(4px)` 180ms ease-out，错开子元素 20ms
2. **Agent 写入 spin**：工作台锁定态中央 spin，12 瓣 Fraunces "✱" 字符旋转 1.2s linear（不用通用 loading-spinner）
3. **hover / focus**：所有交互元素 100ms 颜色过渡

不要：弹性缓动（bounce）、视差滚动、滚动触发装饰动画、打字机文字进入效果（流式本身已有字符增长，不叠加）。

## 装饰细节（可选但建议）

### 纸面纹理（Light）

Light 底色上叠加 **极低强度** 辐射渐变模拟纸面质感：

```css
body::before {
  content: "";
  position: fixed; inset: 0;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(138,46,26,0.03) 0%, transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(26,20,17,0.04) 0%, transparent 40%);
  pointer-events: none;
  z-index: 0;
}
```

### 胶片噪点（Dark）

Dark 底色上叠加 **2% alpha** SVG turbulence 噪点做夜灯颗粒：

```css
body[data-theme="dark"]::before {
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence baseFrequency='0.9'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  opacity: 0.025;
}
```

## 组件级改造清单

以下组件在 implementation plan 阶段会按上述 tokens + 签名组件全部重写视觉层（保留行为逻辑）：

| 组件 | 主要改动 |
|---|---|
| `App.jsx` titlebar | 品牌 wordmark（Fraunces italic + SOFT），hairline 底边 |
| `ActivityBar.jsx` | 竖排小大写标签替代图标 tooltip |
| `Sidebar.jsx` | 卷用罗马数字 + 首字母下沉章节卡；Hairline 分隔 |
| `TabBar.jsx` | Tab 标签用 Fraunces small-caps；on-state 下划线（赤色） |
| `BrainstormPanel.jsx` | 题词式介绍 + drop cap 首段 |
| `AuthorChatPanel.jsx` | 回复首段 drop cap；工具调用徽章用 label 字体 |
| `OutlineTreeEditor.jsx` | 将在 outline spec 中重新设计（本 spec 暂不动） |
| `ChapterEditor.jsx` | 将在 Chapter Workbench spec 中被替换 |
| `SettingsPanel.jsx` | 区块标题用 display；表单标签小大写 |
| `NewBookModal.jsx` | Modal 用 hairline 粗边 + drop cap 标题 |
| `Toast.jsx` | 不改行为，仅改色到 tokens |

## 新增文件

- `frontend/src/design-tokens.css` — `:root` / `[data-theme="dark"]` 变量定义
- `frontend/src/typography.css` — 签名组件样式类（drop-cap / rail-label / epigraph 等）
- `frontend/src/utils/roman.ts` — 数字→罗马数字转换

## 主题切换

现有 `useTheme.js` hook 保留。`data-theme` 属性由它控制，两套 token 通过 CSS 变量自动切换。首次加载默认 Light。

## 不在本 spec 范围

- 具体功能重构（Chapter Workbench 独立 spec；Outline、Plot Tree 后续 spec）
- 国际化 / 多语言扩展
- 无障碍（a11y）审计 —— 下一轮做
- 打印样式

## 验收标准

1. 两套主题无缝切换，所有组件无硬编码颜色
2. 字体加载完成前有合适的 fallback（`Georgia` / serif）
3. Light 模式在白天 sRGB 显示器上，正文对比度 ≥ 7:1（WCAG AAA）
4. Dark 模式在夜间 OLED 显示器上，正文对比度 ≥ 7:1
5. 首字母下沉、罗马数字、竖排标签在至少 3 个页面出现（标题栏/侧栏/内页）
6. 无通用 AI 气质元素（紫渐变、无衬线、圆角 16px+）
