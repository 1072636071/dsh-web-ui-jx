# Memorial 006 实施规格 — 动画切换僵硬度优化

**对应 memorial**：`docs/memorial/006-animation-switch-smoothing`
**状态**：已定案，待实施

---

## 1. 目标

1. 消除单会话运行期 thinking/reading/replying/working 高频切换导致的动画僵硬感；
2. 多会话并行时让浮层稳定表达「整体忙碌」，并偶发摸鱼彩蛋；
3. 在角色下方显示当前状态文案标签，并提供 SettingsCard 开关。

---

## 2. 状态机扩展

### 2.1 新增循环态

在 `overlay-state-machine.ts` 的 `OverlayState` 与 `OVERLAY_STATES` 中新增：

- `happy`（开心）
- `angry`（生气）
- `surprised`（惊吓）

循环态总数从 10 扩展到 13。

### 2.2 新增过渡边

在 `TRANSITION_EDGES` 中新增 6 条：

- `idle ↔ happy`
- `idle ↔ angry`
- `idle ↔ surprised`

过渡边总数从 36 扩展到 42。

对应素材文件：

- `transition-idle-happy.webp`
- `transition-happy-idle.webp`
- `transition-idle-angry.webp`
- `transition-angry-idle.webp`
- `transition-idle-surprised.webp`
- `transition-surprised-idle.webp`

循环态素材：

- `happy.webp`
- `angry.webp`
- `surprised.webp`

---

## 3. Runtime 焦点层防抖

修改 `overlay-session-runtime.ts`。

### 3.1 防抖规则

- 防抖窗口：**3000ms**。
- 防抖状态集合：工作态 `thinking/reading/replying/working`。
- 非防抖（直接落）：`done`、`idle`。
- 硬切白名单：`permission`、`error`。

### 3.2 行为

- 当底层目标变化到工作态时：
  - 若当前没有 pending，启动 3000ms 防抖计时器，并记录 pending 目标；
  - 若已有 pending，更新 pending 为目标，重置计时器；
  - 计时器到期后，dispatch 到 pending 目标。
- 当目标变化到 `done`/`idle` 时：
  - 立即 dispatch，不防抖。
- 当目标变化到 `permission`/`error` 时：
  - 立即丢弃 pending 与计时器，直接 dispatch；
  - 仍走 `planSwitch` 生成过渡段，正常播 transition 再落循环态。

### 3.3 实现位置

在 `processSnapshot` 之后、`setState` 之前加一层 `applyFocusState(target)`，只对焦点会话生效。非焦点会话的 `setState` 保持直接调用。

---

## 4. 多会话并行驻留 + 摸鱼彩蛋

### 4.1 并行判定

每次 `handleListChange` 或 tick 后评估：

```
parallel = (
  entries.size >= 2 &&
  存在 entry 对应会话 running &&
  存在 entry 对应会话非 idle
)
```

`running` 与当前状态从 `entry.stateMachine.getSnapshot().currentState` 读取。

### 4.2 驻留行为

- `parallel === true` 时，runtime 输出 `working` 驻留：`currentState = working`，`playback = [loop-working]`。
- `parallel === false` 时，恢复焦点会话 playback。
- 紧急态 `permission`/`error` 在任意时刻优先：若任一非焦点会话处于 emergency，浮层切到该会话的 emergency playback；消退后重新评估 parallel。

### 4.3 摸鱼彩蛋

- 触发条件：`parallel === true`、当前非 emergency、不在彩蛋中。
- 触发方式：随机计时，平均 2–5 分钟一次（实现时用 `setTimeout(random(2min, 5min))`）。
- 彩蛋池：`shy-smile/shush/nod-smile/frown-wave/chin-rest/cheek-rest/happy/angry/surprised`。
- 播放序列：从 working 切到 idle，再播 `idle→egg→idle`，最后回到 working。
- 彩蛋不写入任何会话 SM，属于 runtime 层临时调度。

---

## 5. 状态文案标签

### 5.1 文案映射

在 `CharacterOverlay.tsx` 中维护 `STATE_LABEL: Record<OverlayState | EasterEggState, string>`：

```ts
const STATE_LABEL: Record<string, string> = {
  idle: "候命中",
  thinking: "思量中",
  reading: "阅卷中",
  replying: "回复中",
  working: "遵命，吾这就去办",
  error: "此事有蹊跷",
  welcome: "大人来了",
  done: "此事已毕",
  permission: "需大人首肯",
  listening: "静候示下",
  happy: "甚好",
  angry: "久候无应",
  surprised: "何人",
};
```

### 5.2 触发与显示

- 标签显示在角色下方，小字、半透明、pointer-events: none。
- 跟随 `snapshot.currentState` 即时变化（不防抖，用户需要知道真实状态）。
- 彩蛋期间显示彩蛋对应文案。

### 5.3 开关

- 在 `SettingsCard.tsx` 中新增开关项：`显示姜晓状态标签`。
- 默认开启。
- 持久化到 `localStorage`（键：`jx-character-state-label-visible`）。

---

## 6. 素材处理

源文件：

- `C:\Users\jxc123\Downloads\待机-开心.mp4`
- `C:\Users\jxc123\Downloads\待机-生气.mp4`
- `C:\Users\jxc123\Downloads\待机-惊讶.mp4`

处理步骤：

1. 去绿幕（chromakey）。
2. 输出为 webp 动画（循环）。
3. 命名：
   - `happy.webp`
   - `angry.webp`
   - `surprised.webp`

每个循环态还需要 `idle↔X` 过渡段，素材缺口：

- 若源文件本身是「待机→表情→待机」完整过渡动画，可剪辑为 6 个过渡段；
- 若源文件只是循环表情，需补做过渡段（本次若无法生成则先用硬切占位，记录缺口）。

---

## 7. 验收标准

- `npm run build` 成功；
- `npm run verify` 通过；
- 单会话工具链切换时，工作态 3000ms 内不闪切；
- permission/error 到达时立即切换；
- 多会话并行时浮层稳定显示 working，偶发彩蛋；
- 状态标签可开关，文案符合姜晓人设。
