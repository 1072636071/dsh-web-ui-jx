# -*- coding: utf-8 -*-
"""变体素材白点重定靶：让 {state}-vN.webp 的白点匹配所属状态主素材 {state}.webp。

背景（2026-08-23）：
  变体转码管线（variant_video_convert.py）的自动白平衡目标是「中性白」，
  但角色基准盘（10 经典态主素材）本身是暖调——实测白点 G-R≈-13~-15、
  B-R≈-7~-14。中性化后 6 个变体白点 G-R≈-2，与全库其余 55 个素材脱钩，
  轮换/过渡边界处可见肤色发色冷暖跳变。

方案：
  以状态主素材的白点为参考（用户从未对经典态观感提出异议），对每个变体
  推导 G/B 通道增益（R 不动），全帧统一应用后重编码。一次生成、确定性可复现。

口径：
  白点 = alpha>240 且 lum>170 的像素集的通道均值；逐帧采样后取中位数。
  与 diag_red_cast_round4.py 一致，便于前后对照。

用法：
  python tools/variant_color_match.py --dry-run   # 只报告计划与增益
  python tools/variant_color_match.py             # 备份原件并落盘

产出：
  assets/character/{name}.webp 重写（360x640、67ms/帧、loops=1 不变）；
  原件备份 bak/variant-pre-colormatch/{name}.webp（已存在不覆盖）。
"""
import argparse
import os

import numpy as np
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAR = os.path.join(REPO, "assets", "character")
BAK = os.path.join(REPO, "bak", "variant-pre-colormatch")
SAMPLE_FRAMES = 16

# 变体 → 所属状态主素材（参考白点来源）
PAIRS = {
    "idle-v2": "idle",
    "idle-v3": "idle",
    "idle-v4": "idle",
    "working-v2": "working",
    "working-v3": "working",
    "working-v4": "working",
}

# 与源文件一致的重编码参数
FRAME_MS = 67
LOOP = 1
METHOD = 4


def asset_frames(path):
    im = Image.open(path)
    n = getattr(im, "n_frames", 1)
    idxs = (
        sorted({int(round(i * (n - 1) / (SAMPLE_FRAMES - 1))) for i in range(SAMPLE_FRAMES)})
        if n > 1
        else [0]
    )
    for i in idxs:
        im.seek(i)
        yield np.asarray(im.convert("RGBA"), dtype=np.float32)


def white_point_means(arr):
    """单帧白像素（alpha>240 且 lum>170）的 (R,G,B) 均值；样本不足返回 None。"""
    rgb = arr[:, :, :3]
    a = arr[:, :, 3]
    m = (a > 240) & (rgb.mean(axis=2) > 170)
    if int(m.sum()) < 50:
        return None
    return (float(rgb[:, :, 0][m].mean()), float(rgb[:, :, 1][m].mean()),
            float(rgb[:, :, 2][m].mean()))


def median_white_point(path):
    pts = [p for p in (white_point_means(a) for a in asset_frames(path)) if p]
    if not pts:
        return None
    r = float(np.median([p[0] for p in pts]))
    g = float(np.median([p[1] for p in pts]))
    b = float(np.median([p[2] for p in pts]))
    return (r, g, b)


def read_frame_durations(path):
    """从 ANMF chunk 读每帧时长（Pillow 读不到这些文件的 duration）。"""
    import struct

    with open(path, "rb") as f:
        data = f.read()
    if data[0:4] != b"RIFF" or data[8:12] != b"WEBP":
        return []
    off, ds = 12, []
    while off + 8 <= len(data):
        tag = data[off:off + 4]
        (size,) = struct.unpack("<I", data[off + 4:off + 8])
        body = off + 8
        if tag == b"ANMF":
            d = data[body + 12] | (data[body + 13] << 8) | (data[body + 14] << 16)
            ds.append(d)
        off = body + size + (size % 2)
    return ds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    refs = {}
    for state in sorted(set(PAIRS.values())):
        refs[state] = median_white_point(os.path.join(CHAR, f"{state}.webp"))
        r, g, b = refs[state]
        print(f"参考 {state}.webp 白点 R={r:.1f} G={g:.1f} B={b:.1f} "
              f"(G-R={g - r:+.1f} B-R={b - r:+.1f})")
    print()

    for name, state in PAIRS.items():
        path = os.path.join(CHAR, f"{name}.webp")
        vp = median_white_point(path)
        if vp is None or refs[state] is None:
            print(f"{name}: 无有效白点，跳过")
            continue
        vr, vg, vb = vp
        rr, rg, rb = refs[state]
        # 目标：G'-R' = rg-rr，B'-R' = rb-rr（R 不动）
        kg = (vr + (rg - rr)) / vg
        kb = (vr + (rb - rr)) / vb
        print(f"{name}: 现白点 G-R={vg - vr:+.1f} B-R={vb - vr:+.1f} → 目标 "
              f"G-R={rg - rr:+.1f} B-R={rb - rr:+.1f}  增益 kg={kg:.4f} kb={kb:.4f}")
        if abs(kg - 1) < 0.005 and abs(kb - 1) < 0.005:
            print(f"{name}: 已在容差内，跳过")
            continue
        if args.dry_run:
            continue

        durations = read_frame_durations(path)
        assert durations and all(d == FRAME_MS for d in durations), \
            f"{name}: 帧时长异常 {sorted(set(durations))}"
        n_frames = getattr(Image.open(path), "n_frames", 1)

        os.makedirs(BAK, exist_ok=True)
        bak_path = os.path.join(BAK, f"{name}.webp")
        if not os.path.exists(bak_path):
            Image.open(path).save(bak_path)  # 字节级原样备份
            print(f"  已备份 → {bak_path}")

        im = Image.open(path)
        out_frames = []
        for i in range(n_frames):
            im.seek(i)
            arr = np.asarray(im.convert("RGBA"), dtype=np.float32)
            arr[:, :, 1] = np.clip(arr[:, :, 1] * kg, 0, 255)
            arr[:, :, 2] = np.clip(arr[:, :, 2] * kb, 0, 255)
            out_frames.append(Image.fromarray(arr.astype(np.uint8), "RGBA"))

        out_frames[0].save(
            path,
            save_all=True,
            append_images=out_frames[1:],
            duration=durations,
            loop=LOOP,
            method=METHOD,
            minimize_size=False,
        )
        # 复测
        vp2 = median_white_point(path)
        if vp2:
            print(f"  落盘复测: G-R={vp2[1] - vp2[0]:+.1f} B-R={vp2[2] - vp2[0]:+.1f} "
                  f"(目标 {rg - rr:+.1f}/{rb - rr:+.1f})")


if __name__ == "__main__":
    main()
