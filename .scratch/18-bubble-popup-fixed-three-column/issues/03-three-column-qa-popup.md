# 三列问答对照弹框 + 选中态驱动

**Status:** done

**Blocked by:** 01, 02

**构建内容：** hover 会话气泡看到固定尺寸三列问答对照：左列标题+竖排可滚动问话摘要行、中列选中问话全文、右列该问话配对的 LLM 回复；默认落在最新一轮。

**验收标准：**

- [x] 弹框体由竖排三段改三列横排（左列固定 160px，中/右列等分剩余宽度）
- [x] 左列选中态默认最后一条、hover 切换、latch 保持、打开时选中项滚入可见，统一驱动中右两列
- [x] parsePreviewResponse 消费 reply，null 时右列显示「暂无回复」；无 reply 字段的旧响应回落 null 不炸
- [x] 竖排可滚动替代「+N/收起」折叠；点摘要行仍走 sessions.open 跳转、键盘可聚焦
- [x] 深浅主题可读、prefers-reduced-motion 关动画、createPortal+fixed、data-jx-interactive 排除整盒拖动、出入淡入淡出保持
- [x] client 纯逻辑测试（reply 解析与防御、选中映射）；npm run build 绿

## 评论

- [2026-08-30 · 验收] 验证通过：浏览器 hover 气泡见固定尺寸三列问答对照（左标题+竖排可滚动问话摘要行 / 中选中问全文 / 右配对 LLM 回复），默认落最新一轮；reply=null 显「暂无回复」；parsePreviewResponse 向后兼容缺省 reply→null。用户实测确认良好。
