# sub-task/002 — webp 动画真实帧时长查证（播放机制前置事实）

**状态**：已完成
**创建**：2026-08-19
**关联**：memorial 004-transition-animation-complete · 播放机制（当前 `DEFAULT_TRANSITION_DURATION_MS = 800ms` setTimeout 推进，可能截断或空等）

## 背景

`CharacterOverlay.tsx:317-328` 用 `<img src>` 播 webp，过渡段靠 `setTimeout(durationMs)` 推进到下一段；800ms 是保守猜测值，素材真实时长未知。

## 调查任务

对 `assets/character/` 下素材回答：

1. **能否解析出每段 webp 动画的真实时长**？
   - webp 动画由 ANMF chunk 组成，每个 chunk 带 `Frame Duration (24-bit)` 字段（单位 1ms）。
   - 方法 A：找 node_modules 里现成的解析库（如 `webp-parser`、`sharp` 元数据？sharp 不解析动画帧时长；ffprobe 若系统有）。
   - 方法 B：手写最小 ANMF 解析脚本（webp RIFF 容器：`RIFF` + size + `WEBP`，循环 chunk 找 `VP8X`（动画标志）→ `ANIM`（背景色 + loop count）→ `ANMF`（x/y/w/h/时长/帧数据））。已安装依赖里是否有 `@webassemblyjs` 之类无关；判断是否需要装新依赖（优先不装）。
   - 检查系统是否有 `ffprobe`/`magick`（ImageMagick）可用。
2. **采样统计**：对全部 46 个 webp 输出：文件名、帧数、总时长 ms、平均帧时长。若无法解析全部，至少采样 5 个代表性素材（idle/thinking/transition-idle-thinking/transition-idle-permission/transition-error-idle）。
3. **关键结论**：
   - 过渡段素材时长分布区间（最短/最长/典型）——800ms 假设偏差多大？
   - 循环态素材时长——影响"循环"的观感（短循环会不会闪）。
   - 是否值得引入"解析时长 → 动态 durationMs"（vs 保持常量 800ms）。

## 约束

- 临时脚本放 `.temp/scripts/`，输出放 `.temp/output/`。
- 优先不安装新 npm 依赖；能用已装依赖或系统工具最好，都不行再评估手写解析（webp ANMF 解析约 40 行，纯读 Buffer 即可，不依赖包）。
- 不要修改 `assets/` 下任何文件。

## 输出

- 解析方法（用的是什么）
- 46 个素材时长表（或采样表）
- 三条关键结论

## 调查结果

（2026-08-19 完成，46/46 全量解析，0 失败）

### 解析方法

- 依赖/工具盘点：package.json / node_modules 无任何 webp 解析库（sharp、webp-parser、image-size 均未安装，lock 文件无传递依赖）；系统无 ffprobe / magick / ffmpeg 可用。
- 采用方法 B：手写最小 RIFF/WEBP ANMF 解析（.temp/scripts/parse-webp-duration.mjs，约 60 行，纯 Buffer 读取，零依赖）。流程：RIFF+size+WEBP 头 → 遍历 chunk 找 VP8X（bit 0x02 动画标志）、ANIM（loop count）、ANMF（帧时长 24-bit LE ms，位于 ANMF payload 偏移 12..14；初始偏移错误经 .temp/scripts/verify-offset.mjs hex 校验修正）。
- 全量结果：.temp/output/webp-duration.json（46 行，含 bytes / frames / totalMs / avgMs / minFrameMs / maxFrameMs / loopCount / error）。
- 规律验证：.temp/scripts/verify-pattern.mjs（536ms 收尾帧 36/36 全中，无异常文件）、.temp/scripts/frame-hist.mjs、.temp/scripts/stats.mjs。
- 未修改 assets/ 任何文件，未安装任何依赖。

### 46 素材时长表（全量）

帧结构规律：所有素材常规帧一律 67ms（约 14.9fps）；过渡段最后一帧统一 536ms（收尾定格）。

| 类别 | 文件数 | 帧数 | 帧构成 | 总时长 ms |
|------|-------|------|--------|----------|
| 循环态（idle/thinking/reading/replying/working/error/welcome/done/permission/listening） | 10 | 75 | 75 × 67ms | 5025 |
| 过渡段 45 帧型 | 16 | 45 | 44 × 67ms + 1 × 536ms | 3484 |
| 过渡段 75 帧型 | 20 | 75 | 74 × 67ms + 1 × 536ms | 5494 |

45 帧型（3484ms，16 个）：done-idle、frown-wave-permission、idle-done、idle-permission、idle-replying、idle-thinking、idle-welcome、idle-working、nod-smile-permission、permission-frown-wave、permission-idle、permission-nod-smile、replying-idle、thinking-idle、welcome-idle、working-idle。

75 帧型（5494ms，20 个）：cheek-rest-idle、chin-rest-idle、error-idle、frown-wave-idle、idle-cheek-rest、idle-chin-rest、idle-error、idle-frown-wave、idle-listening、idle-nod-smile、idle-reading、idle-shush、idle-shy-smile、listening-idle、nod-smile-idle、reading-idle、replying-thinking、shush-idle、shy-smile-idle、thinking-replying。

全部 46 个 loopCount：循环态 0（无限循环），过渡段 1（播一次后定格末帧）。文件体积 2.4MB–7.4MB，与既往记录一致。逐文件明细见 .temp/output/webp-duration.json。

### 三条关键结论

1. 过渡段时长分布：只有两个离散值，无连续分布——3484ms（16 个，45 帧）与 5494ms（20 个，75 帧）；最短 3484ms、最长 5494ms，典型值两类各半。所有过渡段末尾统一 536ms 驻留帧（收尾定格到目标表情后再交给 loop）。
2. 循环态时长：10 个循环态全部 5025ms/圈（75 × 67ms），无限循环。67ms/帧约 14.9fps，动作节奏偏慢但不会闪烁；5 秒一圈的等待节奏观感稳定。
3. 800ms 常量假设偏差评估：严重低估，偏差 4.4×–6.9×。CharacterOverlay.tsx:330-331 的 setTimeout(800ms) 只覆盖真实过渡时长的 14.6%–23.0%——过渡动画只播约 12 帧（约 1/4 进度）就被切到下一段，角色在过渡中途跳变，536ms 收尾定格永远不出现。值得引入「解析时长 → 动态 durationMs」：transition item 已预留 durationMs 字段（current.durationMs ?? DEFAULT 回退），只需加载时跑一遍约 45 行的 ANMF 扫描（纯 Buffer 零依赖，运行时成本可忽略）即可精确填充；备选方案是零解析按两档硬编码（3484/5494），但动态解析对素材增改更稳健。推进时机建议取 totalMs 整值，保留末帧 536ms 定格可让过渡与目标 loop 无缝衔接。