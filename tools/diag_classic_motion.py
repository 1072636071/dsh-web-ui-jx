# -*- coding: utf-8 -*-
"""经典态运动轨迹诊断：d(f_i, f_0) 时序。

如果动作是真正的循环（返回起点），d(f_i, f_0) 会在末尾回落到接近 0；
如果是单向动作（动作方向单调），d(f_i, f_0) 会单调上升或停留高位，
此时用户体感「突兀」即来自重启，需要正反倒放。

同时输出最大相邻差与中位数，供判断动作是否平稳。
"""
import os
import numpy as np
from PIL import Image

CHAR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "assets", "character")
WIDTH = 96


def load_frames(path):
    im = Image.open(path)
    out = []
    for i in range(im.n_frames):
        im.seek(i)
        w, h = im.size
        out.append(np.asarray(im.convert("RGBA")
                              .resize((WIDTH, int(WIDTH * h / w)), Image.BILINEAR),
                              dtype=np.float32))
    return out


def mean_diff(a, b):
    return float(np.abs(a - b).mean())


def analyze(name):
    frames = load_frames(os.path.join(CHAR, name + ".webp"))
    n = len(frames)
    f0 = frames[0]
    d_f0 = [mean_diff(f, f0) for f in frames]
    d_adj = [mean_diff(frames[i], frames[i + 1]) for i in range(n - 1)]
    d_adj = d_adj + [mean_diff(frames[-1], frames[0])]  # 含回环跳
    med = float(np.median(d_adj))
    mx = float(np.max(d_adj))
    # 末尾 5 帧对 f0 的均值 vs 中段峰值
    tail = float(np.mean(d_f0[-5:]))
    peak = float(np.max(d_f0))
    # 判定
    if tail < peak * 0.35 and tail < 4.0:
        verdict = "循环型（末尾回归起点）"
    elif tail > peak * 0.65:
        verdict = "单向型（末尾停在远离起点处）→ 需正反倒放"
    else:
        verdict = "中间型（末尾部分回归）"
    return {
        "name": name,
        "frames": n,
        "med_adj": med,
        "max_adj": mx,
        "peak_vs_f0": peak,
        "tail_vs_f0": tail,
        "verdict": verdict,
        "profile": [round(d_f0[i], 1) for i in range(0, n, max(1, n // 10))],
    }


def main():
    states = ["idle", "thinking", "reading", "replying", "error",
              "welcome", "done", "permission", "listening", "working"]
    print(f"{'state':<11} {'n':>3} med {'max':>5} peak {'tail':>5} verdict")
    print("-" * 80)
    results = []
    for st in states:
        r = analyze(st)
        results.append(r)
        print(f"{r['name']:<11} {r['frames']:>3} {r['med_adj']:5.2f} {r['max_adj']:5.2f} "
              f"{r['peak_vs_f0']:5.1f} {r['tail_vs_f0']:5.1f} {r['verdict']}")
        print(f"           profile(d_vs_f0 sampled): {r['profile']}")


if __name__ == "__main__":
    main()
