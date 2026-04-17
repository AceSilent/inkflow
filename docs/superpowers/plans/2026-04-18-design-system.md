# Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refit the frontend with a "literary journal" aesthetic (Fraunces + Noto Serif SC, cream/ink light + espresso/gold dark), centralize all visual tokens, and retrofit existing components to use them.

**Architecture:** Two layers — (1) `design-tokens.css` defines CSS variables for both themes and all colors/typography; (2) `typography.css` provides signature component classes (drop-cap, rail-label, epigraph). Existing components stop hardcoding colors and reference tokens instead. Fonts load via `<link>` preload in `index.html`.

**Tech Stack:** React 19 + Vite 8; Google Fonts (Fraunces, Noto Serif SC); no new dependencies.

Spec reference: `docs/superpowers/specs/2026-04-18-design-system.md`

**Testing approach:** This plan is CSS-only + small utility function. Frontend has no existing test runner. Per user's testing standard (browser smoke test required), the acceptance criteria for visual tasks is **a browser smoke check**: after each component task, start the Vite dev server and verify the change in a real browser (check colors, fonts, drop cap rendering, theme switch). One unit test task is added for the `toRoman()` utility (pure function, easy to test).

---

## Task 0: Preflight — create frontend test harness for the one utility we're adding

**Files:**
- Create: `frontend/vitest.config.js`
- Modify: `frontend/package.json` — add test script + vitest devDep

- [ ] **Step 1: Add vitest as a devDependency**

```bash
cd frontend && npm install -D vitest
```

- [ ] **Step 2: Create `frontend/vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,ts,jsx,tsx}'],
  },
})
```

- [ ] **Step 3: Add test script to `frontend/package.json`**

In the `"scripts"` object, add:

```json
"test": "vitest run"
```

Keep existing scripts unchanged.

- [ ] **Step 4: Verify vitest runs with zero tests found**

Run: `cd frontend && npm test`

Expected: exits with `No test files found` or 0 tests — not an error.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.js
git commit -m "chore(frontend): add vitest for utility tests"
```

---

## Task 1: `toRoman()` utility with tests

**Files:**
- Create: `frontend/src/utils/roman.ts`
- Create: `frontend/src/utils/roman.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/roman.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toRoman } from './roman'

describe('toRoman', () => {
  it('returns empty string for 0 or negative', () => {
    expect(toRoman(0)).toBe('')
    expect(toRoman(-1)).toBe('')
  })

  it('converts 1-10 correctly', () => {
    const expected = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
    for (let i = 1; i <= 10; i++) {
      expect(toRoman(i)).toBe(expected[i - 1])
    }
  })

  it('handles tens', () => {
    expect(toRoman(14)).toBe('XIV')
    expect(toRoman(40)).toBe('XL')
    expect(toRoman(90)).toBe('XC')
  })

  it('handles hundreds (chapter counts up to 300+)', () => {
    expect(toRoman(100)).toBe('C')
    expect(toRoman(137)).toBe('CXXXVII')
    expect(toRoman(399)).toBe('CCCXCIX')
  })

  it('caps at 3999 by returning the input as string when out of range', () => {
    expect(toRoman(5000)).toBe('5000')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd frontend && npx vitest run src/utils/roman.test.ts`

Expected: FAIL with `Cannot find module './roman'`.

- [ ] **Step 3: Implement `toRoman`**

Create `frontend/src/utils/roman.ts`:

```ts
const PAIRS: Array<[number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
]

export function toRoman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n > 3999) return String(n)
  let rest = Math.floor(n)
  let out = ''
  for (const [val, sym] of PAIRS) {
    while (rest >= val) {
      out += sym
      rest -= val
    }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd frontend && npx vitest run src/utils/roman.test.ts`

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/roman.ts frontend/src/utils/roman.test.ts
git commit -m "feat(frontend): add toRoman utility with tests"
```

---

## Task 2: Google Fonts preload in `index.html`

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Open `frontend/index.html` and locate the `<head>` section**

- [ ] **Step 2: Add Google Fonts preload + stylesheet links inside `<head>`**

Add these lines immediately after the `<meta charset>` / `<title>` block:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,0..100;1,9..144,300..900,0..100&family=Noto+Serif+SC:wght@300..900&display=swap" rel="stylesheet">
```

- [ ] **Step 3: Start the dev server and smoke-check fonts load**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`, open DevTools → Network → filter "font". Verify `Fraunces-*.woff2` and `NotoSerifSC-*.woff2` both load (status 200). If either fails, check network / CDN.

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html
git commit -m "feat(frontend): preload Fraunces + Noto Serif SC"
```

---

## Task 3: `design-tokens.css` — both themes

**Files:**
- Create: `frontend/src/design-tokens.css`
- Modify: `frontend/src/index.css` — import the new file at top

- [ ] **Step 1: Create `frontend/src/design-tokens.css` with the full token set**

```css
/* Design tokens · Literary Journal aesthetic
 * Spec: docs/superpowers/specs/2026-04-18-design-system.md
 * Light theme is the default. data-theme="dark" activates Library Espresso.
 */

:root {
  /* ── Palette (Light: cream paper + ink) ── */
  --bg: #f4ede0;
  --bg-elevated: #faf5ea;
  --bg-subtle: #ebe3d3;
  --ink: #1a1411;
  --ink-secondary: #6a5a4d;
  --ink-muted: #9a8e7f;
  --accent: #8a2e1a;
  --accent-soft: rgba(138, 46, 26, 0.08);
  --border-strong: #1a1411;
  --border-subtle: rgba(26, 20, 17, 0.18);
  --success: #2d5a3d;
  --warning: #a06820;
  --danger: #8a2e1a;

  /* ── 5-reviewer palette (Light) ── */
  --reviewer-lore: #a04820;
  --reviewer-pacing: #3a6890;
  --reviewer-ai-tone: #6a4890;
  --reviewer-character: #4a7848;
  --reviewer-causality: #8a5028;
  --reviewer-user: #2d5a3d;

  /* ── Typography ── */
  --font-display: "Fraunces", "Noto Serif SC", Georgia, serif;
  --font-body: "Noto Serif SC", "Fraunces", Georgia, serif;
  --font-label: "Fraunces", serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;

  /* ── Font sizes ── */
  --fs-hero: 34px;
  --fs-display: 22px;
  --fs-heading: 16px;
  --fs-body: 13px;
  --fs-small: 11px;
  --fs-label: 9px;
}

[data-theme="dark"] {
  /* ── Palette (Dark: Library Espresso) ── */
  --bg: #1f1712;
  --bg-elevated: #2a1f18;
  --bg-subtle: #2f241c;
  --ink: #e6d5b8;
  --ink-secondary: #8a7a64;
  --ink-muted: #6a5a4a;
  --accent: #b04a30;
  --accent-soft: rgba(176, 74, 48, 0.15);
  --gold: #d4a444;
  --border-strong: rgba(230, 213, 184, 0.35);
  --border-subtle: rgba(230, 213, 184, 0.15);
  --success: #6a9670;
  --warning: #d4a444;
  --danger: #c85c3c;

  /* ── 5-reviewer palette (Dark) ── */
  --reviewer-lore: #d4823c;
  --reviewer-pacing: #70a0d0;
  --reviewer-ai-tone: #a080d0;
  --reviewer-character: #80b080;
  --reviewer-causality: #d09050;
  --reviewer-user: #6a9670;
}

body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: var(--fs-body);
  line-height: 1.7;
  position: relative;
}

/* Paper texture (Light) */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(138, 46, 26, 0.03) 0%, transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(26, 20, 17, 0.04) 0%, transparent 40%);
}

/* Grain texture (Dark) */
body[data-theme="dark"]::before {
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence baseFrequency='0.9'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  opacity: 0.025;
}
```

- [ ] **Step 2: Import design-tokens.css at the top of `frontend/src/index.css`**

Open `frontend/src/index.css`. Add at the very top:

```css
@import "./design-tokens.css";
```

- [ ] **Step 3: Start dev server and smoke check light theme**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`. Visually check:
- Background is cream/paper (`#f4ede0`), not grey/white
- Text is deep ink, not black
- Body font has serif feel (Noto Serif SC loaded)

Expected if not applied yet: existing hardcoded colors will override. This is fixed in later tasks.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/design-tokens.css frontend/src/index.css
git commit -m "feat(frontend): add design tokens for both themes"
```

---

## Task 4: `typography.css` — signature component classes

**Files:**
- Create: `frontend/src/typography.css`
- Modify: `frontend/src/index.css` — import the new file after design-tokens.css

- [ ] **Step 1: Create `frontend/src/typography.css`**

```css
/* Signature typography primitives · Literary Journal aesthetic
 * Spec: docs/superpowers/specs/2026-04-18-design-system.md
 */

/* ── Drop cap: apply to a <p> element whose first letter should sink ── */
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

/* ── Vertical rail label: small-caps, vertical orientation ── */
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

/* ── Epigraph: italic quote block with left hairline ── */
.epigraph {
  font-style: italic;
  font-size: var(--fs-small);
  color: var(--ink-secondary);
  border-left: 1px solid var(--border-strong);
  padding-left: 8px;
  margin-bottom: 12px;
}

/* ── Hairline: horizontal 1px divider ── */
.hairline {
  border: 0;
  border-top: 1px solid var(--border-strong);
  margin: 12px 0;
}

/* ── Wordmark brand: Fraunces italic with soft first letter ── */
.wordmark {
  font-family: var(--font-display);
  font-weight: 300;
  font-style: italic;
  font-size: var(--fs-heading);
  letter-spacing: -0.02em;
}
.wordmark::first-letter {
  font-size: 22px;
  font-variation-settings: "SOFT" 100;
}

/* ── Small-caps label for UI (status bar, chapter numbers) ── */
.label-sc {
  font-family: var(--font-label);
  font-variant: small-caps;
  font-size: var(--fs-label);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-weight: 500;
}

/* ── Display headings ── */
.display-hero {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: var(--fs-hero);
  font-variation-settings: "opsz" 144;
  margin: 0 0 4px;
}
.display-heading {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-display);
  font-style: italic;
  margin: 0;
}
```

- [ ] **Step 2: Import typography.css after design-tokens in `frontend/src/index.css`**

Add below the existing `@import "./design-tokens.css";`:

```css
@import "./typography.css";
```

- [ ] **Step 3: Smoke-check classes work in the dev server**

Open DevTools console on a page with the app running. In the elements panel, select any `<p>` and temporarily add class `drop-cap`. Verify the first letter enlarges and colors red.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/typography.css frontend/src/index.css
git commit -m "feat(frontend): add signature typography components"
```

---

## Task 5: Retrofit `App.jsx` titlebar with wordmark

**Files:**
- Modify: `frontend/src/App.jsx:86-103` (the titlebar block)
- Modify: `frontend/src/App.css` — remove hardcoded colors from `.titlebar`, `.titlebar-brand` etc.

- [ ] **Step 1: Read current titlebar markup**

```bash
sed -n '86,103p' frontend/src/App.jsx
```

- [ ] **Step 2: Replace titlebar JSX**

In `frontend/src/App.jsx`, replace the `<header className="titlebar">` block with:

```jsx
<header className="titlebar">
  <div className="titlebar-brand">
    <BookOpen size={16} />
    <span className="wordmark">AutoNovel · Studio</span>
    <span className="label-sc" style={{ opacity: 0.4 }}>{t('app.version')}</span>
  </div>
  <div className="titlebar-actions">
    <button className="btn-icon" onClick={switchLang} title={t('settings.language')}>
      <Languages size={15} />
    </button>
    <button className="btn-icon" onClick={toggleTheme} title={t('settings.theme')}>
      {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
    </button>
    <button className="btn-icon" onClick={() => handleActivityClick('settings')} title={t('nav.settings')}>
      <Settings size={15} />
    </button>
  </div>
</header>
```

- [ ] **Step 3: Update `frontend/src/App.css` — point `.titlebar` at tokens**

Find the `.titlebar` block. Replace its `background`, `color`, `border-bottom` values to reference tokens:

```css
.titlebar {
  background: var(--bg-elevated);
  color: var(--ink);
  border-bottom: 1px solid var(--border-strong);
  /* keep other properties (display, height, padding) as they were */
}
```

Remove any hardcoded colors (`#...`, `rgb(...)`) within `.titlebar`, `.titlebar-brand`, `.titlebar-actions` — use `var(--...)` in their place. Leave layout properties (flex, gap, padding) untouched.

- [ ] **Step 4: Smoke test — light + dark**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`. Check:
- Wordmark "AutoNovel · Studio" is italic Fraunces, "A" is slightly larger and softer
- Version label is small-caps, faint
- Click theme toggle → colors switch correctly (cream → espresso)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.css
git commit -m "feat(frontend): titlebar wordmark with Fraunces italic"
```

---

## Task 6: Retrofit `ActivityBar.jsx`

**Files:**
- Modify: `frontend/src/components/ActivityBar.jsx`
- Modify: `frontend/src/App.css` — `.activity-bar` style

- [ ] **Step 1: Read current ActivityBar**

```bash
cat frontend/src/components/ActivityBar.jsx
```

- [ ] **Step 2: Update tooltips to use `label-sc` class for typography consistency (no markup change beyond adding `className="label-sc"` on the `title` or tooltip element if any)**

If the component uses native `title` attributes only, no JSX change needed. If it uses custom tooltip spans, wrap their text with `className="label-sc"`.

Apply this regex-style find-replace (manual verification required):
- Any inline `style={{ color: '#...' }}` on icon buttons → remove, let CSS tokens drive color
- Add `aria-label` where missing (optional polish)

- [ ] **Step 3: Update `.activity-bar` in `frontend/src/App.css`**

Replace hardcoded colors with tokens:

```css
.activity-bar {
  background: var(--bg-subtle);
  border-right: 1px solid var(--border-strong);
  /* keep display, width, padding as-is */
}
.activity-bar button { color: var(--ink-secondary); }
.activity-bar button:hover { color: var(--accent); background: var(--accent-soft); }
.activity-bar button.active { color: var(--accent); }
```

- [ ] **Step 4: Smoke test**

Dev server running. Verify: ActivityBar column is `--bg-subtle` (slightly darker than main); hover icon → accent red + soft bg; active icon → stays red.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ActivityBar.jsx frontend/src/App.css
git commit -m "feat(frontend): ActivityBar uses design tokens"
```

---

## Task 7: Retrofit `Sidebar.jsx`

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.css` — sidebar styles

- [ ] **Step 1: Read current Sidebar**

```bash
cat frontend/src/components/Sidebar.jsx
```

- [ ] **Step 2: Convert volume/chapter label rendering to use roman numerals**

Import the utility at the top of the file:

```jsx
import { toRoman } from '../utils/roman'
```

Find where volume and chapter items render (likely a tree node component inside Sidebar). For volumes, prepend `toRoman(index + 1)` + `.` formatted with `label-sc` class. For chapters, likewise.

Example pattern — find a volume render like:
```jsx
<span>{vol.label}</span>
```

Change to:
```jsx
<span><span className="label-sc" style={{ color: 'var(--accent)', marginRight: 6 }}>Vol. {toRoman(volIdx + 1)}</span>{vol.label}</span>
```

Chapter row similarly prepend `<span className="label-sc">{toRoman(chIdx + 1)}.</span>` before the label.

- [ ] **Step 3: Update `.sidebar`, `.sidebar-tree-*` in App.css with tokens**

Replace any hardcoded `#...` colors in these selectors with `var(--...)` equivalents. Apply:
- `.sidebar` background → `var(--bg)`
- Tree item text → `var(--ink)`
- Tree item hover → `var(--accent-soft)`
- Active/selected item → `color: var(--accent)`
- Tree item border → `var(--border-subtle)`

- [ ] **Step 4: Smoke test in browser**

Create a book with 2+ volumes, 3+ chapters. Verify:
- Volumes display as "Vol. I · 卷名" / "Vol. II · 卷名"
- Chapters display as "I. 章名" / "II. 章名"
- Roman numerals in red (Fraunces small-caps)
- Hover + active states work

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/App.css
git commit -m "feat(frontend): Sidebar uses roman numerals + tokens"
```

---

## Task 8: Retrofit `TabBar.jsx`

**Files:**
- Modify: `frontend/src/components/TabBar.jsx`
- Modify: `frontend/src/App.css` — `.tab-bar`, `.tab-item`, `.tab-item.active`

- [ ] **Step 1: Read TabBar**

```bash
cat frontend/src/components/TabBar.jsx
```

- [ ] **Step 2: Apply label-sc class to tab label**

Find the tab label span and wrap with `className="label-sc"`:

```jsx
<span className="label-sc">{t(tab.label)}</span>
```

- [ ] **Step 3: Update TabBar styles in App.css**

```css
.tab-bar {
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-strong);
}
.tab-item {
  color: var(--ink-secondary);
  border-right: 1px solid var(--border-subtle);
  background: transparent;
}
.tab-item:hover { color: var(--ink); }
.tab-item.active {
  color: var(--accent);
  background: var(--bg);
  border-bottom: 2px solid var(--accent);
  margin-bottom: -1px;
}
```

- [ ] **Step 4: Smoke test**

Dev server. Open multiple tabs. Verify:
- Tab labels are small-caps with wide letter-spacing
- Active tab has red underline + lighter bg
- Hover state works

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TabBar.jsx frontend/src/App.css
git commit -m "feat(frontend): TabBar uses small-caps + tokens"
```

---

## Task 9: Retrofit remaining panels — BrainstormPanel, AuthorChatPanel, SettingsPanel, NewBookModal, Toast

This is a single task because each is a mechanical find-and-replace of hardcoded colors → tokens. All smoke-tested together at the end.

**Files:**
- Modify: `frontend/src/components/BrainstormPanel.jsx` — replace hardcoded colors; add `drop-cap` to intro paragraph
- Modify: `frontend/src/components/AuthorChatPanel.jsx` — replace hardcoded colors; optional add `drop-cap` to first assistant segment
- Modify: `frontend/src/components/SettingsPanel.jsx` — replace hardcoded colors
- Modify: `frontend/src/components/NewBookModal.jsx` — replace hardcoded colors
- Modify: `frontend/src/components/Toast.jsx` — replace hardcoded colors

- [ ] **Step 1: For each file listed above, grep for hardcoded colors**

```bash
grep -nE "#[0-9a-fA-F]{3,8}|rgb\(|rgba\(" frontend/src/components/BrainstormPanel.jsx \
  frontend/src/components/AuthorChatPanel.jsx \
  frontend/src/components/SettingsPanel.jsx \
  frontend/src/components/NewBookModal.jsx \
  frontend/src/components/Toast.jsx
```

Each result is a target. Map colors → tokens using this rubric:
- Dark grey/black text → `var(--ink)`
- Light grey text → `var(--ink-secondary)` or `var(--ink-muted)`
- White or near-white backgrounds → `var(--bg)` or `var(--bg-elevated)`
- Red/warning → `var(--accent)` or `var(--danger)`
- Green/success → `var(--success)`
- Yellow/warning → `var(--warning)`
- Borders grey → `var(--border-subtle)`
- Strong borders → `var(--border-strong)`

- [ ] **Step 2: Add `.drop-cap` to BrainstormPanel intro paragraph**

Locate the first `<p>` within the panel's intro section. Add `className="drop-cap"`. Example:

```jsx
<p className="drop-cap">{t('brainstorm.intro')}</p>
```

- [ ] **Step 3: Add `.drop-cap` to first assistant content segment in AuthorChatPanel**

Find the JSX that renders an assistant message's content. Only apply `drop-cap` when the segment is the first non-tool-call segment of an assistant message (to avoid every segment sinking). Skip if complex — this is optional polish.

Example guard:
```jsx
<div className={isFirstContentSegment ? 'drop-cap' : ''}>{segment.text}</div>
```

- [ ] **Step 4: Add `.label-sc` classes to SettingsPanel section labels**

```jsx
<h3 className="label-sc">{t('settings.provider')}</h3>
```

- [ ] **Step 5: For NewBookModal, give title a display-heading class**

```jsx
<h2 className="display-heading">{t('newBook.title')}</h2>
```

- [ ] **Step 6: Smoke test each panel in browser**

Dev server running. Walk through:
- BrainstormPanel: first paragraph has drop cap (red first letter, large)
- AuthorChatPanel: sending a message still works; first assistant segment has drop cap if implemented
- SettingsPanel: section headers render in small-caps
- NewBookModal: click "新书" in sidebar; modal title is display italic
- Toast: trigger any action that fires a toast; colors use token mapping

Verify both Light and Dark themes switch cleanly for each.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/BrainstormPanel.jsx \
  frontend/src/components/AuthorChatPanel.jsx \
  frontend/src/components/SettingsPanel.jsx \
  frontend/src/components/NewBookModal.jsx \
  frontend/src/components/Toast.jsx
git commit -m "feat(frontend): retrofit remaining panels with design tokens"
```

---

## Task 10: Final full-app smoke test + docs CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` — brief note on design system location

- [ ] **Step 1: Full walkthrough — light theme**

```bash
cd frontend && npm run dev
```

Visit `http://localhost:5173`. Confirm in light theme:
- Titlebar: wordmark Fraunces italic; icons legible
- ActivityBar: left column darker tone (`--bg-subtle`)
- Sidebar: volumes and chapters show roman numerals in red
- TabBar: small-caps labels; active tab has red underline
- Any visible paper-texture radial gradient on body (very subtle)
- BrainstormPanel: first paragraph drop cap red/large
- Click through to AuthorChat, Settings, NewBookModal, Outline (old editor works fine), a Chapter — all legible and token-driven

- [ ] **Step 2: Full walkthrough — dark theme**

Toggle theme to dark. Same checklist. Verify:
- Background is deep espresso (`#1f1712`), not flat grey
- Ink is parchment cream (`#e6d5b8`)
- Accent is brick red (`#b04a30`)
- Gold (`#d4a444`) appears on active tabs / titles (Dark has the gold layer)
- 2% grain texture visible at high zoom

- [ ] **Step 3: Contrast spot check**

DevTools → Lighthouse → Accessibility, or manual: confirm body text against bg has ≥ 7:1 contrast ratio in both themes (WCAG AAA).

Light: `#1a1411` on `#f4ede0` — expected ≥ 12:1 ✓
Dark: `#e6d5b8` on `#1f1712` — expected ≥ 9:1 ✓

- [ ] **Step 4: Update CLAUDE.md with design system pointer**

In `CLAUDE.md`, find the "Architecture" section. Add a new subsection after "Memory System":

```markdown
### Design System (`frontend/src/design-tokens.css` + `typography.css`)

"Literary Journal" aesthetic with two themes (cream-paper light, espresso-gold dark). All colors and fonts defined as CSS variables in `design-tokens.css`. Signature components (drop-cap, rail-label, epigraph, wordmark, label-sc) in `typography.css`. Fonts: Fraunces (display) + Noto Serif SC (body). See `docs/superpowers/specs/2026-04-18-design-system.md` for full spec.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note design system in CLAUDE.md architecture"
```

---

## Verification Checklist (Post-Implementation)

- [ ] `frontend/src/design-tokens.css` defines all Light + Dark tokens
- [ ] `frontend/src/typography.css` exports `.drop-cap`, `.rail-label`, `.epigraph`, `.hairline`, `.wordmark`, `.label-sc`, `.display-hero`, `.display-heading`
- [ ] `toRoman()` unit-tested and used in Sidebar
- [ ] Fraunces + Noto Serif SC load on every page
- [ ] All 10 existing components reference CSS variables, no hardcoded colors remain
- [ ] Theme switch works: `data-theme="dark"` attribute on `body` (set by existing `useTheme` hook)
- [ ] Light text contrast ≥ 7:1; Dark text contrast ≥ 7:1
- [ ] Drop cap visible on at least BrainstormPanel first paragraph
- [ ] Wordmark on titlebar
- [ ] Small-caps labels on tabs + volume/chapter numbers

## Known Limitations (Out of Scope)

- New components (ChapterWorkbench, OutlineView, PlotGraphView) are built in later plans; they will **inherit** these tokens automatically because they're defined in plans 2-4
- ChapterEditor.jsx (the old editor) is **not touched here** — it's replaced by ChapterWorkbench in plan 2
- OutlineTreeEditor.jsx — **not touched here** — replaced by OutlineView in plan 3
