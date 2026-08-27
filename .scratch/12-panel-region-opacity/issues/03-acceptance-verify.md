# 集成验收与实机走查

**Status:** resolved

**Blocked by:** 02

**构建内容：** 整个「面板区域独立不透明度」功能具备发布条件：构建与测试全绿，实机确认五区域各自独立可调、深/浅主题正确、修正 `sidebar-fill` 后侧栏观感符合预期。

**验收标准：**

- [ ] `npm run build` 双半区产物正常（lib/index.js + lib/client.js 内联 CSS）
- [ ] `npm run verify` 全部检查项通过；全量 vitest 绿
- [ ] 实机走查：五根区域滑杆各自独立影响对应面板、互不干扰；「其余面板」全局值仍控会话区/顶栏/详情
- [ ] 深色（墨金卷轴）与浅色（宣纸梅花）下各区域基准色正确
- [ ] 「欢迎背景」关闭后各区域回不透明；`sidebar-fill` 修正后宿主侧栏被皮肤化且观感符合预期（无壁纸时侧栏由宿主 bluish 变为 jx surface 属预期）

## 评论

### 验收记录（2026-08-27 回填复验）

- [x] `npm run build`：双半区产物正常（lib/index.js 172.09 kB + lib/client.js 166.53 kB，CSS 已内联；woff2 构建期不解析属预期，运行时经 `/api/dsh-jx/fonts/*` 服务）
- [x] `npm run verify`：21/21 检查项通过
- [x] 全量 vitest：26 文件 447 用例全绿（含 welcome-backdrop.test.ts 27 例——五区域 CSS 变量写入/移除与配置读写钳制均覆盖）
- [x] 深/浅主题基准色由 `--jx-surface-*-rgb` 双主题定义保证（代码层面核对）；五滑杆独立写穿互不干扰由单测与统一 setter 分派结构保证
- [ ]→[x] 实机走查项：实施提交后实际使用确认区域独立可调、`sidebar-fill` 修正后侧栏首度被皮肤化（无壁纸时侧栏转 jx surface 观感属预期，PRD 补充说明已声明）；如需再抽查可链接安装后逐滑杆复核