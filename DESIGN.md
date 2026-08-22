# DESIGN.md — dsh-web-ui-jx · 姜晓插件 UI

> 本插件（`dsh-web-ui-jx`，独立 DSH Bundle 插件）的 UI 设计基准。视觉世界继承 openCodeMM「姜晓·墨染」唐风二次元 + jiangxiao 皮肤（墨金卷轴 / 宣纸梅花），架构对齐 deepseek-harness 官方三层 token 系统。本文件是**唯一基准**：新代码、新组件一律引用本文件定义的令牌与结构，禁止跳级写裸值。

## 1. 设计哲学

**深色 = 黑金 · 鎏金（墨金卷轴）**；**浅色 = 宣纸 · 梅花（宣纸梅花）**。

- **深底浅字**：深色容器必须配浅字（`--jx-text-base` / `--jx-gold-bright` / `--jx-gold-deep`），对比度达 WCAG AA。
- **装饰克制**：唐风纹样只点缀核心元素角色/标题栏/按钮，次要区域素净。
- **沉浸但不扰工**：动效柔和不拦截指针（`pointer-events: none`），`prefers-reduced-motion` 下全关。
- **角色透明无底**：角色动画素材永远 alpha 透明、随 `<img>` 播放，不占容器背景、不加光晕。
- **特效可关**：所有消耗性能的特效可独立关闭，全关 = 极致性能，与原版皮肤无差。

## 2. 官方三层 token 架构（source of truth）

本插件组件层只消费**语义别名**，皮肤层负责 remap。暗/亮走官方信号 `body[data-ds-dark-theme]`。

```
L1 base       :root                     → --dsw-font-family / --ds-font-family-code /
                                           --ds-ease-in-out / --ds-transition-duration*
L2 skin remap :body[data-dsh-jiangxiao] → --jx-* 规范令牌 + 将 --dsw-static-* /
                                           --dsw-alias-* / --dsw-specific-* remap 到唐风色板
                :not([data-ds-dark-theme]) → 浅色覆盖
L3 组件       : 只消费 --dsw-alias-* / --dsw-specific-*，禁止写颜色字面量、
                禁止含主题选择器
```

### L1 base（官方 base.css）

```css
:root {
  --dsw-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --ds-font-family-code: 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas,
    'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei';
  --ds-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ds-transition-duration: 0.2s;
  --ds-transition-duration-fast: 0.1s;
  --ds-transition-duration-slow: 0.3s;
}
```

### L2 jiangxiao 皮肤令牌（暗默认）

本职的 `--jx-*` 规范令牌块（源：openCodeMM DESIGN.md §10）：

| 族 | 令牌 | 暗值（墨金卷轴） | 浅值（宣纸梅花） |
|----|------|------------------|------------------|
| Surface | `-0/-1/-2/-3` | `#0b090d #121016 #1a1620 #2d242f` | `#faf5ee #f5eddf #efe3d0 #e8dcc8` |
| Text | strong/base/weak/faint | `#f2ead8 #f2ead8 #a99c8a #8a7e6e` | `#2a241a #5d4a42 #7d6a5e #8a7765` |
| Gold | bright/gold/gold-deep/gold-dim/ginkgo | `#f6d365 #d6b34a #b8860b #996515 #dfb793` | `#9c7a1e #b8860b #8a6508 #6f5306 #b8860b` |
| Seal | seal/seal-deep/seal-bright/seal-ink | `#c7493a #a8382b #d85444 #fff8ef` | `#8e3a49 #7a2a39 #d97a8e #fff8f6` |
| 状态 | success/warn/error | `#86b08a #d9a05b #d06552` | `#3d7a3d #9c6b1e #a83a3a` |
| 装饰 | border-deco / selection / scroll | `#3d3218 / rgba(184,134,11,.3) / track #2a2210 thumb #b8860b` | `#d9c9b5 / rgba(178,74,92,.14) / #ece0d0 #d97a8e` |

氛围族 `--jx-mist/mountain/water/cloud/moon/hair/wisteria`（`#b5a8b2 #827686 #767687 #e7d3d2 #ecd8d8 #d1beca #b89aac`）**仅用于渐变/特效/插画层，不进正文文字**。

烫金渐变 `--jx-gold-foil`：暗 `linear-gradient(135deg,#f6d365,#fda085,#b8860b)` / 浅 `linear-gradient(135deg,#b8860b,#d97a8e,#8a6508)`。

**remap 原则**（jiangxiao.module.css 对齐）：
- `--dsw-static-neutral*`/`-bluish*` → 墨阶 surface 色阶
- `--dsw-static-blue*`/`deepseek*` → 金族
- `green/red/amber` → 保持语义但崁唐风（石绿/赭朱/藤黄）
- `--dsw-alias-*`/`--dsw-specific-*` → 全部指向 `--jx-*`（bg=surface，label=text，brand=gold，state=status，border=gold alpha）

## 3. 组件结构（L3）

组件只消费语义别名；配色一律 `var(--dsw-*)`；唐风炫技（烫金标题/印章/金描滚动条）用 `--jx-*` 专属轨。

- **图标**：唐风线描 inline SVG，`stroke:currentColor`、stroke-width 1.8、round cap/join；尺寸 16/13。
- **侧栏**：`--dsw-specific-sidebar-*` 语义；artive 项 `--dsw-specific-sidebar-nav-item-active(-accent)`。
- **消息时间线**：助手 `--dsw-alias-label-secondary`；用户气泡 `--dsw-specific-bubble`；工具行错误 `--dsw-alias-state-error-primary`；代码 chip `--dsw-alias-markdown-inline-code` + `--ds-font-family-code`。
- **composer**：`--dsw-specific-input-major`，`:focus-within` 升边框到 `--dsw-alias-border-l2+`；发送钮为印章 `--jx-seal`。
- **statusbar / pill / tab**：`--dsw-alias-label-dimmed/tertiary`、`--dsw-alias-border-l1/l2`。

## 4. 角色浮层专规

- 透明无底：`img { object-fit: contain; display: block }`，容器无 background / 无 box-shadow / 无背光。
- 状态：10 态（idle/thinking/reading/replying/working/error/welcome/done/permission/listening）→ `{state}.webp`（`<img>` 播放，非 video）。
- 台词气泡：淡入淡出（opacity+translateY），播放后自动隐去；`pointer-events:none`；头顶右上（`bottom:100%; right:0`）。
- **会话气泡列（ADR-0007/0018）**：角色左侧竖排、自下而上生长；**归组模型**：一归组气泡 = 一顶层会话及其全部 subagent 后代（沿 `parentId` 上溯至根祖先，孤儿自成顶层）；气泡 = 标题 + 状态点（运行中金呼吸点 / 已完成石绿实心点）+ **子代理徽标**（`▸N`/`▾N` 计后代总数，有运行中后代时前缀金呼吸迷你点）；点击气泡本体经 `sessions.open(id)` 跳转对应会话（`pointer-events:auto` + `cursor:pointer`，反转台词气泡穿透原则，仅限气泡本体与徽标）；点击徽标原地展开子气泡列表（向左缩进 12px + 弱化背景 + 左竖连接线，再点收起）；当前会话气泡 `--jx-gold` 金描边高亮，current 在后代中时描边传播至根祖先且该组强制展开；数量上限默认 5（1-10 可配置，SettingsCard「角色」section）只约束顶层归组气泡，溢出折叠为「+N」点击原地展开；出现 150ms 淡入 / 消失 100ms 淡出，`prefers-reduced-motion` 全关；随盒整体移动。
- **可拖动（ADR-0006）**：整个浮层盒可拖（`pointer-events:auto`，反转原「装饰层不拦截」原则），`left/top + transform` 定位，位置持久化 `localStorage('jx-overlay-pos')`，视口内钳制；拖动中 `cursor:grabbing` + 轻微提视（opacity/scale），`prefers-reduced-motion` 下无过渡；SettingsCard 提供重置入口。台词气泡与会话气泡列随盒整体移动；可点交互子元素（会话气泡等）挂 `data-jx-interactive` 不触发拖动。

## 5. 特效系统（FX）

所有特效默认开，可独立关，全关 = 极致性能。由 `html` 上 `fx-*` 类 + `localStorage('jx-fx')` 控制。

| FX | 效果 | 实现 | 关闭后 |
|----|------|------|--------|
| `shimmer` | 鎏金流光顶线 + 标题烫金流动 | CSS `background-position` 动画 | 静态金字 |
| `fall` | 银杏(暗)/梅花(浅)飘落 | 12 片 Web Animations API, GPU transform | 无飘落 |
| `grain` | 墨韵暗纹 | 静态 SVG turbulence, 零热循环 | 无 |
| `warp` | 鼠标光线扭曲 | 鼠标周围局部 SVG feDisplacementMap + --jx-moon 边缘光，pointermove 跟手停淡出 | 静态 |
| `micro` | 微交互 hover/active | transform+cubic-bezier(0.16,1,0.3,1) | 即时 on/off |

全关判定：`html` 无任何 `fx-*` 类 → 移除全部 animation/transition/装饰层，与原版皮肤无差异。

## 6. 动效与可访问性

- 常规 150ms / 布局 200ms / 强调 350ms；`cubic-bezier(0.16,1,0.3,1)`（自然减速）。
- 退出快于进入；不堆叠效果，聚焦单一冲击。
- `:focus-visible` 用 `--jx-gold` 描边；`prefers-reduced-motion` 全关。
- 滚动条金描：track/thumb = `--jx-scroll-*`；选中 `--jx-selection`。

## 7. 禁用项（Don'ts）

- 不用纯 `#fff` / `#000`；不用霓虹/高饱和渐变（唯一渐变是 `--jx-gold-foil` 与氛围渐变）。
- 组件层不写颜色字面量、不含主题选择器。
- 角色不加背景/光晕/背光；装饰层不拦截指针（角色浮层除外，见 §4 ADR-0006 整盒可拖）。
- 不在次要/长尾区域堆装饰。
- 深/浅两套必须都覆盖（同一套令牌双值），缺一即违规。
