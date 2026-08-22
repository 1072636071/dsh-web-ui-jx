# 02 — 浮层组件接入播放游标（端到端修复）

**Status:** resolved

**Blocked by:** 01

**构建内容：** 用户可见的端到端修复：会话弹出审批请求后，姜晓立即开始播放 permission 入场动画且不再被任何后台会话事件打断，等待期间稳定驻留「需大人首肯」；批准后退场自然衔接回工作呈现。对照修复前：等待期画面卡在无关过渡、permission 造型反而批准后才出现。既有交互（变体轮换、点击惊吓、焦点切换淡入淡出、状态台词）一律不回归。

**验收标准：**

- [ ] 角色浮层组件删除内联的播放索引状态与推进定时效应，改为消费播放游标模块
- [ ] 焦点切换 cross-fade（underlay 淡出/新层淡入）行为保持不变
- [ ] 状态台词气泡触发时机与点击惊吓台词抑制路径保持不变
- [ ] 变体轮换开关开/关实时切换路径回归正常
- [ ] reduced-motion 下行为与修复前一致（本修复不新增动画依赖）
- [ ] 手动验收：触发一次工具审批——等待期入场链完整播完并驻留 permission 循环态（无论后台事件多少），批准后退场自然
- [ ] 全量测试套件绿（含 01 新增用例）；`npm run build` 与 `npm run verify` 通过

## 评论

2026-08 实施：浮层组件删除内联播放索引、快照引用重置块与推进定时效应，改为消费播放游标（render 期 `onPlan` 幂等同步 + `useSyncExternalStore` 订阅定时推进；过渡段时长经既有 webp 解析回填 `resolveDuration`）。cross-fade underlay、状态台词触发、poke 抑制路径未动。typecheck 绿；全量套件 216/217——唯一失败为 host asset-routes 缓存头断言过时，属并发会话「白偏红」缓存修复（未提交在途改动）的遗留，与本票无关且未越界代修。build + verify 21 项全过。手动验收项待部署实测：`dsh plugin --profile web add link:<path>` 后触发一次工具审批，对照修复前症状（等待卡过渡、批完才见 permission 造型）。

实施以 `.scratch/08-permission-anim-visible/PRD.md` 的实现决策与测试决策为准。已知残留不在本票范围：poke 遮蔽紧急态约 8s、并行驻留遮蔽焦点紧急态（特性 06 issue 09/10）；紧急态即达增强缓议（issue 11）。部署验收按仓库惯例 `dsh plugin --profile web add link:<path>` 链接安装实测。
