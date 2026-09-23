#!/usr/bin/env python3
"""生成微信小程序 tabBar 图标（81x81 PNG，普通/选中两套）。

产物输出到 miniprogram/assets/tab/。图标为简洁线性风格几何图形，
与 app.wxss 的品牌色 (#4F46E5 选中 / #6B7280 未选中) 一致。
"""
import os
from PIL import Image, ImageDraw

SIZE = 81
STROKE = 7
COLOR_IDLE = (107, 114, 128, 255)   # #6B7280
COLOR_ACTIVE = (79, 70, 229, 255)   # #4F46E5

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "miniprogram", "assets", "tab")


def new_canvas():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def draw_home(d, c):
    # 房子
    d.polygon([(40, 12), (70, 38), (10, 38)], fill=None, outline=c, width=STROKE)
    d.rectangle((20, 38, 60, 68), outline=c, width=STROKE)
    d.rectangle((34, 50, 46, 68), outline=c, width=STROKE)


def draw_contest(d, c):
    # 奖杯
    d.line([(24, 14), (56, 14)], fill=c, width=STROKE)
    d.line([(24, 14), (24, 30)], fill=c, width=STROKE)
    d.line([(56, 14), (56, 30)], fill=c, width=STROKE)
    d.arc((12, 14, 36, 40), 90, 270, fill=c, width=STROKE)
    d.arc((44, 14, 68, 40), 270, 90, fill=c, width=STROKE)
    d.line([(24, 40), (30, 52)], fill=c, width=STROKE)
    d.line([(56, 40), (50, 52)], fill=c, width=STROKE)
    d.line([(28, 52), (52, 52)], fill=c, width=STROKE)
    d.line([(40, 52), (40, 62)], fill=c, width=STROKE)
    d.line((28, 68, 52, 68), fill=c, width=STROKE)


def draw_info(d, c):
    # 圆 + i
    d.ellipse((10, 10, 70, 70), outline=c, width=STROKE)
    d.ellipse((36, 22, 44, 30), fill=c)
    d.line([(40, 36), (40, 56)], fill=c, width=STROKE + 1)


def draw_share(d, c):
    # 书本
    d.rectangle((12, 16, 68, 66), outline=c, width=STROKE)
    d.line([(40, 16), (40, 66)], fill=c, width=STROKE)
    d.line([(22, 30), (32, 30)], fill=c, width=STROKE)
    d.line([(22, 42), (32, 42)], fill=c, width=STROKE)
    d.line([(48, 30), (58, 30)], fill=c, width=STROKE)
    d.line([(48, 42), (58, 42)], fill=c, width=STROKE)


def draw_user(d, c):
    # 人形
    d.ellipse((26, 10, 54, 38), outline=c, width=STROKE)
    d.arc((16, 42, 64, 84), 180, 360, fill=c, width=STROKE)


ICONS = {
    "home": draw_home,
    "contest": draw_contest,
    "info": draw_info,
    "share": draw_share,
    "user": draw_user,
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, fn in ICONS.items():
        for suffix, color in (("", COLOR_IDLE), ("-active", COLOR_ACTIVE)):
            img, d = new_canvas()
            fn(d, color)
            path = os.path.join(OUT_DIR, f"{name}{suffix}.png")
            img.save(path)
            print("saved", path)


if __name__ == "__main__":
    main()
