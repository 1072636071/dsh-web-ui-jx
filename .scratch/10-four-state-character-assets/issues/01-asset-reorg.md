# 素材重组：转码权限反馈循环体 + 清退退役素材

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 素材目录与四态方案对齐——用户批准/拒绝权限时角色有完整的颔首微笑/皱眉摆手循环动作可用（目前只有过渡段、无循环体）；画符咒系列与无触发源素材从发布包中彻底消失，角色素材清单可穷举验收。

**验收标准：**

- [x] nod-smile.mp4、frown-wave.mp4（源：`E:\work\sp\openCodeMM\docs\video\`）经抠绿管线转码为 webp 循环体入库：360×640、67ms/帧、pingpong 烘焙（正反倒放，同经典态规格）
- [x] 转码过三道质检门（memorial 008 校准版）：局部突变扫描、首尾帧姿态复验（报告制+目检条）、水印区域擦除
- [x] 删除退役 webp 共 27 个（D12 清单精确计数，工单"约 24"为约数）：working 主素材与 v2~v5 符咒变体、replying、listening、弃用过渡（idle↔working、idle↔replying、thinking↔replying、idle↔listening、idle↔shush、idle↔shy-smile、idle↔cheek-rest、idle↔chin-rest、idle→nod-smile、idle→frown-wave、nod-smile→permission、frown-wave→permission）
- [x] 保留 nod-smile→idle、frown-wave→idle 过渡（权限反馈链回落用）
- [x] 被删素材原文件备份至仓库根 `bak/four-states-retired/`（不进 git，沿用 memorial 008 D2 惯例；子目录避免覆盖 008 旧备份）
- [x] `npm run build && npm run verify` 通过（素材大小与清单检查项绿）

## 评论

- 2026-08-23：源自 PRD `.scratch/10-four-state-character-assets/PRD.md` 实现决策 10；素材全景盘点见 memorial 009 context.md。转码工具沿用 openCodeMM 侧 chroma_key 管线与本仓库 `tools/anim_loop_repair.py --pingpong-classic`。
- 2026-08-23（完成）：转码脚本 `.temp/scripts/convert_permission_feedback.py`（chroma_key + 统一白平衡 + 水印擦除 + 门1 局部突变扫描 + 门2 首尾帧姿态复验报告制/目检条 + pingpong 烘焙 148 帧 × 67ms = 9916ms，loop=0）；门2 参考采用 `transition-permission-{name}.webp` 尾帧（nod-smile 14.6、frown-wave 19.5，均优于匹配对基准 24）；退役清退脚本 `.temp/scripts/retire_obsolete_assets.py`（27 个备份至 bak/four-states-retired/ 后删除）；verify 21 项绿（character webp 37 个 = 保留 35 + 新增 2）。
