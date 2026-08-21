# -*- coding: utf-8 -*-
"""循环缺陷资产侧修复（memorial 008 / ADR-0012）。

两种模式：
  pingpong  整段倒放烘焙——裁头部淡入残留帧 + 裁尾部死定格，正放 + 倒放镜像成无缝循环。
            用于 happy/angry/surprised（单向反应动作）。
  splice    局部镜像——把「硬弹出」段替换为「回落段的时间反演 + 峰值 + 回落段」，
            使爆亮对称（渐起→峰→渐落）。用于 working 符咒爆亮。

同时：降采样至 360×640（浮层显示 140×249，2.5× 过采样足够）、高质量重编码、
原文件先备份到仓库根 bak/（不进 git，ADR-0012 D2）。

用法：
  python tools/anim_loop_repair.py            # 修复 REPAIRS 中全部素材
  python tools/anim_loop_repair.py happy      # 只修一个
  python tools/anim_loop_repair.py --dry-run  # 只报告，不落盘

帧裁剪参数来自 memorial 008 取证（.temp/scripts/ 诊断脚本）：
  - 3 表情：帧 0–4 为源 mp4 淡入残留（全局 alpha 86 vs 平台 111–127）；
    tail_end 取「动作沉降平台 + 少量保持帧」，平台之后的死帧裁掉。
  - working：帧 32–34 为符咒两帧硬弹出（面积 193→297→446），35–45 为 ~10 帧软回落。
    镜像后序列：[0..31] + rev([35..45]) + [34,33] + [34..45] + [46..74]。
"""
import os
import shutil
import sys
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAR = os.path.join(REPO, "assets", "character")
BAK = os.path.join(REPO, "bak")
TARGET_SIZE = (360, 640)
QUALITY = 90
METHOD = 4  # 编码努力档：质量/耗时平衡（6 档在数百帧素材上过慢）

REPAIRS = {
    # 3 表情：整段倒放烘焙（head=裁掉的淡入帧数，tail_end=保留的最后一帧下标）
    "happy":     dict(mode="pingpong", frame_ms=33, head=5, tail_end=119),
    "angry":     dict(mode="pingpong", frame_ms=33, head=5, tail_end=99),
    "surprised": dict(mode="pingpong", frame_ms=33, head=5, tail_end=84),
    # working：局部镜像（爆亮段对称化）
    "working":   dict(mode="splice", frame_ms=67,
                      base_end=31, decay_lo=35, decay_hi=45, peak=(34, 33)),
}


def load_frames(path):
    im = Image.open(path)
    frames = []
    for i in range(im.n_frames):
        im.seek(i)
        frames.append(im.convert("RGBA"))
    return frames


def pingpong(frames, head, tail_end):
    fwd = frames[head: tail_end + 1]
    return fwd + fwd[-2:0:-1]  # 正放 + 倒放（端点不重复，回环连续）


def splice(frames, base_end, decay_lo, decay_hi, peak):
    base = frames[: base_end + 1]            # [0..31]
    decay = frames[decay_lo: decay_hi + 1]   # [35..45] 回落段
    rise = decay[::-1]                        # 回落段时间反演 = 渐起段
    hi, lo = peak                             # (34, 33)：肩帧 + 峰值帧
    apex = [frames[hi], frames[lo], frames[hi]]  # 对称尖峰 351→446→351
    tail = frames[decay_hi + 1:]              # [46..]
    # [0..31] + 渐起(180→286) + 尖峰(351,446,351) + 回落(286→180) + [46..]
    return base + rise + apex + decay + tail


def repair(name, dry_run=False):
    cfg = REPAIRS[name]
    path = os.path.join(CHAR, name + ".webp")
    frames = load_frames(path)
    if cfg["mode"] == "pingpong":
        new_frames = pingpong(frames, cfg["head"], cfg["tail_end"])
    else:
        new_frames = splice(frames, cfg["base_end"], cfg["decay_lo"],
                            cfg["decay_hi"], cfg["peak"])
    new_frames = [f.resize(TARGET_SIZE, Image.LANCZOS) for f in new_frames]
    n = len(new_frames)
    total_ms = n * cfg["frame_ms"]
    print(f"[{name}] {cfg['mode']}: {len(frames)}帧 -> {n}帧 ({total_ms}ms, "
          f"{cfg['frame_ms']}ms/帧, {TARGET_SIZE[0]}x{TARGET_SIZE[1]})")
    if dry_run:
        return
    os.makedirs(BAK, exist_ok=True)
    bak_path = os.path.join(BAK, name + ".webp")
    if not os.path.exists(bak_path):
        shutil.copy2(path, bak_path)
        print(f"  原件备份 -> {os.path.relpath(bak_path, REPO)}")
    first = new_frames[0]
    first.save(
        path,
        save_all=True,
        append_images=new_frames[1:],
        duration=[cfg["frame_ms"]] * n,
        loop=0,
        quality=QUALITY,
        method=METHOD,
    )
    size_mb = os.path.getsize(path) / 1024 / 1024
    print(f"  写出 {name}.webp  {size_mb:.2f} MB")


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    names = [a for a in args if a != "--dry-run"] or list(REPAIRS)
    for name in names:
        if name not in REPAIRS:
            print(f"未知素材: {name}（可选: {', '.join(REPAIRS)}）")
            sys.exit(1)
    for name in names:
        repair(name, dry_run=dry)
    print("完成" if not dry else "dry-run 完成（未落盘）")


if __name__ == "__main__":
    main()
