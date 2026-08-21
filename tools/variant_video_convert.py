# -*- coding: utf-8 -*-
"""变体视频转码（memorial 008 / ADR-0013 D6/D8/D10）。

绿幕视频 → 一次性动画 webp 变体素材：
  1. 解码抽帧并重定时到 67ms/帧（对齐经典态节奏）；
  2. 色度键去绿幕（软边 alpha 坡道 + 半透明区去溢色）；
  3. 自动检测并擦除右下角「千问AI生成」水印（底部亮色低饱和文字块）；
  4. 三道质检门：
     a. 工作变体符咒全程在场（金色像素追踪）；
     b. 局部突变扫描（block-max 相邻帧差，防嵌入硬弹出）；
     c. 首尾帧 vs 主素材中性帧姿态复验（像素差阈值）；
  5. 降采样 360×640、编码 loops=1（播一遍）动画 webp 入 assets/character/。

用法：
  python tools/variant_video_convert.py              # 转码 CONVERSIONS 全部
  python tools/variant_video_convert.py idle-v2      # 只转一个
  python tools/variant_video_convert.py --dry-run    # 只质检报告，不落盘
"""
import os
import subprocess
import sys
import tempfile

import imageio_ffmpeg
import numpy as np
from PIL import Image

FF = imageio_ffmpeg.get_ffmpeg_exe()
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAR = os.path.join(REPO, "assets", "character")
OUT = os.path.join(REPO, ".temp", "output", "variant-convert")
VIDEO_DIR = r"C:\Users\jxc1\Downloads"

FRAME_MS = 67
TARGET_SIZE = (360, 640)
QUALITY = 90
METHOD = 4

# 输出素材名 -> (源视频名, 所属状态)
CONVERSIONS = {
    "idle-v2": ("待机-张望", "idle"),
    "idle-v3": ("待机-舒展", "idle"),
    "idle-v4": ("待机-整理饰物", "idle"),
    "working-v2": ("工作-画圈", "working"),
    "working-v3": ("工作-画横", "working"),
    "working-v4": ("工作-来回", "working"),
}

# 质检阈值（2026-08-22 实测校准）
GOLD_MIN_PX = 40          # 工作变体每帧最少金色像素（缩到 96 宽后）
POP_ABS_CAP = 140.0       # 局部突变绝对上限：修复 alpha 计算后实测合法快速运动 ≤136（画横弧扫），超过判闪烁故障
NEUTRAL_WARN = 30.0       # 首尾帧 vs 中性帧 报告阈值（匹配对实测 ~24、错配对 ~30，
                          # 分离度不足做硬闸，最终以目检条为闸）


def extract_frames(video_path):
    """ffmpeg 抽帧 + 重定时到 67ms/帧，返回 PNG 路径列表。"""
    tmpdir = tempfile.mkdtemp(prefix="jx_variant_")
    cmd = [
        FF, "-y", "-i", video_path,
        "-vf", f"fps={1000 / FRAME_MS:.6f}",
        os.path.join(tmpdir, "f_%04d.png"),
    ]
    subprocess.run(cmd, capture_output=True)
    names = sorted(f for f in os.listdir(tmpdir) if f.endswith(".png"))
    return [os.path.join(tmpdir, n) for n in names]


def chroma_key(img, green):
    """色度键：绿色主导度坡道转 alpha + 半透明区去溢色（numpy 向量化）。"""
    # int32：int16 平方会溢出（255²=65025 > 32767）产生 NaN
    arr = np.asarray(img.convert("RGBA"), dtype=np.int32)
    gr, gg, gb = green
    dist = np.sqrt(
        (arr[:, :, 0] - gr) ** 2
        + (arr[:, :, 1] - gg) ** 2
        + (arr[:, :, 2] - gb) ** 2
    )
    alpha = np.clip((dist - 42) / (105 - 42) * 255, 0, 255).astype(np.uint8)
    out = arr.astype(np.uint8).copy()
    out[:, :, 3] = alpha
    # 半透明区去溢色：g = min(g, max(r,b)+8)
    semi = alpha < 240
    max_rb = np.maximum(out[:, :, 0], out[:, :, 2]).astype(np.int16)
    g_clipped = np.minimum(out[:, :, 1].astype(np.int16), max_rb + 8)
    out[:, :, 1] = np.where(semi, g_clipped, out[:, :, 1]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def green_of(img):
    """四角像素均值作为绿幕底色。"""
    arr = np.asarray(img.convert("RGB"))
    h, w = arr.shape[:2]
    pts = [arr[3, 3], arr[3, w - 4], arr[h - 4, 3], arr[h - 4, w - 4]]
    return tuple(int(np.mean([p[i] for p in pts])) for i in range(3))


def erase_watermark(img, bbox):
    """擦除右下角水印区（固定区域，实测与角色裙摆完全分离）。"""
    if bbox is None:
        return img
    arr = np.asarray(img).copy()
    arr[bbox[1]: bbox[3] + 1, bbox[0]: bbox[2] + 1] = 0
    return Image.fromarray(arr, "RGBA")


def gold_px(img, width=96):
    """金色亮像素计数（符咒在场性，缩到 width 宽）。"""
    w, h = img.size
    f = img.resize((width, int(width * h / w)), Image.BILINEAR)
    arr = np.asarray(f, dtype=np.int16)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    mask = (a > 40) & (r > 170) & (g > 120) & (b < 150) & ((r - b) > 60)
    return int(mask.sum())


def block_max_diff(a, b, width=160, bs=20):
    """半宽下 20px 块的最大平均差（局部突变指标，numpy）。"""
    wa, ha = a.size
    th = int(width * ha / wa)
    A = np.asarray(a.resize((width, th), Image.BILINEAR), dtype=np.int16)
    B = np.asarray(b.resize((width, th), Image.BILINEAR), dtype=np.int16)
    d = np.abs(A - B).mean(axis=2)  # 每像素 RGBA 均值差
    mx = 0.0
    hb, wb = d.shape
    for by in range(0, hb - bs, bs):
        for bx in range(0, wb - bs, bs):
            v = float(d[by: by + bs, bx: bx + bs].mean())
            if v > mx:
                mx = v
    return mx


def neutral_diff(frame, ref_rgba, width=180):
    """变体帧 vs 中性参考帧（均合成到黑底）均值差（numpy）。"""
    w, h = frame.size
    th = int(width * h / w)
    f = np.asarray(frame.convert("RGBA").resize((width, th), Image.BILINEAR), dtype=np.float32)
    r = np.asarray(ref_rgba.resize((width, th), Image.BILINEAR), dtype=np.float32)
    # 合成到黑底：c * a/255
    fc = f[:, :, :3] * (f[:, :, 3:4] / 255.0)
    rc = r[:, :, :3] * (r[:, :, 3:4] / 255.0)
    return float(np.abs(fc - rc).mean())


def load_neutral_ref(state):
    im = Image.open(os.path.join(CHAR, state + ".webp"))
    im.seek(0)
    return im.convert("RGBA")


def median(xs):
    xs = sorted(xs)
    n = len(xs)
    return xs[n // 2] if n else 0.0


def convert(name, dry_run=False):
    video_name, state = CONVERSIONS[name]
    video_path = os.path.join(VIDEO_DIR, video_name + ".mp4")
    print(f"\n=== {name} <- {video_name}.mp4 ({state}) ===")
    if not os.path.exists(video_path):
        print(f"  [失败] 视频不存在: {video_path}")
        return False

    paths = extract_frames(video_path)
    if len(paths) < 10:
        print(f"  [失败] 抽帧过少: {len(paths)}")
        return False
    frames = [Image.open(p).convert("RGB") for p in paths]
    n = len(frames)
    green = green_of(frames[0])
    w0, h0 = frames[0].size
    # 水印固定区：右下角（实测千问水印位于 x≈0.73w 起、y≈0.93h 起，与裙摆分离）
    wm = (int(w0 * 0.72), int(h0 * 0.92), w0 - 1, h0 - 1)
    print(f"  帧数={n} 绿幕底={green} 水印区={wm}")

    keyed = []
    for f in frames:
        k = chroma_key(f, green)
        keyed.append(erase_watermark(k, wm))

    # 质检门 a：工作变体符咒全程在场
    ok = True
    if state == "working":
        golds = [gold_px(k) for k in keyed]
        missing = [i for i, g in enumerate(golds) if g < GOLD_MIN_PX]
        if missing:
            print(f"  [质检a 不过] 符咒缺失帧: {missing[:10]}（共 {len(missing)}）")
            ok = False
        else:
            print(f"  [质检a 通过] 符咒在场 {min(golds)}–{max(golds)}px")

    # 质检门 b：局部突变扫描（绝对上限；超限判闪烁故障）
    diffs = [block_max_diff(keyed[i], keyed[i + 1]) for i in range(n - 1)]
    med = median(diffs)
    top3 = sorted(enumerate(diffs), key=lambda t: -t[1])[:3]
    top3_str = ", ".join(f"f{i}:{d:.0f}" for i, d in top3)
    if max(diffs) > POP_ABS_CAP:
        print(f"  [质检b 不过] 块差超上限: {top3_str}（上限 {POP_ABS_CAP:.0f}, med={med:.1f}）")
        ok = False
    else:
        print(f"  [质检b 通过] top3: {top3_str}（上限 {POP_ABS_CAP:.0f}, med={med:.1f}）")

    # 质检门 c：首尾帧 vs 中性帧（报告制：匹配对 ~24 / 错配对 ~30 分离度不足做硬闸，
    # 最终以目检条为闸）
    ref = load_neutral_ref(state)
    d_first = neutral_diff(keyed[0], ref)
    d_last = neutral_diff(keyed[-1], ref)
    worst = max(d_first, d_last)
    mark = "注意" if worst > NEUTRAL_WARN else "正常"
    print(f"  [质检c {mark}] 首帧vs中性={d_first:.1f} 尾帧vs中性={d_last:.1f}（参考: 匹配~24/错配~30）")

    # 目检条
    os.makedirs(OUT, exist_ok=True)
    tw = 220
    th = int(tw * keyed[0].height / keyed[0].width)
    strip = Image.new("RGB", (tw * 3 + 16, th + 8), (35, 35, 35))
    for k, idx in enumerate([0, n // 2, n - 1]):
        comp = Image.alpha_composite(
            Image.new("RGBA", keyed[idx].size, (35, 35, 35, 255)), keyed[idx]
        )
        strip.paste(comp.resize((tw, th), Image.BILINEAR).convert("RGB"),
                    (k * (tw + 4) + 4, 4))
    strip.save(os.path.join(OUT, f"{name}_check.png"))

    if not ok:
        print("  [结论] 质检未通过，不入库（换后备素材）")
        return False
    if dry_run:
        print("  [dry-run] 质检通过，未落盘")
        return True

    small = [k.resize(TARGET_SIZE, Image.LANCZOS) for k in keyed]
    small[0].save(
        os.path.join(CHAR, name + ".webp"),
        save_all=True,
        append_images=small[1:],
        duration=[FRAME_MS] * n,
        loop=1,  # 播一遍：运行期轮换推进（ADR-0013 D4）
        quality=QUALITY,
        method=METHOD,
    )
    size_mb = os.path.getsize(os.path.join(CHAR, name + ".webp")) / 1024 / 1024
    print(f"  [入库] {name}.webp {n}帧 {size_mb:.2f}MB")
    return True


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    names = [a for a in args if a != "--dry-run"] or list(CONVERSIONS)
    for name in names:
        if name not in CONVERSIONS:
            print(f"未知目标: {name}（可选: {', '.join(CONVERSIONS)}）")
            sys.exit(1)
    results = {}
    for name in names:
        results[name] = convert(name, dry_run=dry)
    print("\n汇总:", ", ".join(f"{k}={'OK' if v else 'FAIL'}" for k, v in results.items()))


if __name__ == "__main__":
    main()
