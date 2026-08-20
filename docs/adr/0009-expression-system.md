# ADR-0009 — 表情体系扩展（现有表情活化 + 生活化表情）

## 状态

已接受（memorial 004 定案，待实施）。

## 背景

状态机有 6 个中间态表情（shy-smile/shush/nod-smile/frown-wave/chin-rest/
cheek-rest），素材 16 边（idle↔6 表情 12 边 + permission↔nod-smile/
frown-wave 4 边）齐备，但**只作为过渡段端点、无任何触发意图**——`planSwitch`
走直接边或 idle 中转，从不经过表情，素材实际播放不到（吃灰）。

用户追加需求：加入开心、生气、惊吓等生活化表情；并明确「不够素材可以去
再弄，现有的素材尽可能使用上」。

人设依据（`docs/character-profile.md`）：姜晓——古风贵族少女剑士、很聪明、
冷冽、异时间线赛博大明的智能助手。表情触发语义须贴合该人设。

## 决策

1. **现有表情活化（零新增素材）**：
   - permission 情绪化：permission 进场经 nod-smile（点头）/ frown-wave
     （皱眉）过渡；
   - idle 低频随机点缀：空闲时每 30–60s 随机一次「idle→表情→idle」
     （6 选 1），播完自然回 idle。
2. **新增 3 个生活化表情**（各 `idle↔表情` 2 边，共 **6 个新 webp**，
   风格与现有素材对齐）：
   - **happy（开心）**：会话完成（done）触发；
   - **angry（生气）**：授权/工具等待 **10s 未响应**触发（复用 session-follow
     1s tick 时间驱动机制，对齐 READING_THRESHOLD_MS 先例）——冷冽剑士对
     "久候无应"的克制不耐，非 error 触发；
   - **surprised（惊吓）**：被点击/拖动触发**一次**，「idle→惊吓→idle」播完
     即回，拖动中不重复——剑士警觉本能的瞬间反应。
3. **摸鱼彩蛋池**：6 个中间态表情 + happy/angry/surprised 加入并行驻留
   working 期间的随机彩蛋池（详见 ADR-0010）。
4. **素材缺口的处置**：现有 46 个 webp 零缺口（10 循环态 + 36 过渡边精确
   匹配）；新增 6 个表情素材按需补做（用户已授权）。

已否决的替代：删除表情端点与素材（不可逆、浪费已投入素材）；表情仅入
随机池不绑事件（无情绪呼应价值）；over-priority 全面情绪化（上百边素材
成本不现实）。

## 后果

- 新增素材须进 git 与 ADR-0003 zip 契约（`character/` 子目录，webp 白名单）；
- 状态机需扩展意图（如 `play-expression` 或直接表达式端点路径），idle
  随机点缀需新调度逻辑；
- 台词扩展：新表情配台词场景（`docs/character-lines.md` 第二节，用户填写）；
- DESIGN.md §4 角色浮层专规需补表情触发条目。
