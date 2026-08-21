# PRD — 循环动作播放模式修复与多动作变体轮换

**来源**：memorial 008-anim-loop-mode-and-variants（D1–D10 全部定案）。
**关联**：ADR-0012（资产侧修复）、ADR-0013（播放列表拼接）。

## 问题

1. happy/angry/surprised 三个循环态是单向反应动作，`<img>` 简单循环每圈从峰值姿态跳回开头（还带源视频淡入残留的闪暗），观感突兀。
2. working 循环体内符咒爆亮不对称：2 帧硬弹出 + 10 帧软回落，每圈「凭空出现」。
3. 待机/工作两个长驻状态只有一个循环动作，长期观看单调。

## 方案摘要

- **诉求 A（修复）**：资产侧 Python/Pillow 脚本修复——3 表情整段倒放烘焙（裁淡入头帧 + 裁尾部死定格 + 镜像帧）；working 爆亮段局部镜像（回落段反演合成渐起段）。运行期零改动。修复资产降采样 360×640 重编码，原件备份 `bak/`（不进 git）。
- **诉求 B（变体）**：idle/working 各 3 段变体（用户供绿幕视频转码：去绿幕 + 水印擦除 + 67ms/帧 + 360×640 + 一次性 webp + 三道质检门）。运行期「状态→变体列表」配置驱动，变体只播一遍、随机不重复抽取串成无限播放列表，段间中性帧停 ~400ms，主素材入池作基础候选，被打断后重抽。SettingsCard「角色」section 轮换开关默认开。

## 实现决策

1. 修复与转码脚本沉淀到 `tools/`（Python/Pillow + imageio-ffmpeg 提供的解码器），可复用。
2. 运行期播放项新增「循环一次」类型，推进复用既有「播一遍 + 真实时长」链路（webp-duration）。
3. 随机源可注入（测试可控）；开关持久化键沿用既有设置模式。
4. 全量测试 + `npm run build` + `npm run verify` 通过后方可发布。

## 工单

- `issues/01-loop-defect-repair.md` — 循环修复脚本 + 4 个缺陷素材修复
- `issues/02-variant-assets.md` — 6 段视频转码为变体素材 + 质检门
- `issues/03-variant-playlist.md` — 运行期变体播放列表与随机调度
- `issues/04-rotation-toggle.md` — 轮换开关（设置存储 + 设置卡片）
- `issues/05-acceptance.md` — 全量测试、构建与发布验收
