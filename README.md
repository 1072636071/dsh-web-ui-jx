# dsh-web-ui-jx — 姜晓角色素材 DSH Bundle 插件

> 独立 DSH Bundle 插件，为 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）宿主提供唐风角色浮层、素材管理 UI 与三层 token 设计系统。本插件**不复用 `dsh-web-ui` 任何包**（参见 `docs/adr/0001-dsh-bundle-plugin-not-skin.md`），以 `dsh plugin add` 安装、独立 npm 发布。

## 功能特性

- **角色浮层 10 态切换**：右下角常驻透明角色层，`<img>` 播放 WebP 动画，支持 `idle / thinking / reading / replying / working / error / welcome / done / permission / listening` 共 10 态 + 36 个过渡 WebP（如 `transition-idle-thinking.webp`），由 `src/client/state-machine/overlay-state-machine.ts` 驱动状态机切换。
- **台词气泡**：状态切换时淡入淡出台词气泡（opacity + translateY），`pointer-events: none` 不拦截指针，播放后自动隐去。
- **唐风设计系统**：墨金卷轴（深色）/ 宣纸梅花（浅色）双主题，遵循官方三层 token 架构（L1 base → L2 skin remap → L3 组件），组件层只消费语义别名，禁止写颜色字面量。设计基准见 `DESIGN.md`。
- **FX 五类特效**：`shimmer`（鎏金流光）/ `fall`（银杏·梅花飘落）/ `grain`（墨韵暗纹）/ `breathe`（墨光呼吸）/ `micro`（微交互），五类独立开关，默认全开，`prefers-reduced-motion` 下自动全关，全关 = 极致性能。
- **素材导入管理**：管理界面支持 zip 上传与本地目录两种来源，导入进度实时反馈，已导入素材列表可预览/删除。zip 包格式契约见 `docs/adr/0003-zip-asset-bundle-contract.md`。
- **侧边栏入口 + 设置卡**：左侧边缘常驻入口，点击展开设置卡（含 FX 五类开关 + 进入管理界面入口），不抢占宿主主视图。

## 安装

### 前置条件

- **Node.js** `^20.19.0 || >=22.0.0`（见 `package.json` 的 `engines`）
- **DSH 宿主**：`@deepseek-ai/dsh-root`（提供 `ctx.webServer.register` 路由注册 + `ctx.storageDomain` KV 元数据）
- **React** `^18.2.0` / **React DOM** `^18.2.0`（peerDependencies，由宿主浏览器壳提供）

### 方式一：DSH 宿主安装（推荐）

在 DSH 宿主仓库下执行：

```bash
dsh plugin --profile web add dsh-web-ui-jx
```

或从本地链接安装（开发态）：

```bash
dsh plugin --profile web add link:<path-to>/dsh-web-ui-jx
```

安装后宿主 web profile 自动加载本插件 host 半区（注册 `/api/dsh-jx/*` 路由）与 client 半区（注入管理 UI + 角色浮层）。

### 方式二：从 npm 安装

```bash
npm install dsh-web-ui-jx
```

安装后需在 DSH 宿主的 profile 配置里引用，或用 `dsh plugin add dsh-web-ui-jx` 走 DSH 安装链。

### 方式三：从源码构建

```bash
git clone <repo-url> dsh-web-ui-jx
cd dsh-web-ui-jx
npm install
npm run build          # 产出 lib/index.js（host）+ lib/client.js（client）+ lib/client.css
```

构建产物在 `lib/`（被 `.gitignore` 忽略，但 `npm pack` 包含）。`prepublishOnly` 钩子会自动执行构建 + 验收。

## 使用

### 侧边栏入口操作

1. 宿主启动后，浏览器左侧边缘出现一个常驻入口（`SidebarEntry` 组件，`position: fixed`）。
2. **点击入口** → 展开为设置卡（`SettingsCard`），含 FX 五类开关与「进入管理界面」按钮。
3. **点击「进入管理界面」** → 右上角浮现 `ManagementUI`，含导入面板与已导入素材列表。
4. **关闭管理界面** → 点击右上角关闭按钮或再次点击侧边栏入口收起。

### 素材导入流程

1. 在管理界面「导入面板」点击 **选 zip** 或 **选目录**。
2. **选 zip**：弹出文件选择器，选 `.zip` 文件。zip 包结构参见 `docs/adr/0003-zip-asset-bundle-contract.md`（顶层可选 `manifest.json` + `character/` / `fonts/` / `preview/` 子目录，扩展名白名单 `webp / woff2 / png`）。
3. **选目录**：弹出目录选择器，选本地素材目录。
4. 导入开始后，进度条实时反馈（解压 + 落盘 + KV 元数据写入）。
5. 导入完成后，已导入素材列表自动刷新，新素材出现在列表中。
6. 素材本体落 `assets/imported/<importId>/<zip 内相对路径>`，经 `/api/dsh-jx/imported/<importId>/<path>` 路由可服务。KV 只存元数据，不存二进制。

### FX 特效开关

设置卡含五类独立开关（默认全开）：

| FX        | 效果                                | 关闭后      |
| --------- | ----------------------------------- | ----------- |
| `shimmer` | 鎏金流光顶线 + 标题烫金流动         | 静态金字    |
| `fall`    | 银杏(暗)/梅花(浅)飘落 12 片         | 无飘落      |
| `grain`   | 墨韵暗纹（静态 SVG turbulence）     | 无          |
| `breathe` | 墨光呼吸背景（body::after opacity） | 静态        |
| `micro`   | 微交互 hover/active                 | 即时 on/off |

- **持久化**：开关状态写入 `localStorage('jx-fx')`，刷新后保留。
- **可访问性**：`prefers-reduced-motion: reduce` 下自动全关。
- **全关 = 极致性能**：`html` 上无任何 `fx-*` 类时，移除全部 animation/transition/装饰层，与原版皮肤无差异。

### 角色浮层 10 态切换

- 浮层位于右下角（`position: fixed; right/bottom: 16px`），`pointer-events: none` 不拦截指针（仅状态切换钮可点）。
- 10 态：`idle / thinking / reading / replying / working / error / welcome / done / permission / listening`，每态对应 `assets/character/<state>.webp`。
- 过渡：状态切换时优先播放 `transition-<from>-<to>.webp`（如 `transition-idle-thinking.webp`），无过渡素材时直接切到目标态。
- 状态机驱动：`src/client/state-machine/overlay-state-machine.ts`，含状态守卫与过渡编排。

### 深浅主题切换

- **跟随宿主信号**：`body[data-ds-dark-theme]` 存在 = 暗色（墨金卷轴），不存在 = 浅色（宣纸梅花）。
- **本插件不主动切主题**：由宿主控制 `body[data-ds-dark-theme]` 的增删，本插件 L2 skin remap（`src/client/styles/jiangxiao.css`）自动跟随。
- **本插件挂载信号**：`body[data-dsh-jiangxiao]` 由 client 半区 `apply()` 设置，触发 L2 jiangxiao skin remap 挂载。

## 开发

### 脚本

```bash
npm run build           # 构建双半区：lib/index.js（host）+ lib/client.js（client）+ lib/client.css
npm run build:host      # 仅构建 host 半区
npm run build:client    # 仅构建 client 半区
npm run typecheck       # tsc --noEmit 类型检查
npm run test            # vitest run 单次测试
npm run test:watch      # vitest watch 模式
npm run verify          # 发布前验收脚本（scripts/verify-release.mjs）
npm run dev             # vite build --watch 监听重建
```

### 项目结构

```
dsh-web-ui-jx/
├── src/
│   ├── host/                    # host 半区（Node 进程）
│   │   ├── index.ts             # 入口：name/inject/apply
│   │   ├── asset-routes.ts      # /api/dsh-jx/* 素材路由
│   │   ├── import-api.ts        # /api/dsh-jx/import/* 导入 API
│   │   └── storage-domain.ts    # zod 声明式 KV domain
│   └── client/                  # client 半区（浏览器）
│       ├── index.ts             # 入口：apply 挂载 React root
│       ├── components/          # UI 组件（CharacterOverlay/ManagementUI/SidebarEntry/...）
│       ├── state-machine/       # 浮层状态机
│       ├── styles/              # CSS（base + jiangxiao + fx + modules）
│       └── fx/                  # 五类特效
├── assets/                      # 素材（随包发布，~235MB）
│   ├── character/               # 46 个角色 WebP（10 态 + 36 过渡）
│   ├── fonts/                   # 2 个 woff2（楷体 + 宋体）
│   └── preview/                 # 2 个预览 PNG（深/浅）
├── lib/                         # 构建产物（.gitignore 忽略，npm pack 包含）
├── tests/                       # 测试（不进 npm pack）
├── docs/adr/                    # 架构决策记录
├── cordis.patch.yml             # 插件挂载声明
├── DESIGN.md                    # 设计基准（唯一 source of truth）
├── CONTEXT.md                   # 领域词汇表
└── package.json
```

### 双半区架构

- **host 半区**（`exports "."`）：在宿主 Node 进程运行，注册 `/api/dsh-jx/*` 素材路由 + 导入 API + KV 元数据。构建产物 `lib/index.js`。
- **client 半区**（`exports "./client"`）：在浏览器加载，注入管理 UI + 角色浮层 + 设置卡 + 侧边栏入口。构建产物 `lib/client.js` + `lib/client.css`。经 `/plugins/dsh-jx/client.js` 服务。
- **挂载声明**：`cordis.patch.yml` 单行同时挂载双半区，由 `package.json` 的 `dsh.bundle.patch` 字段指向。

### 发布前验收

```bash
npm run verify          # 运行 scripts/verify-release.mjs
```

验收脚本检查项（任一失败则退出码 1）：

1. 构建产物 `lib/index.js` / `lib/client.js` / `lib/client.css` 存在且非空
2. `package.json` 关键字段齐全（name / version / exports / dsh.bundle.patch / files / license）
3. `cordis.patch.yml` 存在且非空
4. `assets/` 三类素材齐全（character/webp、fonts/woff2、preview/png）
5. `npm pack --dry-run` 关键文件都在打包清单中
6. 素材大小报告（异常告警）

`prepublishOnly` 钩子自动执行 `npm run build && npm run verify`，发布前强制构建 + 验收。

## 排障

对齐 DSH 自定义插件排障流程，按现象 → 检查 → 处置排列。

### 插件未加载

**现象**：宿主启动后浏览器看不到侧边栏入口，`/plugins/dsh-jx/client.js` 404。

**检查**：

1. `cordis.patch.yml` 存在且非空，含 `id: dsh-jx` 行。
2. `package.json` 的 `dsh.bundle.patch` 指向 `./cordis.patch.yml`。
3. `package.json` 的 `dsh.client.platform` = `web`。
4. 宿主 profile 配置里含本插件（`dsh plugin --profile web add` 是否成功）。
5. 宿主日志查 `dsh-jx` 关键字，看 host 半区 `apply` 是否抛错。

**处置**：重新 `dsh plugin --profile web add dsh-web-ui-jx`；若 host 半区抛错，查 `lib/index.js` 是否存在（`npm run build` 重建）。

### 素材 404

**现象**：浮层角色不显示，浏览器控制台 `/api/dsh-jx/character/idle.webp 404`。

**检查**：

1. `assets/character/` 下有 `idle.webp` 等 10 态 webp（共 46 个）。
2. host 半区已注册 `/api/dsh-jx/*` 路由（`src/host/asset-routes.ts`）。
3. 宿主 `ctx.webServer.register` 可用（`inject: ['webServer']` 声明）。
4. 素材路径穿越防御未误拒（`isSafeRelativePath` 检查）。

**处置**：`npm run build` 重建；查 host 日志看路由注册是否成功；确认 `assets/` 在 npm 包内（`files` 字段含 `assets`）。

### 浮层不显示

**现象**：侧边栏入口可见，但右下角浮层空白。

**检查**：

1. `document.body` 上有 `data-dsh-jiangxiao` 属性（client 半区 `apply` 设置）。
2. `document.body` 上有 `[data-dsh-jx-root]` 子元素（React root 容器）。
3. `assets/character/idle.webp` 可加载（见「素材 404」）。
4. 浮层 `z-index` 未被宿主其他元素覆盖（浮层 `z-index: 2147483647`）。

**处置**：浏览器 DevTools 查 `body` 属性；查 `lib/client.js` 是否最新构建；硬刷新清缓存。

### FX 无效

**现象**：设置卡开关切换无视觉效果，或飘落/流光不出现。

**检查**：

1. `localStorage('jx-fx')` 值（应为 JSON 对象，含 `shimmer/fall/grain/breathe/micro` 五个布尔字段）。
2. `document.documentElement`（`<html>`）上对应 `fx-*` 类是否增删（`applyFx` 函数）。
3. `prefers-reduced-motion: reduce` 是否激活（系统级减少动效设置）—— 激活时全关是预期行为。
4. `lib/client.css` 含 `fx-shimmer` / `fx-fall` / ... 选择器（构建产物完整）。

**处置**：DevTools 改 `localStorage('jx-fx')` 后刷新；确认 `prefers-reduced-motion` 未激活；`npm run build` 重建 client 半区。

### 导入失败

**现象**：管理界面选 zip 后导入进度卡住或报错。

**检查**：

1. zip 包结构符合 `docs/adr/0003-zip-asset-bundle-contract.md`（顶层可选 `manifest.json` + `character/` / `fonts/` / `preview/` 子目录）。
2. zip 内文件扩展名在白名单（`webp / woff2 / png`）内。
3. zip 内路径无 `..` 段、无绝对路径、无 null 字节（路径穿越防御）。
4. host 半区 `ctx.storageDomain` 可用（`inject: ['storageDomain']` 声明）。
5. 落盘目录可写（`assets/imported/`）。

**处置**：按 ADR-0003 重新制作 zip；查 host 日志看导入 API 抛错详情；确认 `assets/imported/` 目录权限。

### 主题不切换

**现象**：宿主切深色/浅色，本插件 UI 不跟随。

**检查**：

1. `document.body` 上 `data-ds-dark-theme` 属性随宿主切换增删（这是宿主控制的信号）。
2. 本插件 L2 skin remap（`src/client/styles/jiangxiao.css`）含 `:not([data-ds-dark-theme])` 浅色覆盖块。
3. `body[data-dsh-jiangxiao]` 已设置（本插件 skin remap 挂载前提）。

**处置**：DevTools 手动在 `body` 上增删 `data-ds-dark-theme` 看是否切换；查宿主主题切换逻辑是否正确设置该属性；查 `lib/client.css` 含双值 remap。

## 许可证

Apache-2.0（见 `package.json` 的 `license` 字段）。

## 致谢

- 角色素材源：openCodeMM「姜晓·墨染」唐风二次元角色。
- 设计系统：对齐 deepseek-harness 官方三层 token 架构。
- 皮肤灵感：`dsh-web-ui` 的 jiangxiao 皮肤（本插件独立实现，不复用其任何包）。
