# 01 — 循环缺陷的资产侧修复（倒放烘焙 + 局部镜像）

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** `tools/` 新增循环修复脚本（Python/Pillow），双模式：`pingpong`（裁头部淡入残留帧 + 裁尾部死定格 + 正放倒放镜像烘焙）与 `splice`（爆亮段局部镜像：回落段时间反演合成渐起段）。执行修复：happy/angry/surprised 走 pingpong，working 走 splice。修复资产一并降采样 360×640 高质量重编码，原文件先备份到仓库根 `bak/`。运行期代码零改动。

**验收标准：**

- [ ] 脚本沉淀在 `tools/`，两模式可复用（参数化素材路径/裁剪点/镜像区间）
- [ ] 修复前先备份原件到 `bak/`；`.gitignore` 含 `bak/`
- [ ] 修复后 3 表情首尾帧差降至压缩噪声级（≤2.5），且无淡入暗帧残留（新首帧全局 alpha 与平台值一致）
- [ ] working 爆亮段对称：符咒面积渐起→峰→渐落，无 2 帧硬弹出（相邻帧面积增幅 ≤40%）
- [ ] working 身体摇摆保持正向播放（未整段倒放）
- [ ] 4 个素材输出 360×640、帧时长不变（表情 33ms / working 67ms）、无限循环
- [ ] `npm run build` 与 `npm run verify` 通过

## 评论

（memorial 008 D1/D2；取证脚本见 `.temp/scripts/loop-seam-diagnosis.py` 等；ADR-0012。）
