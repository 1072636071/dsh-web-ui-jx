# Map — 16-session-bubble-hover-detail

来源：PRD `16-session-bubble-hover-detail`（memorial 015 → ADR-0030）。

状态：**已完成**（2026-08-27，工单 01-05 全部 resolved；全量测试 497 绿、build/verify 21 项绿）。

## 工单

- `01-detail-data-layer` — 详情窗数据层（预览提取/缓存/transport）✅ resolved
- `02-detail-window-ui` — 详情窗组件 + hover 交互 + 书页视觉 ✅ resolved
- `03-ai-title-backend` — AI 动态标题后端链路（host 直连 + settings/credentials）✅ resolved
- `04-ai-title-ui-refresh` — AI 动态标题 UI + 触发重刷 ✅ resolved
- `05-acceptance-closure` — 里程碑验收闭环 ✅ resolved（人工/发布项待用户）

## 已做决策

- 数据源 = `session.history` RPC 尾页（纯读取不启动 Agent）；客户端经 connection.api 调用
- 缓存 = 内存 Map + 15s TTL + 会话 updatedAt 失效 + in-flight 去重
- AI 动态标题 = host 半区 Node 直连用户 endpoint（OpenAI 兼容），DynamicTitleTransport 接口抽象
- 配置 = endpoint/model/频率存宿主 settings 分节（`dsh-jx.aiTitle`）、key 存 credentials（引用/值分离、换 key 零重启）
- 触发重刷 = 事件失效 + 悬停时缓存过期才生成 + 可配节流（d+a 组合）
- 视觉 = 书页卡片（扉页式）：`--jx-paper-bg`/`--jx-paper-edge` 深浅双值 + 书眉/书脊 + 朱砂章点缀
- Seam = 复用气泡库纯逻辑层（预览提取/刷新判定/提示词组装），新 seam 数 = 0
- 交互 = hover 300ms 进入 / 200ms 离开、视口边缘换侧、触屏长按 500ms、详情窗内可点击跳转
- 截断 = 3 行 line-clamp + 字符护栏，行数可配

## 迷雾/待办

- host 半区 ai-title 路由当前落根插件 host 半区；薄壳插件 host 半区同构注册为后续跟进（薄壳包独立发布路径）
- 详情窗与气泡列布局衔接（气泡 hover 态、浮层共存）人工视觉验证（待用户）
- current 会话用对话快照实时订阅作为后续优化项（本期非阻塞）
