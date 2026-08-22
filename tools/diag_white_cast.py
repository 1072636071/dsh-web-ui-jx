# -*- coding: utf-8 -*-
"""诊断 working-v2/v3/v4 白偏红：对比各变体的白像素 RGB 均值、
源视频首帧白像素、以及去溢色对白像素的实际作用量。"""
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


def sample_white(im_or_arr, label=""):
    """取 alpha>200 且亮度>170 的「白像素」的 RGB 均值与像素数。"""
    if isinstance(im_or_arr, Image.Image):
        arr = np.asarray(im_or_arr.convert("RGBA"), dtype=np.int32)
    else:
        arr = np.asarray(im_or_arr, dtype=np.int32)
    a = arr[:, :, 3]
    lum = arr[:, :, :3].mean(axis=2)
    mask = (a > 200) & (lum > 170)
    if mask.sum() == 0:
        print(f"  {label}: 无白像素")
        return None
    r = float(arr[:, :, 0][mask].mean())
    g = float(arr[:, :, 1][mask].mean())
    b = float(arr[:, :, 2][mask].mean())
    print(f"  {label}: n={int(mask.sum()):>6}  R={r:5.1f} G={g:5.1f} B={b:5.1f}  "
          f"G-R={g-r:+5.1f} B-R={b-r:+5.1f}")
    return (r, g, b, int(mask.sum()))


def frame0_from_video(name):
    tmp = tempfile.mkdtemp()
    subprocess.run([FF, "-y", "-i",
                    os.path.join(VIDEO_DIR, name + ".mp4"),
                    "-frames:v", "1", os.path.join(tmp, "f0.png")],
                   capture_output=True)
    return np.asarray(Image.open(os.path.join(tmp, "f0.png")).convert("RGB"),
                      dtype=np.int32)


def main():
    # 1. 各变体入库后的白像素
    print("=== 入库素材（白像素 RGB 均值，alpha>200 且亮度>170）===")
    for st in ["idle", "working",
               "idle-v2", "idle-v3", "idle-v4",
               "working-v2", "working-v3", "working-v4"]:
        im = Image.open(os.path.join(CHAR, st + ".webp"))
        im.seek(10)
        sample_white(im, st)

    # 2. 各视频源帧 0 的白像素（未去绿幕）
    print("\n=== 源视频帧 0（RGB，未键控）===")
    for name in ["待机-张望", "待机-舒展", "待机-整理饰物",
                 "工作-画圈", "工作-画横", "工作-来回"]:
        f0 = frame0_from_video(name)
        # 白像素：亮度>200
        lum = f0.mean(axis=2)
        mask = lum > 200
        if mask.sum() == 0:
            print(f"  {name}: 无白像素")
            continue
        r = float(f0[:, :, 0][mask].mean())
        g = float(f0[:, :, 1][mask].mean())
        b = float(f0[:, :, 2][mask].mean())
        print(f"  {name}: n={int(mask.sum()):>6}  R={r:5.1f} G={g:5.1f} B={b:5.1f}  "
              f"G-R={g-r:+5.1f} B-R={b-r:+5.1f}")


if __name__ == "__main__":
    main()
