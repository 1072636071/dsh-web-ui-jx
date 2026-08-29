# 03 — 弹框打磨与交互分流

**Status:** done

**Blocked by:** 02

**构建内容：** 弹框的体验完善：问话胶囊超长折叠「+N」（不撑爆弹框，且保证「默认展开最后一个胶囊」恒成立）；弹框挂 `data-jx-interactive` 与整盒拖动正确分流；hover debounce 防抖 + 结果缓存（避免高频 fetch host 路由）；弹框样式消费语义别名（深浅双主题可读、无颜色字面量）；`prefers-reduced-motion` 降级（无动画 instant 切换）；弹框视口钳制/翻转（气泡列在浮层盒外左侧，弹框可能超出视口左缘）。

**验收标准：**

- [x] 问话胶囊超出折叠阈值时折叠为「+N」，展开/收起可用
- [x] 弹框出现/交互不触发整盒拖动（`data-jx-interactive` 分流），拖角色与预览互不干扰
- [x] hover 弹框有 debounce 防抖，结果有缓存（不重复打 host 路由）
- [x] 深浅双主题下弹框文字/背景可读（语义别名），无颜色字面量
- [x] `prefers-reduced-motion` 下弹框无动画（instant 切换）
- [x] 弹框在视口边缘（浮层靠近屏幕左缘）时钳制/翻转，不超出视口

## 评论

审查记录（2026-08-28，第一轮发现、已修复）：
- 【高】「+N」展开成单行道（展开态 moreCount=0 使「收起」chip 永不渲染）→ 新增纯函数 `capsuleLayout`（展开态仍报告折叠线 moreCount），补 4 条回归测试钉死。
- rect/updatedAt 同会话往返刷新、异步回写双键守卫、writeJson 上收 `src/host/json-response.ts` 共享、scheduleHide 去重、弹框几何 inline style 单源注入——均已处理。
- 刻意取舍：弹框存活期窗口 resize 不重算定位（placement memo 只依赖 target.rect，瞬态浮层、重 hover 即刷新）——非缺陷。

动画状态切换复查（2026-08-28 用户反馈驱动，三处修复）：
- ①【损坏】胶囊行 pointerleave 把选中打回最后一条——鼠标移到详情区读旧问话全文的瞬间内容被切走，「划过→阅读」动线断裂。改 **latch**：选中保持到下次 hover 胶囊/换预览目标/弹框重开（PRD 本就无「离开回弹」要求，系实现期多加）。
- ②【缺失】弹框出现 150ms 淡入、消失瞬间卸载，违反 DESIGN.md §6「退出快于进入」→ hook 增 closing 相（宽限期到 → .closing 淡出 100ms → 卸载；淡出中 pointer-events:none，重进可取消），镜像气泡列 .leaving 既有模式。定时器调度走 ref 判定（StrictMode updater 双调用不得有副作用）。
- ③【不准】底缘对齐按最坏高度 260px 算顶缘，内容矮时弹框悬空上浮 → 组件注入 top=盒底缘 + CSS `translate: 0 -100%` 底缘锚定；translate 独立于 transform，与 enter/exit keyframes 正交、reduced-motion 下不失效。
- 验收：442 tests 全绿、build 双半区、verify 21/21。

