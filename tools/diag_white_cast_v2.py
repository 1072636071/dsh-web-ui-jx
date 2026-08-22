# -*- coding: utf-8 -*-
"""收紧版白偏红诊断：同帧（帧 0）+ 纯不透明（alpha>240）测量，
并在 chroma_key 内部加探针，分步看 un-premultiply 与 despill 各自的贡献。"""
import os
import subprocess
import tempfile

import imageio_ffmpeg
import numpy as np
from PIL import Image

FF = imageio_ffmpeg.get_ffmpeg_exe()
VIDEO_DIR = r"C:\Users\jxc1\Downloads"
CHAR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "assets", "character")


def frame0_from_video(name):
    tmp = tempfile.mkdtemp()
    subprocess.run([FF, "-y", "-i",
                    os.path.join(VIDEO_DIR, name + ".mp4"),
                    "-frames:v", "1", os.path.join(tmp, "f0.png")],
                   capture_output=True)
    return np.asarray(Image.open(os.path.join(tmp, "f0.png")).convert("RGB"),
                      dtype=np.float32)


def chroma_key_steps(arr, green):
    """分步跑 chroma_key，返回中间产物。"""
    gr, gg, gb = green
    dist = np.sqrt(
        (arr[:, :, 0] - gr) ** 2
        + (arr[:, :, 1] - gg) ** 2
        + (arr[:, :, 2] - gb) ** 2
    )
    alpha = np.clip((dist - 42) / (105 - 42), 0, 1)

    # 步骤 1: 仅 alpha（不做任何颜色修正）
    step1 = np.dstack([arr, alpha * 255]).astype(np.uint8)

    # 步骤 2: un-premultiply
    bg = np.array([gr, gg, gb], dtype=np.float32)
    a_safe = np.maximum(alpha, 0.05)
    rgb = (arr - (1 - alpha)[:, :, None] * bg) / a_safe[:, :, None]
    rgb = np.clip(rgb, 0, 255)
    step2 = np.dstack([rgb, alpha * 255]).astype(np.uint8)

    # 步骤 3: despill
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    mean_rb = (r + b) / 2
    near_bg = dist < 190
    spill = (g > mean_rb + 4) & ((sat < 50) | near_bg)
    rgb_d = rgb.copy()
    rgb_d[:, :, 1] = np.where(spill, mean_rb, g)
    step3 = np.dstack([rgb_d, alpha * 255]).astype(np.uint8)

    return step1, step2, step3, spill


def white_stats(arr, alpha_thresh=240, lum_thresh=170):
    a = arr[:, :, 3].astype(np.int32)
    rgb = arr[:, :, :3].astype(np.int32)
    lum = rgb.mean(axis=2)
    mask = (a > alpha_thresh) & (lum > lum_thresh)
    if mask.sum() == 0:
        return None
    r = float(rgb[:, :, 0][mask].mean())
    g = float(rgb[:, :, 1][mask].mean())
    b = float(rgb[:, :, 2][mask].mean())
    return (int(mask.sum()), r, g, b, g - r, b - r)


def main():
    cases = [
        ("idle-v4", "待机-整理饰物", (0, 211, 51)),
        ("working-v2", "工作-画圈", (42, 143, 61)),
        ("working-v4", "工作-来回", (44, 145, 61)),
    ]
    for out_name, video_name, green in cases:
        print(f"\n=== {out_name} <- {video_name} (bg={green}) ===")
        src = frame0_from_video(video_name)
        step1, step2, step3, spill_mask = chroma_key_steps(src, green)
        print(f"  源（未处理）白像素: {white_stats(np.dstack([src, np.full(src.shape[:2], 255)]))}")
        print(f"  步骤 1（仅 alpha）: {white_stats(step1)}")
        print(f"  步骤 2（un-premult）: {white_stats(step2)}")
        print(f"  步骤 3（despill）:   {white_stats(step3)}")
        print(f"  despill 触发像素数: {int(spill_mask.sum())}")
        # 入库素材（实际输出）
        im = Image.open(os.path.join(CHAR, out_name + ".webp"))
        im.seek(0)
        out_arr = np.asarray(im.convert("RGBA"))
        print(f"  入库素材帧 0 白像素: {white_stats(out_arr)}")


if __name__ == "__main__":
    main()
