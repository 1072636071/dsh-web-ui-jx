# -*- coding: utf-8 -*-
"""变体视频转码（memorial 008 / ADR-0013 D6/D8/D10）。

绿幕视频 → 一次性动画 webp 变体素材：
  1. 解码抽帧并重定时到 67ms/帧（对齐经典态节奏）；
  2. 色度键去绿幕（软边 alpha 坡道 + 半透明区去溢色）+ 全片统一自动白平衡；
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
VIDEO_DIR = r"C:\Users\jxc123\Downloads"

FRAME_MS = 67
TARGET_SIZE = (360, 640)
QUALITY = 90
METHOD = 4

# 输出素材名 -> (源视频名, 所属状态)
# 2026-08-23 全量重制：旧变体源视频已不可得，且成品存在「衣物发红/发紫」缺陷
# （根因：绿灰阴影被误判半透明后经 un-premultiply 推成品红，ADR-0020），整批弃用重转。
CONVERSIONS = {
    "idle-v2": ("左右张望", "idle"),
    "idle-v3": ("耸肩", "idle"),
    "idle-v4": ("整理衣服", "idle"),
    "working-v2": ("画圆", "working"),
    "working-v3": ("画一横", "working"),
    "working-v4": ("画横来回", "working"),
    "working-v5": ("画上半圆弧", "working"),
}

# 质检阈值（2026-08-22 实测校准）
GOLD_MIN_PX = 40          # 工作变体每帧最少金色像素（缩到 96 宽后）
POP_ABS_CAP = 165.0       # 局部突变绝对上限：去溢色升级后合法弧扫帧实测 ≤158（同批运动帧），超过判闪烁故障
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
    """色度键：绿色距离坡道转 alpha + 边缘去污染 + 全局绿溢色压制。

    - 坡道：距绿幕底色 ≤42 全透明，≥105 全不透明，中间线性（软边）。
      2026-08-23 起（ADR-0020）距离改用「先去溢色」后的颜色计算：源视频衣物
      阴影普遍带绿色环境光反射，直接用原始色距会把「绿灰阴影」误判为半透明，
      随后 un-premultiply 减绿底、除以小 α，G 塌陷 → 衣物整片品红/紫红
      （2026-08-22 批「衣服很红」根因，半透明段紫簇占比 82–86% vs 不透明段
      33%）。去溢色把绿色主导维度折叠掉之后：纯绿幕贴近去溢色底色（α→0），
      绿灰衣料回到中性灰（α→1），金饰由 spill 条件保护不受影响。
    - 边缘去污染（预乘还原）保留：真实混合边缘的 α 现在偏高、修正温和；
      绿残留由 despill 压回。
    - 全局绿溢色：低饱和像素（白发/浅色织物）中绿色显著占优时压回
      红蓝均值；阈值 + 饱和度条件保护金饰等高饱和固有色。
    """
    arr = np.asarray(img.convert("RGB"), dtype=np.float32)
    gr, gg, gb = green

    # 先按 despill 条件算一份「去溢色参考色」，专用于 alpha 距离：
    #   spill 掩码复用下方同款条件（g 高出红蓝均值 +4，且低饱和或近底色），
    #   金饰等高饱和暖色（sat≥50 且 dist_raw≥190）不参与，保持原始 g。
    r0, g0, b0 = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mean_rb0 = (r0 + b0) / 2
    sat0 = arr.max(axis=2) - arr.min(axis=2)
    dist_raw = np.sqrt((r0 - gr) ** 2 + (g0 - gg) ** 2 + (b0 - gb) ** 2)
    near_bg0 = dist_raw < 190
    spill0 = (g0 > mean_rb0 + 4) & ((sat0 < 50) | near_bg0)
    g_ref = np.where(spill0, np.minimum(g0, mean_rb0 + 4), g0)

    # 距离对「同样去过溢色的底色」计算（同类比较）：纯绿幕经同一变换后
    # 贴近 (gr, mean_rb(bg)+4, gb)，距离归零 → α→0；绿灰衣料回到中性灰、
    # 远离该参考点 → α→1。
    bg_ref_g = min(gg, (gr + gb) / 2 + 4)
    dist = np.sqrt(
        (r0 - gr) ** 2
        + (g_ref - bg_ref_g) ** 2
        + (b0 - gb) ** 2
    )
    alpha = np.clip((dist - 42) / (105 - 42), 0, 1)

    # 边缘去污染（预乘还原）
    bg = np.array([gr, gg, gb], dtype=np.float32)
    a_safe = np.maximum(alpha, 0.05)
    rgb = (arr - (1 - alpha)[:, :, None] * bg) / a_safe[:, :, None]
    rgb = np.clip(rgb, 0, 255)

    # 全局绿溢色压制：绿色高出红蓝均值时压回——
    #   a. 低饱和像素（sat<50，白发/浅色织物的绿染）；
    #   b. 靠近绿幕底色的像素（dist<190，发丝边缘的高饱和绿混合；
    #      金饰等固有色距绿幕底色 >200，不受影响）。
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    mean_rb = (r + b) / 2
    near_bg = dist < 190
    spill = (g > mean_rb + 4) & ((sat < 50) | near_bg)
    rgb[:, :, 1] = np.where(spill, mean_rb, g)

    # 光雾衰减：金色物件（符咒）的光晕落在绿幕上形成大片半透明暖色像素
    # （爆亮段最坏帧可达 2 万 px、占不透明区 18%），预乘还原会进一步放大其
    # 饱和度——中灰目检条上像自然辉光，浅色页面上一律呈橙红雾（2026-08-22
    # 「还是偏红」主因之二）。按「到实心区（alpha>0.9）的距离」指数衰减：
    # 金核/人物边缘一圈保留自然辉光，远处雾霭压到近透明；只作用于半透明
    # （alpha<0.85）且显著偏暖（R-B>20）的像素，冷色调发丝软边不受影响。
    solid = alpha > 0.9
    keep = np.ones_like(alpha)
    cur = solid.copy()
    factors = (0.85, 0.70, 0.58, 0.47, 0.38, 0.30, 0.24, 0.19)
    for f in factors:
        grown = cur.copy()
        grown[1:, :] |= cur[:-1, :]
        grown[:-1, :] |= cur[1:, :]
        grown[:, 1:] |= cur[:, :-1]
        grown[:, :-1] |= cur[:, 1:]
        grown[1:, 1:] |= cur[:-1, :-1]
        grown[1:, :-1] |= cur[:-1, 1:]
        grown[:-1, 1:] |= cur[1:, :-1]
        grown[:-1, :-1] |= cur[1:, 1:]
        ring = grown & ~cur
        keep[ring] = f
        cur = grown
    keep[~cur] = 0.12

    warm_semi = (
        (alpha > 0.05) & (alpha < 0.85)
        & ((rgb[:, :, 0] - rgb[:, :, 2]) > 20)
    )
    if bool(warm_semi.any()):
        fade = 0.25 + 0.75 * np.clip((alpha - 0.05) / 0.80, 0, 1)
        alpha = np.where(warm_semi, alpha * fade * keep, alpha)
        lum = rgb.mean(axis=2)
        soft = lum[:, :, None] + (rgb - lum[:, :, None]) * 0.60
        rgb = np.where(warm_semi[:, :, None], soft, rgb)

    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def _frame_anchor_scales(rgb, alpha):
    """单帧锚定缩放候选：保守参考白点（不透明、亮、低饱和）拉向中性。

    参考集=发丝/浅色织物高光（天然近中性）；爆亮帧参考点被金色场景光占据、
    低饱和像素不足时候选失效，由上层中位数天然忽略该帧。"""
    lum = rgb.mean(axis=2)
    m = (alpha > 0.9) & (lum > 180) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 28)
    if int(m.sum()) < 100:
        return None
    ref = [float(rgb[:, :, i][m].mean()) for i in range(3)]
    target = sum(ref) / 3
    s = np.array([target / max(v, 1) for v in ref], dtype=np.float32)
    return s if all(0.85 < x < 1.18 for x in s) else None


def _frame_trim_ratios(rgb, alpha):
    """单帧微调比例候选：宽口径高亮白像素（不限饱和度）均值对中性之比。

    口径与白偏红验收指标一致（alpha>0.94 且亮度>170），直接消掉去溢色压绿等
    造成的基线残余；爆亮段金色光下的高饱和像素也被计入该帧候选，但只占少数帧，
    由上层中位数过滤——场景光相对变化保留。"""
    lum = rgb.mean(axis=2)
    m = (alpha > 0.94) & (lum > 170)
    if int(m.sum()) < 500:
        return None
    ref = [float(rgb[:, :, i][m].mean()) for i in range(3)]
    target = sum(ref) / 3
    return np.array([target / max(v, 1) for v in ref], dtype=np.float32)


def video_white_scales(keyed):
    """全片统一白平衡缩放 = 锚定 × 微调，两级各取逐帧候选的分量中位数。

    逐帧独立白平衡会造成帧间色温波动（爆亮段尤其明显），故两级都只在全片
    尺度求一组常数：
    1. 锚定：校正源视频整体暖偏（working 批次白像素 G-R≈-9）；
    2. 微调：收紧基线残余（阀 0.97–1.03，异常即放弃）。
    锚定级有效帧不足 1/4 或最终缩放越阀（0.85–1.20）→ 返回 None 跳过白平衡。
    """
    pairs = []
    for im in keyed:
        arr = np.asarray(im.convert("RGB"), dtype=np.float32)
        a = np.asarray(im, dtype=np.float32)[:, :, 3] / 255.0
        pairs.append((arr, a))
    n = len(pairs)
    min_ok = max(3, n // 4)

    cands = []
    for rgb, a in pairs:
        s = _frame_anchor_scales(rgb, a)
        if s is not None:
            cands.append(s)
    if len(cands) < min_ok:
        return None
    total = np.array([median([float(s[i]) for s in cands]) for i in range(3)],
                     dtype=np.float32)

    trims = [r for r in (_frame_trim_ratios(rgb * total[None, None, :], a)
                         for rgb, a in pairs) if r is not None]
    if len(trims) >= min_ok:
        trim = np.array([median([float(s[i]) for s in trims]) for i in range(3)],
                        dtype=np.float32)
        if all(0.97 < x < 1.03 for x in trim):
            total = total * trim

    return total if all(0.85 < x < 1.20 for x in total) else None


def apply_white_balance(img, scales):
    """对 RGBA Image 的 RGB 通道应用缩放。"""
    arr = np.asarray(img, dtype=np.float32).copy()
    arr[:, :, :3] = np.clip(arr[:, :, :3] * scales[None, None, :], 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


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

    keyed = [chroma_key(f, green) for f in frames]

    # 全片统一自动白平衡：源视频常有整体暖偏（working 批次白像素 G-R≈-9），
    # 以各帧「亮度前5%分位且低饱和」参考白点的通道缩放中位数一次应用到全部帧，
    # 消除逐帧独立白平衡的帧间色温波动；符咒爆亮等场景光相对变化保留。
    scales = video_white_scales(keyed)
    if scales is not None:
        print(f"  [白平衡] 统一 scales=[{scales[0]:.3f}, {scales[1]:.3f}, "
              f"{scales[2]:.3f}]（{os.path.basename(video_path)}）")
        keyed = [apply_white_balance(k, scales) for k in keyed]
    else:
        print("  [白平衡] 参考白点不足，跳过")

    keyed = [erase_watermark(k, wm) for k in keyed]

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
