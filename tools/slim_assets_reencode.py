#!/usr/bin/env python3
"""
M4/工单 20-05 —— assets 全量瘦身（>6MB 有损重编码）。

背景（PRD 20 候选 H2 / memorial 017）：assets 总体积 ≈187MB，>6MB 共 14 个文件
（单文件最大 happy.webp 12.37MB）。治理策略经 happy 单文件试压确认
（`.temp/output/slim-probe/`）：
- 帧时长 33ms（30fps）的反应态（happy/angry/surprised）——**抽帧到 15fps**：
  每 2 帧取 1，帧时长 ×2，总动画时长**逐文件精确不变**（帧数为偶，验证通过），
  与全库其余循环态一致的 15fps 节奏；quality=72。
- 其余 15fps（67ms）循环/过渡态——仅降有损质量 quality=72，帧数与时长不变。
- 一律保留 360×640 分辨率与 loop=0；method=4（耗时/质量平衡档，见 ADR-0012）。

无损判据（实测）：
- 全帧平均 PSNR ≥ 32.5（q72/保帧率档 ≈33.7，视觉保真良好）；
- 首尾缝由原始 ~3.7 升到 5~7（运动 + 压缩噪声量级，140×249 展示下不可感）；
- manifest 时长、素材数量、循环语义全部不变 → `webp-duration.test.ts` 硬编码
  回归值零改动仍全绿。

原件备份：仓库根 `bak/slim-reencode/`（.gitignore 已忽略，不入 git，可回滚）。
中途强杀会留 0 字节文件→改为写临时件 + os.replace 原子落盘。

用法：
  python tools/slim_assets_reencode.py --dry-run   # 只报告计划，不落盘
  python tools/slim_assets_reencode.py             # 备份原件 + 重编码 + 出目检条

每次产出：stdout 前后体积报告 + `.temp/output/slim-gov/{name}.{light,dark}.png`
目检条（上行原始 / 下行重编码）。素材视觉回归（暗/亮两底）以此条为闸。
"""
import os
import shutil
import struct
import sys

import numpy as np
from PIL import Image

CHAR_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "character")
BAK_DIR = os.path.join(os.path.dirname(__file__), "..", "bak", "slim-reencode")
GOV_OUT = os.path.join(os.path.dirname(__file__), "..", ".temp", "output", "slim-gov")

THRESHOLD_MB = 6.0          # 治理阈值：> 6MB
QUALITY = 72                # 有损目标质量
METHOD = 4                  # 编码努力档

DRY_RUN = "--dry-run" in sys.argv
LIGHT_BG = (245, 241, 232, 255)
DARK_BG = (28, 28, 32, 255)
STRIP_FRAMES = 8


def read_u24(bytes_buf, offset):
    return bytes_buf[offset] | (bytes_buf[offset + 1] << 8) | (bytes_buf[offset + 2] << 16)


def fourcc(bytes_buf, offset, tag):
    return bytes_buf[offset:offset + 4] == tag.encode()


def parse_webp(buf):
    """返回 (总时长ms, 逐帧时长列表, loop_flag)."""
    end = min(len(buf), 8 + struct.unpack_from("<I", buf, 4)[0])
    offset = 12
    total = 0
    dur = []
    loop_flag = None
    while offset + 8 <= end:
        tag = buf[offset:offset + 4]
        size = struct.unpack_from("<I", buf, offset + 4)[0]
        payload = offset + 8
        if payload + size > end:
            break
        if fourcc(buf, offset, "ANIM") and size >= 6:
            loop_flag = struct.unpack_from("<H", buf, payload + 4)[0]
        elif fourcc(buf, offset, "ANMF") and size >= 16:
            dur.append(read_u24(buf, payload + 12))
            total += read_u24(buf, payload + 12)
        offset = payload + size + (size & 1)
    return total, dur, loop_flag if loop_flag is not None else 0


def load_frames(path):
    im = Image.open(path)
    w, h = im.size
    frames = [im.seek(i) or im.convert("RGBA") for i in range(im.n_frames)]
    return frames, w, h


def rgba(f):
    return np.asarray(f, dtype="float32")


def vis_mask(a, b):
    return (a[..., 3] > 0) | (b[..., 3] > 0)


def seam(a, b):
    m = vis_mask(a, b)
    if not m.any():
        return 0.0
    return float(np.abs(a - b)[..., :3].mean(axis=2)[m].mean())


def psnr(a, b):
    both = (a[..., 3] > 128) & (b[..., 3] > 128)
    if not both.any():
        return 0.0
    mse = ((a - b)[..., :3] ** 2).mean(axis=2)[both].mean()
    if mse == 0:
        return 99.0
    return 10 * np.log10(255 * 255 / mse)


def reencode(sel, durations, out_tmp, loop):
    sel[0].save(
        out_tmp,
        save_all=True,
        append_images=sel[1:],
        duration=durations,
        loop=loop,
        quality=QUALITY,
        method=METHOD,
        lossless=False,
        format="WEBP",
    )


def contact_strip(orig_frames, new_frames, path, bg):
    idx = np.linspace(0, min(len(orig_frames), len(new_frames)) - 1, STRIP_FRAMES).astype(int)
    w, h = orig_frames[0].size
    strip = Image.new("RGBA", (w * STRIP_FRAMES * 2, h), bg)
    for col, i in enumerate(idx):
        for src, x in ((orig_frames, col * w), (new_frames, STRIP_FRAMES * w + col * w)):
            strip.paste(src[i], (x, 0))
    strip.convert("RGB").save(path)


def main():
    os.makedirs(GOV_OUT, exist_ok=True)
    targets = []
    for fname in sorted(os.listdir(CHAR_DIR)):
        if not fname.lower().endswith(".webp"):
            continue
        filepath = os.path.join(CHAR_DIR, fname)
        size = os.path.getsize(filepath)
        if size > THRESHOLD_MB * 1024 * 1024:
            raw = open(filepath, "rb").read()
            total_ms, durs, loop = parse_webp(raw)
            targets.append(dict(fname=fname, size=size, total_ms=total_ms, durs=durs, loop=loop))

    print(f"治理目标：{len(targets)} 个 >{THRESHOLD_MB}MB 素材")
    before_total = 0
    after_total = 0
    total_saved = 0
    for t in targets:
        filepath = os.path.join(CHAR_DIR, t["fname"])
        frames, w, h = load_frames(filepath)
        durs = t["durs"]
        d0 = durs[0] if durs else 0
        # 30fps(33ms) 反应态 → 抽帧到 15fps；15fps(67ms) 循环/过渡态保留帧率
        decimate = bool(d0) and d0 < 67
        if decimate:
            sel = frames[::2]
            new_durs = [d * 2 for d in durs[::2]]   # 33→66，总时长逐帧精确不变
        else:
            sel = frames
            new_durs = list(durs)                    # 逐帧时长原样保留（含 536ms 定格尾）
        new_total = sum(new_durs)
        reason = "30fps→15fps + q72" if decimate else "仅 q72"
        if DRY_RUN:
            print(f"  {t['fname']:34s} {t['size']/1e6:6.2f}MB  → {reason}  "
                  f"({t['total_ms']}ms -> {new_total}ms, {len(sel)}/{(len(frames))}帧 loop={t['loop']})")
            continue
        # 备份原件（仅一次）
        bak = os.path.join(BAK_DIR, t["fname"])
        if not os.path.exists(bak):
            os.makedirs(BAK_DIR, exist_ok=True)
            shutil.copy2(filepath, bak)
        # 写临时件再原子替换，避免强杀留 0 字节
        tmp = filepath + ".slimtmp"
        try:
            reencode(sel, new_durs, tmp, t["loop"])
            os.replace(tmp, filepath)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
        # 度量重编码结果
        nf, _, _ = load_frames(filepath)
        pavg = float(np.mean([psnr(rgba(a), rgba(b)) for a, b in zip(sel, nf)]))
        s = seam(rgba(nf[0]), rgba(nf[-1]))
        new_sz = os.path.getsize(filepath)
        before_total += t["size"]
        after_total += new_sz
        total_saved += t["size"] - new_sz
        print(f"  {t['fname']:34s} {t['size']/1e6:6.2f}MB -> {new_sz/1e6:6.2f}MB "
              f"({100*new_sz/t['size']:3.0f}%)  {reason}  total={new_total}ms "
              f"seam={s:4.2f} pavg={pavg:4.1f}")
        for bg, tag in ((LIGHT_BG, "light"), (DARK_BG, "dark")):
            out = os.path.join(GOV_OUT, f"{t['fname'].replace('.webp','')}.{tag}.png")
            contact_strip(frames, nf, out, bg)
    if not DRY_RUN:
        print(f"\n治理前 >6MB 合计 {before_total/1e6:.1f}MB → 治理后 {after_total/1e6:.1f}MB "
              f"（省 {total_saved/1e6:.1f}MB，{(100*(1-after_total/before_total)):.0f}%）")


if __name__ == "__main__":
    main()