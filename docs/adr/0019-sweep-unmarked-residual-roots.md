# ADR-0019 — 清扫加固：按浮层特征识别无标记残留 root（修硬刷新后仍多只姜晓）

## 状态

已接受（2026-08 grill 会话「多会话并行时动画重复叠加」实证定案）。

## 背景

ADR-0017 已实现入口清扫（`sweepResidualRoots` 按 `[data-dsh-jx-root]` 标记选择器
清理残留容器 + 卸载暂存 root）。用户实测多只姜晓叠加仍在：页面硬刷新后，
`document.body` 下仍存在 **2 个不带 `data-dsh-jx-root` 标记、却各自渲染姜晓浮层
（含 2、1 张 `<img>`）的 React root 容器**，与本应唯一、带标记的容器并存。

代码事实（已逐层排除）：
- 运行 bundle 已确认是当前源码产物（CSS 类名 `_image_ej1pf_75`、`_overlay_ej1pf_37`
  逐字一致；curl 抓宿主服务内容 SHA256 与工作区 `lib/client.js` 相等）。
- 当前 `apply()`（`src/client/index.ts`）**必然**为容器打 `data-dsh-jx-root` 标记，
  绝不可能生成无标记容器。
- 因此页面上的无标记容器只能来自 **ADR-0017 之前的旧版本 bundle**（其 `apply`
  不打标记），或因**宿主侧动态模块加载器缓存/服务旧 bundle**（rev 同、字节不同：
  浏览器 fetch 163769 vs curl 172187）而反复排出旧实现生成的容器。

根因定性：ADR-0017 的清扫**只认 `[data-dsh-jx-root]` 标记**，对旧版「无标记逃逸
容器」覆盖不住——旧的 React root 容器既不打标记、也不走 disposer，悬在
`document.body` 下持续渲染姜晓 webp，叠加在正确浮层之上。

## 决策

**D1 — 清扫按浮层特征兜底识别无标记残留**：`sweepResidualRoots` 在标记清扫之后，
再遍历 `document.body` 直接子元素，凡**不带 `data-dsh-jx-root` 标记、但内含本插件
浮层 `[data-jx-character]`** 的元素，一律先 `__jxRoot?.unmount()` 再移除。

- 识别条件刻意**只用浮层特征**，不依赖 React 内部键（`__reactContainer$` 等）：
  jsdom 与真实 DOM 上 `Object.keys` 对自定义宿主键的可见性不可靠，而「body 直接子
  元素内含本插件浮层」是本插件残留的充分且无歧义的判据。
- **不会误伤**：宿主或其他插件不会在 `document.body` 直接子元素里放置我们的浮层
  却不打标记；带标记的规范容器由主路径（标记选择器）处理，此处已排除。

**被否决的替代方案**：
- *仅靠 React `__reactContainer$` 键判别*：运行环境（jsdom/真实 DOM）对该键的
  `Object.keys` 可见性不稳定，测试即踩坑（`Object.defineProperty` 到元素上无法被
  `Object.keys` 列出），且更脆弱——放弃。
- *发现即拒绝挂载*：与 ADR-0017 否决理由相同，残留实例状态无人清理。
- *仅规范清理*：无法覆盖存量/旧 bundle 反复排出的无标记容器，本问题的直接原因。

## 后果

- `apply()` 入口现在清扫两类残留：带标记的规范容器 + 无标记的浮层残留容器，
  从「保证至多一只」收敛到「无论页面残留何种形态的历史浮层都先清干净再挂新盒」。
- 即使宿主侧仍在服务/缓存旧 bundle（无标记实现），下一次 `apply()` 也会把这些
  旧渲染树卸载摘除，页面不再多只姜晓叠加。
- 清扫条件新增「无标记 + 含浮层」分支，任何新增 body 直挂 DOM 的代码若边界模糊，
  需避免在 body 直接子元素里嵌套 `[data-jx-character]` 却无标记——否则会被误清。
- 回归测试新增用例：旧版无标记容器（含浮层）在 `apply()` 时被完整卸载并移除
  （`tests/client/client-apply-reentrant.test.ts` 第 5 条）。全部 223 项测试通过、
  typecheck 通过、`npm run build` 成功。