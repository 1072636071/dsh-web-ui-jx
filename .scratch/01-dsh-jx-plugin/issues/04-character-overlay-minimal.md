# 角色浮层最小可用

**Status:** resolved

**Blocked by:** 02, 03

**构建内容：** 用户在宿主界面右下角看到常驻的姜晓角色浮层，经素材路由以 `<img>` 播放 idle 循环态 WebP；浮层透明无底、不遮挡交互。

**验收标准：**

- [ ] client 半区注入右下角常驻角色浮层
- [ ] 角色 WebP 经 `/api/dsh-jx/*` 素材路由以 `<img>` 播放（非 `<video>`）
- [ ] `img { object-fit: contain; display: block }`；容器无 background / box-shadow / 光晕 / 背光
- [ ] 浮层装饰层 `pointer-events: none`，不拦截底层 UI 交互
- [ ] 深浅双主题下浮层均正常呈现（角色透明素材不受主题影响）

## 评论

- 回写（2026-08-23）：清点核实已实施——CharacterOverlay 右下角常驻浮层上线，经素材路由以 `<img>` 播放循环态 webp。状态由 ready-for-agent 补记为 resolved。
