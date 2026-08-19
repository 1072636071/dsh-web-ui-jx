# ADR-0006 — 角色浮层可拖动（整盒可拖 + 位置持久化 + 视口钳制）

## 状态

已接受（grill 会话 2026-08-19 定案，待实施）。

## 背景

角色浮层（`CharacterOverlay`）原为右下角常驻装饰层：`position: fixed;
right/bottom: 16px`，且**整个浮层 `pointer-events: none`** 完全穿透到底层
宿主 UI（DESIGN.md §4「不拦截底层 UI 交互」，仅未来 StateSwitcher 按钮例外）。

新需求：让姜晓动画（角色浮层）可被用户拖动到任意位置。

## 决策

1. **交互模型：整个浮层盒可拖**。`pointer-events: none → auto`（180×260 盒
   内任意位置按住即拖）。**反转 DESIGN.md §4 的穿透原则**——浮层所在矩形从此
   拦截其下方的宿主 UI 指针。已否决的替代：
   - 仅角色可视区可拖：需逐像素判 webp alpha，命中区飘忽、实现复杂。
   - 拖动手柄：新增视觉元素，破坏唐风极简。
2. **定位模型**：由 `right/bottom` 改为 `left:0/top:0 + transform:
   translate3d(x,y,0)`（GPU 合成、避免布局抖动）。默认位置 = 视口右下角
   `(vw-180-16, vh-260-16)`。
3. **位置持久化**：`localStorage('jx-overlay-pos')`，JSON `{x,y}`（px，视口
   左上角为原点），拖动结束钳制后写入；初始化读回，无则用默认右下角。命名
   对齐现有 `jx-fx` / `jx-skin` 持久化模式。
4. **视口边界**：钳制在视口内（`0 ≤ x ≤ vw-width`，`0 ≤ y ≤ vh-height`）；
   `window resize` 时重新钳制，防止窗口缩小后浮层出屏。
5. **拖动反馈**：`cursor: grab`（悬停）/`grabbing`（拖动中）；拖动中
   `opacity 0.85 + scale 1.02` 轻微提视；`prefers-reduced-motion` 下无过渡。
6. **重置入口**：`SettingsCard` 提供「重置浮层位置」按钮 → 回右下角并清除
   持久化。作为拖动丢位置的兜底（配合钳制保证不丢）。
7. **实现机制**：Pointer Events（`setPointerCapture`）统一鼠标与触控；
   `touch-action: none` + 拖动中 `user-select: none`；`pointerdown` 目标为
   交互子元素（未来 StateSwitcher 按钮等）时不触发拖动。

## 后果

- **反转 DESIGN.md §4「装饰层不拦截指针」原则**：浮层所在 180×260 矩形拦截
  其下方宿主 UI（点击/滚动）。接受——该区域本就是插件浮层，且可拖动后用户
  可将其移开。
- DESIGN.md §4 相应更新为「整盒可拖、交互层」表述。
- 未来工单 05 StateSwitcher 按钮为盒内可点子元素，拖动逻辑需排除其
  `pointerdown`（决策 7）。
- 台词气泡（`pointer-events:none`，绝对定位在盒内）随盒整体移动，无冲突。
