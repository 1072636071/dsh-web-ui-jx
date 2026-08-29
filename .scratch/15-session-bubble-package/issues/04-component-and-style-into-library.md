# 04 — 组件与样式迁移入库（库 v1 完整）

**Status:** resolved

**Blocked by:** 02, 03

**构建内容：** 气泡列 UI（组件、样式、`--jx-*` 默认值主题层）迁入库，库 v1 完整：既有 SDK 数据契约下 `SessionBubbleList` 可被任意 DSH 插件 import 即用，且脱离根插件 token 环境时颜色/主题依然正常（自带默认值，宿主同名变量自然覆盖）。根插件彻底改为单一事实源——外观与交互零回归。

**验收标准：**

- [x] 库导出 `SessionBubbleList` 组件，输入契约 = SDK 快照/接口面，类型完整
- [x] 库自带主题层：`--jx-*` 默认值作用域限定在气泡根容器，深浅双值随宿主深色标记切换
- [x] 宿主提供同名 `--jx-*` 变量时能覆盖默认值；无宿主 token 时气泡渲染颜色正常
- [x] 组件渲染测试迁入库并全绿
- [x] 根插件气泡代码整体移除改为 import 库，构建 + 全量测试 + 验收脚本全绿
- [x] 根插件中气泡的现有用户行为（归组/保留/拖拽/跨刷新留存）在改造前后输出一致（回归护栏）

## 答案

2026-08-27 完成，commit `eae6b9e`。

- `SessionBubbleList.tsx`（rename 99%）、`session-bubbles.module.css`（rename 96%）迁入库包；组件 import 改库内模块（避免入口循环依赖），根元素挂静态 class `dsh-session-bubble-root` 作主题锚点
- 新建 `styles/bubble-theme.css`：深浅双值（深 #d6b34a/#c7493a/rgb(18 16 22)，浅 #b8860b/#8e3a49/rgb(245 237 223)，与 jiangxiao.css 快照一致），作用域限定根容器
- **宿主覆盖机制**（审查发现并修复）：默认值用内部命名空间 `--dsh-bubble-jx-*`（不遮蔽宿主 `--jx-*` 继承值），12 处消费点双层 fallback `var(--jx-gold, var(--dsh-bubble-jx-gold))`——宿主定义时自然覆盖、无宿主时回落库默认
- 库入口导出 `SessionBubbleList`/`SessionBubbleListProps`；占位 `index.css` 移除
- 组件测试 `session-bubble-list`（12）随迁库包 `__tests__/`，改从库内部 import
- 验证：根+库 typecheck、447 测试、库 build（23.67KB JS + 4.89KB CSS）、根 build、21 项验收全绿
- 代码审查：标准轴 0 硬性（修复后 0 发现）；spec 轴 0 缺失/0 蔓延/0 误实现（首轮验收③遮蔽缺陷经双层 fallback 修复闭合）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
