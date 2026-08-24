# ADR-0021: 新素材改用 openCodeMM ffmpeg chromakey 管线（终结偏红问题）

## 状态

已实施（2026-08-24）。

## 背景

「新素材偏红」是跨四轮的顽固问题：

1. **第一案（衣物品红/紫红）**：自研 chroma_key 的 RGB 距离把绿灰阴影误判
   半透明，un-premultiply 压垮 G 通道 → ADR-0020 despill-first 修复；
2. **第二案（白偏红）**：源视频整体暖偏 → 全片统一自动白平衡修复；
3. **第三案（橙红光雾）**：符咒光晕半透明暖像素被预乘还原放大 → 光雾衰减修复；
4. **第四案（本次）**：2026-08-24 用户复报「偏红问题依然存在」。

## 诊断

浅色宣纸底并排目检（`.temp/scripts/light_bg_compare.py`，底色贴近真实展示
背景）定位：**自研管线产出的新素材深色和服整体被洗成半透明粉灰**——
黑金色和服呈粉白、金纹褪色；而全部经典态素材（素材源项目 openCodeMM 的
ffmpeg YUV chromakey 管线产出）黑袍深实、从未被投诉。

白点量化（`diag_red_cast_round4.py` 口径）：新素材 wpG-R ≈ −0.7~−2.6
（近中性），经典色盘 wpG-R ≈ −11~−16（暖调）——自研管线的 despill +
白平衡把素材拉离了角色标准色盘，多轮「修偏红」实际是在错误目标上迭代。

## 根因

自研管线的三个颜色操作各有副作用，且目标（中性白）本身错误：

- **RGB 距离坡道 alpha**：深色和服阴影与绿底的 RGB 距离落入坡道中段 →
  大片衣料被判半透明；
- **un-premultiply**：半透明衣料除以小 α → 颜色提亮失真；
- **despill + 中性白平衡**：把素材拉向中性，偏离经典态暖色盘。

经典态之所以正常，恰恰因为它**什么都没做**——ffmpeg chromakey 只在
YUV 色度平面抠掉绿底，RGB 像素值原样保留。

## 决策

**新素材转码改用素材源项目 openCodeMM 的 `chroma_key_green.py` 方式**
（`tools/openmm_chroma_convert.py`），与经典态同源同法：

1. 每文件自动探测绿幕底色（首帧四角像素均值）；
2. ffmpeg `chromakey=<color>:0.20:0.03`（YUV 色度平面 + 边缘羽化）——
   **不做** RGB 距离坡道、**不做** un-premultiply、**不做** despill、
   **不做**白平衡；
3. 右下角水印矩形清透明（本仓库校准区 x>0.72w、y>0.92h）；
4. Pillow 合成 WebP（360×640、67ms/帧、quality=90、method=4）。

两种模式沿用素材契约：`variant`（loop=1 一次性，变体轮换）、
`loop`（pingpong 烘焙 2n−2 帧、loop=0，循环体/经典态规格）。

**白平衡目标原则（取代 ADR-0020 时代的中性白目标）**：经典态色盘即标准，
新素材与经典态同源生成时**不做任何颜色校正**；仅当素材源本身换生成批次
导致并排可见冷暖差时，才允许用 `variant_color_match.py` 向状态主素材
白点重定靶。

## 实施（2026-08-24）

重转 5 个受影响素材（源视频均在 openCodeMM `docs/video/`）：

| 素材 | 源 | 模式 | 结果 |
|------|----|------|------|
| idle-v2 | 循环的/待机-左右张望-待机.mp4 | variant | 74 帧 4958ms loop=1 3.6MB |
| idle-v3 | 循环的/待机-耸肩-待机.mp4 | variant | 74 帧 4958ms loop=1 3.8MB |
| idle-v4 | 循环的/待机-整理衣服-待机.mp4 | variant | 74 帧 4958ms loop=1 3.7MB |
| nod-smile | nod-smile.mp4 | loop | 148 帧 9916ms loop=0 6.3MB |
| frown-wave | frown-wave.mp4 | loop | 148 帧 9916ms loop=0 8.3MB |

验收：

- 白点归位：idle-v2/v3/v4 −2.3~−2.6 → **−12.1~−13.3**（idle −13.8）；
  nod-smile −0.7 → **−15.8**（permission −15.8）；frown-wave −1.1 → **−16.6**；
- 浅底目检：和服恢复深黑、金纹清晰，与经典态并排无冷暖差；
- 指标a 局部突变 top3 ≤82（上限 165）；指标b 首/尾帧 vs 中性参考 ≤9.8；
- 体积减半：nod-smile 15.3→6.3MB、frown-wave 17.6→8.3MB（去掉了
  despill/光雾衰减产生的大量半透明像素，WebP 压缩更有效）；
- 原件备份 `bak/openmm-reconvert/`；`webp-duration.test.ts` 变体回归值
  5025→4958（74 帧）；`npm run build && npm run verify` 21 项绿、269 测试绿。

## 已否决的替代

- **继续修自研管线（第五案）**：四轮修复证明该路线在「深色衣物 × 绿幕 ×
  浅色展示背景」组合下按起葫芦浮起瓢；经典态同源素材证明无需任何颜色
  操作即可正确，继续修是负收益。
- **只对变体跑 variant_color_match 拉暖**：治标——白点能对齐，但洗白的
  半透明衣料与粉灰观感不随白点恢复；且每批新素材都要手工调参。

## 后果

- `variant_video_convert.py`（自研管线）**降级为留档**：不再作为新素材
  入库路径；其 QC 门（block-max / 中性帧复验）与水印擦除仍被新脚本复用。
- `variant_color_match.py` 保留：仅用于「换生成批次」场景的白点重定靶，
  本次重转素材**未**使用（同源生成无需校正）。
- 变体帧数 75→74：`VARIANT_SEGMENT_MS=5092`（76 帧名义上界）不变，
  运行期按 ANMF 真实时长推进，74 ≤ 76 上界成立。
- 新素材入库流程更新见 `tools/README.md` §2。

## 关联

- `tools/openmm_chroma_convert.py` — 新入库管线实现。
- `E:\work\sp\openCodeMM\scripts\chroma_key_green.py` — 方式来源（素材源项目）。
- `docs/adr/0020-despill-first-alpha.md` — 第三案之前的修复路线（管线层面
  被本决策取代，其「目检条底色必须浅色」教训被继承）。
- `docs/adr/0012-loop-defect-asset-repair.md` — 素材规格与备份惯例。
