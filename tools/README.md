# 素材处理工具手册（姜晓角色浮层）

本目录承载姜晓角色浮层的所有素材处理脚本。每个脚本都独立可运行，参数化、可复现。
本文档覆盖**用法、配置、踩过的坑和工作流**，供后续接手或同类素材处理时查阅。

关联设计决策：`docs/adr/0012-loop-defect-asset-repair.md`（循环缺陷修复）、
`docs/adr/0013-variant-playlist-splicing.md`（多动作变体轮换）。
需求来源：`docs/memorial/008-anim-loop-mode-and-variants/context.md`。

---

## 1. 环境准备

**Python**：3.14+（Pillow 12、NumPy 2.5 验证通过）。

**依赖**：
```bash
pip install Pillow numpy imageio-ffmpeg
```

- `Pillow`：帧加载 / webp 读写 / 缩放。
- `NumPy`：向量化色度键、去溢色、质检统计。
- `imageio-ffmpeg`：自带 ffmpeg 二进制（`imageio_ffmpeg.get_ffmpeg_exe()` 取路径），
  免装系统级 ffmpeg。`variant_video_convert.py` 与 `openmm_chroma_convert.py` 用。

> 本机曾经尝试 `pip install ffmpeg-python` + 系统 ffmpeg，路径问题多。
> `imageio-ffmpeg` 最省心，直接拿到静态二进制。

---

## 2. 工作流总览

| 任务 | 脚本 | 何时用 |
|------|------|--------|
| 修循环缺陷（单向动作/局部爆亮） | `anim_loop_repair.py` | 素材首尾缝 > 5 或局部突变（如符咒爆亮） |
| 经典态烘焙正反倒放（重启突兀） | `anim_loop_repair.py --pingpong-classic` | 姿态回起点但动作方向单调、循环点速度反向可见（ADR-0015） |
| 把绿幕视频转成 webp（**现行管线**） | `openmm_chroma_convert.py` | 用户交付新动作视频（变体或循环体），openCodeMM 方式转码入库（ADR-0021） |
| 变体白点重定靶（对齐状态主素材） | `variant_color_match.py` | **换生成批次**导致变体与经典态并排可见冷暖差时（同源生成不需要） |
| 判断现有素材是真循环还是单向动作 | `diag_classic_motion.py` | 决定是否要烘焙倒放 |
| **>6MB 素材全量瘦身（有损重编码）** | `slim_assets_reencode.py` | 素材体积治理：30fps 反应态抽帧到 15fps + q72，15fps 循环/过渡态仅 q72；保留时长/loop/分辨率（工单 20-05） |
| （留档）自研 despill 管线转码 | `variant_video_convert.py` | 已被 openmm_chroma_convert 取代（偏红第四案，ADR-0021）；QC 门与水印擦除仍被复用 |

**典型新素材入库流程**：
1. 用户把绿幕 `.mp4` 放进 `E:\work\sp\openCodeMM\docs\video\`（中文可）。
2. 在 `openmm_chroma_convert.py` 的 `CONVERSIONS` 字典加一行映射（模式：变体 `variant` / 循环体 `loop`）。
3. 跑 `python tools/openmm_chroma_convert.py 目标名`（单文件）或全量；先 `--dry-run` 看指标。
4. 看 QC 输出 + `.temp/output/openmm-reconvert/{name}_light.png` **浅底**目检条（最终闸门）。
5. 入库后跑 `npm run build && npm run verify`，再推。

**典型循环修复流程**：
1. 跑 `python tools/diag_classic_motion.py` 看每个素材的 motion profile 和 verdict。
2. 单向动作 → 加入 `REPAIRS` 走 `pingpong` 模式；局部爆亮 → 走 `splice` 模式；
   方向单调的真循环（重启突兀）→ `--pingpong-classic`（ADR-0015）。
3. 跑 `python tools/anim_loop_repair.py --dry-run` 看计划，确认后 `python tools/anim_loop_repair.py`。
4. 原件自动备份到仓库根 `bak/`（.gitignore 已加）。
5. 复验：`python tools/diag_classic_motion.py` 看首尾缝（应 ≤ 1.0）+ 面积曲线对称。

---

## 3. `anim_loop_repair.py` —— 循环缺陷修复

### 作用

修复循环动画的三种典型缺陷：
- **单向动作**：动作是「中性→峰值→停在峰值」，简单循环时末帧跳回首帧会突兀。
  修法：整段倒放烘焙（正放帧 + 反放帧拼接），让循环首尾连续。
- **局部爆亮/硬弹出**：某帧局部物件（符咒/光效）瞬间变大，不对称。
  修法：用回落段的时间反演合成渐起段，让爆亮变「渐起→峰→渐落」对称。
- **重启突兀（方向单调的真循环）**：首尾缝虽小（姿态回起点）但动作方向
  单调（reading 翻页/working 画符），循环点处「速度瞬间反向」肉眼可辨
  （ADR-0015）。修法：`--pingpong-classic` 整段正反倒放、不裁帧、端点不重复。

### 用法

```bash
python tools/anim_loop_repair.py            # 修 REPAIRS 中所有素材
python tools/anim_loop_repair.py happy      # 只修 happy
python tools/anim_loop_repair.py --pingpong-classic          # 10 经典态全烘焙正反倒放
python tools/anim_loop_repair.py --pingpong-classic reading  # 只烘焙一个经典态
python tools/anim_loop_repair.py --dry-run  # 只报告，不落盘
```

### 配置（脚本内 `REPAIRS` 字典）

```python
REPAIRS = {
    # 整段倒放烘焙：head=裁掉的淡入帧数，tail_end=保留的最后一帧下标
    "happy":     dict(mode="pingpong", frame_ms=33, head=5, tail_end=119),
    "angry":     dict(mode="pingpong", frame_ms=33, head=5, tail_end=99),
    "surprised": dict(mode="pingpong", frame_ms=33, head=5, tail_end=84),
    # 局部镜像：base_end=基线末帧，decay_lo/hi=回落段起止，peak=(肩帧,峰帧)
    "working":   dict(mode="splice", frame_ms=67,
                      base_end=31, decay_lo=35, decay_hi=45, peak=(34, 33)),
}
```

**参数怎么选**（来自实测取证）：
- `head`：源视频开头的淡入残留帧数。取法：`alpha-timeline.py` 跑出全局
  alpha 曲线，找到 alpha 稳定爬升结束的那一帧。`happy/angry/surprised` 都是 5 帧
  （全局 alpha 86→103 在前 5 帧完成）。
- `tail_end`：保留动作峰值姿态 + 少量保持帧，裁掉尾部死定格。取法：找 alpha
  平台开始稳定的帧 + 5 帧余量。
- `base_end`（splice 模式）：爆亮前最后一个基线帧。取法：符咒面积曲线，找到
  面积开始急升的前一帧。
- `decay_lo/hi`：回落段起止帧。取法：爆亮峰值之后，面积回落到基线的那段。
- `peak=(肩帧, 峰帧)`：肩帧（爆亮的第一帧，面积次高）+ 峰帧（面积最高）。

### 产出

- 输出到 `assets/character/{name}.webp`，360×640，`loops=0` 无限循环。
- 原件先备份到 `bak/{name}.webp`（第一次运行才备份，已存在不覆盖）。

### 踩坑

- **method=6 编码极慢**：数百帧素材 + method=6（最大压缩努力）单素材可能跑
  20+ 分钟。`METHOD = 4` 是耗时/质量平衡档，差距人眼几乎不可见。
- **中途杀掉会留 0 字节文件**：Pillow 是关闭时才 flush，如果 `KeyboardInterrupt`
  或 taskkill 强杀进程，输出文件是 0 字节。恢复：`cp bak/{name}.webp
  assets/character/{name}.webp`。
- **frame_ms 写错会让播放节奏乱**：经典态 67ms（15fps），表情态 33ms（30fps）。
  用 `webp-duration.ts` 解析实际值校验。

---

## 4. `variant_video_convert.py` —— 视频→变体 webp（留档，已被 §5 取代）

> **2026-08-24 起降级为留档**：本脚本的自研 despill 管线是「偏红」四轮投诉
> 的根源（深色和服被洗成半透明粉灰，见 §5 踩坑第四案与 ADR-0021）。
> 新素材一律走 `openmm_chroma_convert.py`；本脚本的 QC 门
> （block-max / 中性帧复验）、水印擦除与规格常量仍被新脚本复用。

### 作用

把用户交付的绿幕 `.mp4` 转成一次性播放（`loops=1`）的角色变体 webp。完整
流水线：ffmpeg 抽帧+重定时 → 色度键 + 边缘去污染 + 全局去溢色 → 全片统一
自动白平衡 → 水印擦除 → 三道质检门 → 缩放到 360×640 → 写 webp。

### 用法

```bash
python tools/variant_video_convert.py              # 转 CONVERSIONS 全部
python tools/variant_video_convert.py idle-v2      # 只转一个
python tools/variant_video_convert.py --dry-run    # 只跑质检，不落盘
```

### 配置

**`CONVERSIONS` 字典**（视频名 → 目标素材名 + 所属状态）：
```python
CONVERSIONS = {
    "idle-v2": ("左右张望", "idle"),
    "idle-v3": ("耸肩", "idle"),
    "idle-v4": ("整理衣服", "idle"),
    "working-v2": ("画圆", "working"),
    "working-v3": ("画一横", "working"),
    "working-v4": ("画横来回", "working"),
    "working-v5": ("画上半圆弧", "working"),
}
VIDEO_DIR = r"C:\Users\jxc123\Downloads"
```

> 2026-08-23 全量重制：旧变体源视频已不可得，且成品存在「衣物发红/发紫」缺陷
> （根因见「关键算法 · 色度键」与 ADR-0020），整批弃用重转。新增 working-v5
>（画上半圆弧），运行期轮换池同步扩展（`variant-rotation.ts`）。

**质检阈值**（脚本顶部，实测校准后的值）：
```python
GOLD_MIN_PX = 40     # 工作变体每帧最少金色像素（符咒在场性）
POP_ABS_CAP = 165.0  # 局部突变绝对上限，超过判闪烁故障
NEUTRAL_WARN = 30.0  # 首尾帧 vs 中性帧 报告阈值（仅报告，不硬失败）
```

**帧率与循环**：
- `FRAME_MS = 67`：统一 67ms/帧，对齐经典态节奏。源视频任意帧率都会被 ffmpeg
  重采样到 14.925fps。
- `loop=1`：变体素材只播一遍（运行期轮换推进），与经典态 `loops=0` 不同。

### 关键算法

**色度键 + 边缘去污染 + 全局去溢色**（`chroma_key`）：
1. **坡道 alpha**：与绿幕底色 RGB 距离 ≤42 全透明，≥105 全不透明，中间线性。
   **2026-08-23 起（ADR-0020）距离改用「先去溢色」后的颜色计算**：源视频衣物
   阴影普遍带绿色环境光反射，直接用原始色距会把「绿灰阴影」误判为半透明，
   随后 un-premultiply 减绿底、除以小 α，G 塌陷 → 衣物整片品红/紫红
   （2026-08-22 批「衣服很红」根因，半透明段紫簇占比 82–86% vs 不透明段 33%）。
   去溢色把绿色主导维度折叠掉之后：纯绿幕贴近去溢色底色（α→0），绿灰衣料
   回到中性灰（α→1），金饰由 spill 条件保护不受影响。
2. **半透明边缘预乘还原**：`c' = (c - (1-a)·bg)/a`，剥离绿幕底色对发丝等
   软边的绿色贡献——这是绿边主因。
3. **全局绿溢色压制**：低饱和像素（sat<50）或靠近绿幕底色（RGB 距离<190）
   且绿色高出红蓝均值 4 以上 → 压回红蓝均值。
   - 距离阈值 190 保护金饰等固有色（金饰 RGB 距绿幕底色 >200，不受影响）。
   - 饱和度阈值 50 保护高饱和纹样（如金符咒的饱和暖色）。

**全片统一自动白平衡**（`estimate_white_scales` / `video_white_scales` /
`apply_white_balance`）：AI 生成源常有整体暖偏（working 批次白像素 G-R≈-9）。
1. **参考白点**：每帧取不透明区（alpha>0.5）亮度前 5% 分位以上、sat<25 的像素
   （发丝/浅色织物高光），两轮迭代求通道缩放把参考集均值拉到中性；
2. **全片统一**：对全部帧的候选缩放取逐分量中位数，一次应用到所有帧——
   逐帧独立白平衡会让爆亮段参考点被金色场景光带偏，产生帧间色温波动；
3. **安全阀**：任一轮缩放超出 0.85–1.18、或有效帧不足 1/4 → 放弃白平衡
  （宁欠勿过）。符咒爆亮等场景光的相对变化原样保留（那是内容，不是偏色）。

**光雾衰减**（`chroma_key` 内，去溢色之后）：金色物件（符咒）的光晕落在绿幕上
会形成大片半透明暖色像素——爆亮段最坏帧可达 2 万 px、占不透明区 18%。预乘
还原会放大其饱和度：中灰目检条上像自然辉光，**浅色页面上一律呈橙红雾**
（目检必须用浅底复验）。规则：半透明（0.05<alpha<0.85）且显著偏暖（R-B>20）
的像素，alpha 按 `0.25+0.75·clip((a-0.05)/0.8)` 衰减、颜色向亮度收敛 40%；
不透明区与冷色调发丝软边不受影响，符咒金核保留。

**水印擦除**（`erase_watermark`）：固定区域（x>0.72w & y>0.92h）置透明。
实测水印永远落在这个矩形内，与角色裙摆完全分离。

---

## 5. `openmm_chroma_convert.py` —— 绿幕转码（openCodeMM 方式，现行管线）

### 作用

把 openCodeMM `docs/video/` 下的绿幕 `.mp4` 按**素材源项目 openCodeMM 的
`chroma_key_green.py` 方式**转码入库（ADR-0021）：每文件自动探测绿幕底色
（首帧四角均值）→ ffmpeg `chromakey`（YUV 色度平面，similarity=0.20、
blend=0.03）→ 水印矩形清透明 → Pillow 合成 WebP（360×640、67ms/帧、
quality=90、method=4）。**不做** RGB 距离坡道、un-premultiply、despill、
白平衡——颜色原样保留，与经典态（标准色盘）同源同法。

两种模式：`variant`（loop=1 一次性，变体轮换）/ `loop`（pingpong 烘焙
2n−2 帧、loop=0，循环体规格同经典态）。

### 用法

```bash
python tools/openmm_chroma_convert.py             # 转 CONVERSIONS 全部
python tools/openmm_chroma_convert.py idle-v2     # 只转一个
python tools/openmm_chroma_convert.py --dry-run   # 只跑质检，不落盘
```

### 配置

**`CONVERSIONS` 字典**（目标素材名 → 源视频相对路径 + 模式），源视频放
`E:\work\sp\openCodeMM\docs\video\`。原件备份 `bak/openmm-reconvert/`。

### 质检

- 指标a 局部突变扫描（block-max，上限 165，报告制）；
- 指标b 首/尾帧 vs 中性参考（变体=idle.webp 首帧 / 循环体=入场过渡尾帧）；
- 指标c 不透明占比与暗部占比（洗白缺陷量化，经典态基准 ≈40%/44%）；
- **浅色宣纸底目检条** `.temp/output/openmm-reconvert/{name}_light.png`
  ——最终闸门（目检条底色必须贴近真实展示背景）。

### 踩坑（偏红四案总结）

- **第四案：自研管线整体洗白深色和服（本次替换管线的直接原因）**：
  2026-08-24 用户复报「偏红问题依然存在」。浅底并排目检发现自研管线
  产出的 idle-v2/v3/v4、nod-smile、frown-wave 深色和服被洗成半透明粉灰、
  金纹褪色；白点测量 wpG-R ≈ −0.7~−2.6（近中性），而经典色盘
  −11~−16（暖调）——despill + 中性白平衡把素材拉离了角色标准色盘。
  改用 openCodeMM ffmpeg chromakey（不做任何颜色操作）重转 5 素材后：
  白点归位 −12.1~−16.6、和服恢复深黑、体积减半（nod-smile 15.3→6.3MB）。
  **教训：经典态之所以正常，恰恰因为它什么都没做；同源生成的新素材
  不需要任何颜色校正，多轮「修偏红」是在错误目标（中性白）上迭代。**
- **变体帧数随源视频时长浮动**：5.06s 源 @14.925fps 抽出 74 帧（4958ms），
  旧批 75 帧（5025ms）。`webp-duration.test.ts` 真实素材回归值需同步；
  `VARIANT_SEGMENT_MS=5092`（76 帧名义上界）无需动，运行期按 ANMF
  真实时长推进。
- **源视频文件名含中文**：PowerShell 直接传参会因控制台编码找不到文件，
  用 Python（`subprocess` + Unicode 路径）驱动 ffmpeg 可靠。

---

## 6. `variant_color_match.py` —— 变体白点重定靶

### 作用

把 `{state}-vN.webp` 的白点匹配到所属状态主素材 `{state}.webp`。变体转码
管线的自动白平衡目标是「中性白」，但角色基准盘（经典态）本身是暖调——
实测白点 G-R≈-13~-15。中性化让变体与全库其余素材脱钩，轮换/过渡边界处
肤色发色冷暖跳变可见（2026-08-23 用户报「动画多重问题」的组成之一）。

### 用法

```bash
python tools/variant_color_match.py --dry-run   # 只报告现值/目标/增益
python tools/variant_color_match.py             # 备份原件并落盘 + 复测
```

原件备份 `bak/variant-pre-colormatch/{name}.webp`（已存在不覆盖）。帧时长、
loops、尺寸原样保留（帧时长从 ANMF chunk 重读，Pillow 读不到这些文件的
duration 信息，直接写死会丢节奏）。

### 决策记录：白平衡目标 = 状态主素材白点，不是中性白

- 经典态从未被用户提出观感异议 → 它们就是角色的标准色盘；
- 变体的「偏红」投诉实为两回事：① 符咒光晕橙雾（已由光雾衰减修复）、
  ② 与经典态并排的冷暖差（本工具修复）；把变体拉到中性白反而加大了 ②；
- 增益量级 ~0.93–0.95（G/B 各降 5–7%），一次应用、确定性可复现。

### 踩坑

- **新变体入库后必须跑一次**：`variant_video_convert.py` 的白平衡目标仍是
  中性白（对源视频去 AI 暖偏是对的），产出后接 `variant_color_match.py`
  对齐状态主素材，两步各司其职。
- **复测口径与 `diag_red_cast_round4.py` 一致**（alpha>240 且 lum>170 白点，
  逐帧采样取中位数），前后对照可直接用该脚本。

> **不要用亮度+饱和度检测水印 bbox**：会把裙摆白布误判成水印擦掉，导致角色
> 下半身破洞。

### 三道质检门

跑完每段会打印：
```
[质检a 通过/不过] 符咒在场 XX–XXpx（仅 working 变体）
[质检b 通过/不过] top3: f13:158, f24:141, f21:134（上限 165, med=5.5）
[质检c 正常/注意] 首帧vs中性=11.3 尾帧vs中性=11.3（参考: 匹配~24/错配~30）
```

- **a（符咒在场）**：硬闸。仅 working 变体检查，要求每帧都有 ≥40 个金色像素。
  不过门 = 该段视频符咒某帧消失 → 换后备素材。
- **b（局部突变）**：硬闸。相邻帧 block-max 差超过 165 判闪烁故障。top3 帧
  通常对应合法快速运动（如弧扫、挥袖），若 top3 是连续几帧 → 是运动；若孤立
  单帧 → 可能是闪烁，需要目检。
- **c（首尾帧 vs 中性帧）**：报告制。实测匹配对 ~24、错配对 ~30，分离度不足
  做硬闸。最终以 `.temp/output/variant-convert/{name}_check.png` 目检条为闸。

### 产出

- 入库：`assets/character/{name}.webp`，360×640，75 帧（约 5s），~4.4MB
  （idle 变体）或 ~8.4MB（working 变体）。
- 目检条：`.temp/output/variant-convert/{name}_check.png`（首/中/尾三帧拼图）。

### 踩坑

- **`np.int16` 平方溢出**：255²=65025 > 32767，会产 NaN 导致 alpha 全 0。
  所有帧差运算必须用 `float32` 或 `int32`，`int16` 只能用在不会越界的
  clamp 后阶段。
- **method=6 太慢**：同 anim_loop_repair。`METHOD = 4` 即可。
- **水印检测误伤裙摆白布**：早期用「亮度+饱和度」检测水印 bbox，会把角色
  白裙误判成水印擦掉。改为固定区域擦除（x>0.72w & y>0.92h）。
- **去溢色破坏金饰**：早期对全图做 `g = min(g, mean_rb)`，把金符咒的绿色分量
  也压了，金色偏品红。加「靠近绿幕底色距离<190」条件后，金饰（距绿幕>200）
  被放过。
- **QC-b 上限反复校准**：升级去溢色后边缘更锐，合法弧扫帧从 136 升到 158，
  上限从 140 提到 165。未来升级图像处理可能再次触发校准。
- **「衣服很红」第三案：绿灰阴影被误判半透明 → un-premultiply 推成品红紫**：
  2026-08-22 批次变体入库后用户报「衣服很红」，定责实验显示 working-v2 裙部
  半透明段（α180–240）紫簇占比 **82.5%**、meanG 仅 61（vs R90/B82）。根因：
  源视频衣物阴影带绿色环境光，原始色距把「绿灰阴影」判为半透明，
  un-premultiply 减绿底、除以小 α 压垮 G 通道 → 整片品红。修复：alpha 距离
  改用「先去溢色」后的同类比较（ADR-0020），使绿幕归零、衣料 opaque、金饰
  受保护。2026-08-23 全量弃旧重转 7 段新视频，新增 working-v5。
  **教训：色度键的 alpha 估计必须区分「绿幕本身」与「绿染表面」；
  去溢色不应只修颜色，还应参与透明度决策。**
- **源视频整体暖偏（新素材「白偏红」）**：2026-08-22 working 批次生成结果
  白像素 G-R≈-9（idle 批次仅 -3.5），符咒爆亮段金色场景光把白像素推到
  B-R≈-40；全局去溢色压绿后暖感进一步暴露。第一版修复用逐帧独立白平衡，
  爆亮帧参考点被金光带偏、只修掉一半且有帧间波动；改为全片统一中位数缩放
  （见「关键算法 · 全片统一自动白平衡」）。诊断脚本留档
  `.temp/scripts/diag_white_cast_round3.py`（全链路测量）等。
- **「还是偏红」第二案：橙红光雾 + immutable 缓存**：白偏红修复上线后用户仍报
  偏红，白底目检发现两件事——① 爆亮段符咒光晕在绿幕上留下大片半透明橙色
  像素（预乘还原放大饱和度），浅色页面上一圈红雾，尤以 working-v4（光圈罩头）
  最明显 → 加「光雾衰减」（见关键算法）；② `asset-routes.ts` 曾用
  `cache-control: immutable, max-age=86400`，同名素材原地更新后浏览器最长
  24h 拿不到新字节 → 改为 ETag 协商（max-age=0, must-revalidate）。
  **教训：目检条底色必须贴近真实展示背景（浅色）；素材更新必须核查缓存链。**

---

## 7. `diag_classic_motion.py` —— 经典态运动轨迹诊断

### 作用

判断一个循环动画是「真循环」（动作回到起点）还是「单向动作」（动作方向单调）。
用于决定素材是否需要烘焙倒放（anim_loop_repair 的 pingpong 模式）。

### 算法

对每帧计算 `d(f_i, f_0)`（对首帧的平均像素差），画出时序曲线。

- **真循环**：曲线先升后降，末尾（最后 5 帧均值）回到峰值的 35% 以下。
- **单向动作**：曲线单调上升或停在高位，末尾仍超过峰值 65%。
- **中间型**：末尾部分回归（35%–65%），需结合目视判断。

### 用法

```bash
python tools/diag_classic_motion.py
```

### 输出示例

```
state       n med   max peak  tail verdict
--------------------------------------------------------------------------------
idle       75  4.22 11.08  26.8   1.4 循环型（末尾回归起点）
           profile(d_vs_f0 sampled): [0.0, 1.0, 8.2, 24.8, ...]
...
```

- `med` / `max`：相邻帧差的中位数 / 最大值（判断动作幅度）。
- `peak`：`d_vs_f0` 曲线峰值（动作离起点的最大距离）。
- `tail`：末尾 5 帧对 f0 的均值（越低越接近循环）。
- `verdict`：判定结论。
- `profile`：曲线 10 点采样，看形状。

### 局限

- 仅基于姿态差，对「姿态回归但动作方向单调」的素材判不出（比如角色向右转头
  后缓慢回正，姿态回到起点，但方向感是单向的）。这种素材需要**目检**——
  看循环重启时是否「感觉突兀」。
- 建议配合 `anim_loop_repair.py --dry-run` 看首尾缝数值，双重判断。

---

## 8. 输出目录

| 目录 | 用途 | 是否入 git |
|------|------|-----------|
| `assets/character/` | 入库素材 | ✅ 入 |
| `bak/` | 修复前的原件备份 | ❌ 不入（.gitignore） |
| `bak/slim-reencode/` | 20-05 瘦身治理前的原件备份 | ❌ 不入（.gitignore `bak/`） |
| `.temp/output/openmm-reconvert/` | openCodeMM 方式转码浅底目检条 | ❌ 不入 |
| `.temp/output/slim-gov/` | 20-05 瘦身治理目检条（暗/亮）与展示尺寸对比 | ❌ 不入 |
| `.temp/output/variant-convert/` | 转码目检条、水印/溢色检查图 | ❌ 不入（.temp/ 整体忽略） |
| `.temp/output/variant-probe/` | 视频摸底预览条 | ❌ 不入 |
| `.temp/output/seam-probe/` | 循环缝诊断图 | ❌ 不入 |

---

## 9. 关联文档

| 文档 | 位置 | 内容 |
|------|------|------|
| 循环缺陷修复决策 | `docs/adr/0012-loop-defect-asset-repair.md` | 为什么烘焙倒放、为什么降采样 360×640 |
| 变体轮换决策 | `docs/adr/0013-variant-playlist-splicing.md` | 中性帧约定、打断语义、开关 |
| openCodeMM 方式转码决策 | `docs/adr/0021-openmm-chromakey-reconvert.md` | 偏红四案总结、为什么弃自研 despill 管线 |
| 设计全过程 | `docs/memorial/008-anim-loop-mode-and-variants/context.md` | grill 追问记录 + 实施记录 |
| 新变体视频需求 | `docs/variant-video-requirements.md` | 交付规格、放置位置、命名对照 |
| 素材契约（zip 格式） | `docs/adr/0003-zip-asset-bundle-contract.md` | 扩展名白名单、目录结构 |

---

## 10. 复现性

每个脚本都是**纯函数式**的：输入是 `REPAIRS`/`CONVERSIONS` + 源文件，输出
确定性相同。随机只在 `variant-rotation.ts` 运行期用（随机抽取变体），不在
素材处理里。

跑过的命令留底（2026-08-22 当次实施）：
```bash
# 修 4 个经典态循环缺陷
python tools/anim_loop_repair.py

# 转 6 段视频入库（第一次 dry-run 调阈值，第二次正式）
python tools/variant_video_convert.py --dry-run
python tools/variant_video_convert.py

# 诊断现有 10 个经典态是真循环还是单向
python tools/diag_classic_motion.py
```

2026-08-24（偏红第四案，openCodeMM 方式重转）：
```bash
# 浅底并排目检定位洗白缺陷
python .temp/scripts/light_bg_compare.py

# 重转 5 素材（先 dry-run 看指标，再正式落盘）
python tools/openmm_chroma_convert.py --dry-run
python tools/openmm_chroma_convert.py

# 白点复测（新素材应落回经典色盘 −11~−16）
python .temp/scripts/diag_red_cast_round4.py
```

未来处理新素材时，按 §2 工作流跑即可，无需重调阈值——除非去溢色算法升级
（那种情况下重跑 §4 质检校准）。
