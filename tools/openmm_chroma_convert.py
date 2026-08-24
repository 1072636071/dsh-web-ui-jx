# -*- coding: utf-8 -*-
"""openCodeMM 方式绿幕转码（ffmpeg YUV chromakey）——偏红问题的最终方案。

背景
----
本仓库自研 chroma_key 管线（`variant_video_convert.py` 的 RGB 距离坡道
alpha + un-premultiply + despill + 全片白平衡）经 ADR-0020 等多轮修复后，
新素材的深色和服在浅色页面上**仍**呈粉白/偏红（2026-08-24 用户复报
「偏红问题依然存在」）。浅底目检定位：自研管线把深色和服洗成半透明
粉灰，而全部经典态素材（素材源项目 openCodeMM 的 ffmpeg YUV chromakey
管线产出）从未被投诉——它们就是角色的标准色盘。

本次改用 openCodeMM 的 `scripts/chroma_key_green.py` 方式
（决策记录 `docs/adr/0021-openmm-chromakey-reconvert.md`）：
  1. 每文件自动探测绿幕底色（首帧四角像素均值，auto-color）；
  2. ffmpeg chromakey 滤镜基于 YUV 色度平面抠绿（similarity=0.20、
     blend=0.03 边缘羽化）——不做 RGB 距离坡道、不做 un-premultiply、
     不做 despill、不做白平衡，颜色原样保留；
  3. 右下角水印矩形清透明（本仓库校准区 x>0.72w、y>0.92h）；
  4. Pillow 合成 WebP（360×640、67ms/帧、quality=90、method=4）。

模式
----
  variant：一次性播放（loop=1）——变体素材，轮换推进；
  loop：pingpong 烘焙（正放+倒放、端点不重复，单圈 2n-2 帧，loop=0）
        ——循环体素材，同经典态规格。

质检（报告制 + 浅底目检条为闸）
----
  指标a 局部突变扫描（block-max，上限 165）；
  指标b 首尾帧 vs 中性参考（变体=idle.webp 首帧 / 循环体=入场过渡尾帧）；
  指标c 不透明占比与暗部占比（洗白缺陷量化，经典态 ≈40%/44%）；
  目检条 浅色宣纸底首/中/尾三帧 -> .temp/output/openmm-reconvert/。

原件备份 bak/openmm-reconvert/（不进 git）。
用法：
  python tools/openmm_chroma_convert.py             # 转 CONVERSIONS 全部
  python tools/openmm_chroma_convert.py idle-v2     # 只转一个
  python tools/openmm_chroma_convert.py --dry-run   # 只跑质检，不落盘
新素材入库：在 CONVERSIONS 加一行（源视频放 openCodeMM docs/video/）。
"""
import os
import shutil
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "tools"))

import numpy as np
from PIL import Image
from variant_video_convert import (
    FRAME_MS, TARGET_SIZE, QUALITY, METHOD,
    erase_watermark, block_max_diff, neutral_diff, median,
)

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
VIDEO_DIR = r"E:\work\sp\openCodeMM\docs\video"
CHAR = os.path.join(REPO, "assets", "character")
OUT = os.path.join(REPO, ".temp", "output", "openmm-reconvert")
BAK = os.path.join(REPO, "bak", "openmm-reconvert")

SIMILARITY = 0.20   # openCodeMM 2026-08 纯绿批次校准值
BLEND = 0.03        # 边缘羽化
WM_RECT = (0.72, 0.92)  # 本仓库校准水印区（x>0.72w, y>0.92h）

# 目标名 -> (源视频相对路径, 模式)；mode: variant=一次性 / loop=pingpong循环体
CONVERSIONS = {
    "idle-v2":    (os.path.join("循环的", "待机-左右张望-待机.mp4"), "variant"),
    "idle-v3":    (os.path.join("循环的", "待机-耸肩-待机.mp4"), "variant"),
    "idle-v4":    (os.path.join("循环的", "待机-整理衣服-待机.mp4"), "variant"),
    "nod-smile":  ("nod-smile.mp4", "loop"),
    "frown-wave": ("frown-wave.mp4", "loop"),
}

BG_LIGHT = (245, 240, 232)  # 目检条浅色宣纸底


def detect_bg_color(src_path):
    """openCodeMM 方式：首帧四角像素均值作绿幕底色。"""
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "f.png")
        r = subprocess.run(
            [FF, "-y", "-hide_banner", "-loglevel", "error",
             "-i", src_path, "-vf", "select=eq(n\\,0)", "-frames:v", "1", p],
            capture_output=True, text=True, stdin=subprocess.DEVNULL,
        )
        if r.returncode != 0 or not os.path.isfile(p):
            return None
        im = Image.open(p).convert("RGB")
        w, h = im.size
        pts = [(5, 5), (w - 5, 5), (5, h - 5), (w - 5, h - 5)]
        samples = [im.getpixel(q) for q in pts]
        im.close()
        return tuple(sum(s[i] for s in samples) // len(samples) for i in range(3))


def ffmpeg_key_frames(src_path, color):
    """ffmpeg chromakey 抠绿 → 67ms 重定时 → 360×640，返回 RGBA 帧列表。"""
    vf = (
        f"chromakey=0x{color[0]:02X}{color[1]:02X}{color[2]:02X}:"
        f"{SIMILARITY}:{BLEND},format=yuva420p,"
        f"fps={1000 / FRAME_MS:.6f},"
        f"scale={TARGET_SIZE[0]}:{TARGET_SIZE[1]}:flags=lanczos"
    )
    with tempfile.TemporaryDirectory() as td:
        r = subprocess.run(
            [FF, "-y", "-hide_banner", "-loglevel", "error",
             "-i", src_path, "-an", "-vf", vf,
             os.path.join(td, "f_%04d.png")],
            capture_output=True, text=True, stdin=subprocess.DEVNULL,
        )
        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg 抠绿失败: {r.stderr.strip()[:300]}")
        names = sorted(f for f in os.listdir(td) if f.endswith(".png"))
        if not names:
            raise RuntimeError("未生成任何帧")
        return [Image.open(os.path.join(td, n)).convert("RGBA") for n in names]


def alpha_stats(frames):
    """不透明占比 + 暗部（和服）占人体比：洗白缺陷量化对照。"""
    ops, darks = [], []
    for im in frames[:: max(1, len(frames) // 12)]:
        arr = np.asarray(im, dtype=np.float32)
        a = arr[:, :, 3]
        lum = arr[:, :, :3].mean(axis=2)
        body = a > 200
        if body.sum() < 100:
            continue
        ops.append(float((a > 240).mean()))
        darks.append(float((body & (lum < 90)).sum() / body.sum()))
    return median(ops), median(darks)


def light_strip(frames, path, label):
    """首/中/尾三帧浅色底目检条（贴近真实展示背景）。"""
    tw = 220
    th = int(tw * frames[0].height / frames[0].width)
    n = len(frames)
    strip = Image.new("RGB", (tw * 3 + 16, th + 8), BG_LIGHT)
    for k, idx in enumerate([0, n // 2, n - 1]):
        comp = Image.alpha_composite(
            Image.new("RGBA", frames[idx].size, BG_LIGHT + (255,)), frames[idx]
        )
        strip.paste(comp.resize((tw, th), Image.LANCZOS).convert("RGB"),
                    (k * (tw + 4) + 4, 4))
    strip.save(path)
    print(f"  [目检条] {label} -> {os.path.relpath(path, REPO)}")


def first_frame_of(path):
    im = Image.open(path)
    im.seek(0)
    return im.convert("RGBA")


def convert(name, rel, mode, dry_run=False):
    src = os.path.join(VIDEO_DIR, rel)
    print(f"\n=== {name} <- {rel} ({mode}) ===")
    if not os.path.isfile(src):
        print("  [失败] 源视频不存在")
        return False

    color = detect_bg_color(src)
    if color is None:
        print("  [失败] 底色探测失败")
        return False
    print(f"  [auto-color] 绿幕底色 RGB{color}")

    frames = ffmpeg_key_frames(src, color)
    n = len(frames)
    print(f"  [chromakey] similarity={SIMILARITY} blend={BLEND} -> {n} 帧 @67ms")

    # 水印 ROI 清透明（本仓库校准区）
    w0, h0 = frames[0].size
    wm = (int(w0 * WM_RECT[0]), int(h0 * WM_RECT[1]), w0 - 1, h0 - 1)
    frames = [erase_watermark(f, wm) for f in frames]
    print(f"  [水印] 右下角 {wm} 已清透明")

    # 指标a：局部突变（报告制）
    diffs = [block_max_diff(frames[i], frames[i + 1]) for i in range(n - 1)]
    top3 = sorted(enumerate(diffs), key=lambda t: -t[1])[:3]
    top3_str = ", ".join(f"f{i}:{d:.0f}" for i, d in top3)
    flag = "超限" if max(diffs) > 165.0 else "通过"
    print(f"  [指标a {flag}] top3: {top3_str} (med={median(diffs):.1f}, 上限165)")

    # 指标b：首尾帧 vs 中性参考（报告制）
    if mode == "variant":
        ref = first_frame_of(os.path.join(CHAR, "idle.webp"))
    else:
        ref_path = os.path.join(CHAR, f"transition-permission-{name}.webp")
        ref = None
        if os.path.isfile(ref_path):
            im = Image.open(ref_path)
            im.seek(im.n_frames - 1)
            ref = im.convert("RGBA")
    if ref is not None:
        if ref.size != frames[0].size:
            ref = ref.resize(frames[0].size, Image.LANCZOS)
        d0, d1 = neutral_diff(frames[0], ref), neutral_diff(frames[-1], ref)
        mark = "注意" if max(d0, d1) > 30.0 else "正常"
        print(f"  [指标b {mark}] 首/尾帧 vs 中性参考 = {d0:.1f} / {d1:.1f}"
              f"（匹配~24 错配~30）")

    # 指标c：不透明度/暗部占比（对照经典态 ≈40%/44%）
    op, dark = alpha_stats(frames)
    print(f"  [指标c] 不透明占比={op * 100:.1f}%  暗部占人体比={dark * 100:.1f}%")

    os.makedirs(OUT, exist_ok=True)
    light_strip(frames, os.path.join(OUT, f"{name}_light.png"), name)

    if dry_run:
        print("  [dry-run] 未落盘")
        return True

    # pingpong 烘焙（循环体）：正放 + 倒放，端点不重复
    if mode == "loop":
        frames = frames + frames[-2:0:-1]
        loop = 0
    else:
        loop = 1

    # 备份原件（首次才备份）
    out_path = os.path.join(CHAR, name + ".webp")
    if os.path.isfile(out_path):
        os.makedirs(BAK, exist_ok=True)
        bak_path = os.path.join(BAK, name + ".webp")
        if not os.path.isfile(bak_path):
            shutil.copy2(out_path, bak_path)
            print(f"  [备份] {name}.webp -> {os.path.relpath(bak_path, REPO)}")

    frames[0].save(
        out_path,
        save_all=True,
        append_images=frames[1:],
        duration=[FRAME_MS] * len(frames),
        loop=loop,
        quality=QUALITY,
        method=METHOD,
    )
    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"  [入库] {name}.webp {len(frames)}帧 "
          f"{len(frames) * FRAME_MS}ms loop={loop} {size_mb:.2f}MB")
    return True


def main():
    dry = "--dry-run" in sys.argv
    names = [a for a in sys.argv[1:] if a != "--dry-run"] or list(CONVERSIONS)
    results = {}
    for n in names:
        rel, mode = CONVERSIONS[n]
        results[n] = convert(n, rel, mode, dry_run=dry)
    print("\n汇总:", ", ".join(f"{k}={'OK' if v else 'FAIL'}"
                               for k, v in results.items()))
    sys.exit(0 if all(results.values()) else 1)


if __name__ == "__main__":
    main()
