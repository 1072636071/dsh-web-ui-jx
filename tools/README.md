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
  免装系统级 ffmpeg。仅 `variant_video_convert.py` 用。

> 本机曾经尝试 `pip install ffmpeg-python` + 系统 ffmpeg，路径问题多。
> `imageio-ffmpeg` 最省心，直接拿到静态二进制。

---

## 2. 工作流总览

| 任务 | 脚本 | 何时用 |
|------|------|--------|
| 修循环缺陷（单向动作/局部爆亮） | `anim_loop_repair.py` | 素材首尾缝 > 5 或局部突变（如符咒爆亮） |
| 把绿幕视频转成变体 webp | `variant_video_convert.py` | 用户交付新动作视频，要进角色轮换池 |
| 判断现有素材是真循环还是单向动作 | `diag_classic_motion.py` | 决定是否要烘焙倒放 |

**典型新素材入库流程**：
1. 用户把 `.mp4` 放到 `C:\Users\jxc1\Downloads\`，命名 `状态-动作.mp4`（中文可）。
2. 在 `variant_video_convert.py` 的 `CONVERSIONS` 字典加一行映射。
3. 跑 `python tools/variant_video_convert.py 目标名`（单文件）或全量跑。
4. 看 QC 输出；不过门的换后备素材；通过的看 `_check.png` 目检条。
5. 入库后跑 `npm run build && npm run verify`，再推。

**典型循环修复流程**：
1. 跑 `python tools/diag_classic_motion.py` 看每个素材的 motion profile 和 verdict。
2. 单向动作 → 加入 `REPAIRS` 走 `pingpong` 模式；局部爆亮 → 走 `splice` 模式。
3. 跑 `python tools/anim_loop_repair.py --dry-run` 看计划，确认后 `python tools/anim_loop_repair.py`。
4. 原件自动备份到仓库根 `bak/`（.gitignore 已加）。
5. 复验：`python tools/diag_classic_motion.py` 看首尾缝（应 ≤ 1.0）+ 面积曲线对称。

---

## 3. `anim_loop_repair.py` —— 循环缺陷修复

### 作用

修复循环动画的两种典型缺陷：
- **单向动作**：动作是「中性→峰值→停在峰值」，简单循环时末帧跳回首帧会突兀。
  修法：整段倒放烘焙（正放帧 + 反放帧拼接），让循环首尾连续。
- **局部爆亮/硬弹出**：某帧局部物件（符咒/光效）瞬间变大，不对称。
  修法：用回落段的时间反演合成渐起段，让爆亮变「渐起→峰→渐落」对称。

### 用法

```bash
python tools/anim_loop_repair.py            # 修 REPAIRS 中所有素材
python tools/anim_loop_repair.py happy      # 只修 happy
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

## 4. `variant_video_convert.py` —— 视频→变体 webp

### 作用

把用户交付的绿幕 `.mp4` 转成一次性播放（`loops=1`）的角色变体 webp。完整
流水线：ffmpeg 抽帧+重定时 → 色度键 + 边缘去污染 + 全局去溢色 → 水印擦除
→ 三道质检门 → 缩放到 360×640 → 写 webp。

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
    "idle-v2": ("待机-张望", "idle"),
    "idle-v3": ("待机-舒展", "idle"),
    "idle-v4": ("待机-整理饰物", "idle"),
    "working-v2": ("工作-画圈", "working"),
    "working-v3": ("工作-画横", "working"),
    "working-v4": ("工作-来回", "working"),
}
VIDEO_DIR = r"C:\Users\jxc1\Downloads"
```

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
2. **半透明边缘预乘还原**：`c' = (c - (1-a)·bg)/a`，剥离绿幕底色对发丝等
   软边的绿色贡献——这是绿边主因。
3. **全局绿溢色压制**：低饱和像素（sat<50）或靠近绿幕底色（RGB 距离<190）
   且绿色高出红蓝均值 4 以上 → 压回红蓝均值。
   - 距离阈值 190 保护金饰等固有色（金饰 RGB 距绿幕底色 >200，不受影响）。
   - 饱和度阈值 50 保护高饱和纹样（如金符咒的饱和暖色）。

**水印擦除**（`erase_watermark`）：固定区域（x>0.72w & y>0.92h）置透明。
实测水印永远落在这个矩形内，与角色裙摆完全分离。

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

---

## 5. `diag_classic_motion.py` —— 经典态运动轨迹诊断

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

## 6. 输出目录

| 目录 | 用途 | 是否入 git |
|------|------|-----------|
| `assets/character/` | 入库素材 | ✅ 入 |
| `bak/` | 修复前的原件备份 | ❌ 不入（.gitignore） |
| `.temp/output/variant-convert/` | 转码目检条、水印/溢色检查图 | ❌ 不入（.temp/ 整体忽略） |
| `.temp/output/variant-probe/` | 视频摸底预览条 | ❌ 不入 |
| `.temp/output/seam-probe/` | 循环缝诊断图 | ❌ 不入 |

---

## 7. 关联文档

| 文档 | 位置 | 内容 |
|------|------|------|
| 循环缺陷修复决策 | `docs/adr/0012-loop-defect-asset-repair.md` | 为什么烘焙倒放、为什么降采样 360×640 |
| 变体轮换决策 | `docs/adr/0013-variant-playlist-splicing.md` | 中性帧约定、打断语义、开关 |
| 设计全过程 | `docs/memorial/008-anim-loop-mode-and-variants/context.md` | grill 追问记录 + 实施记录 |
| 新变体视频需求 | `docs/variant-video-requirements.md` | 交付规格、放置位置、命名对照 |
| 素材契约（zip 格式） | `docs/adr/0003-zip-asset-bundle-contract.md` | 扩展名白名单、目录结构 |

---

## 8. 复现性

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

未来处理新素材时，按 §2 工作流跑即可，无需重调阈值——除非去溢色算法升级
（那种情况下重跑 §4 质检校准）。
