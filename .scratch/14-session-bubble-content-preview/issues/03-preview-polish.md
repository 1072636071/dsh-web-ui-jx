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
