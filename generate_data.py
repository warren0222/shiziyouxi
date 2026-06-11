#!/usr/bin/env python3
"""
生成汉字数据文件 hanzi_data.json

数据来源:
  - 常用汉字: 《通用规范汉字表》一级字表 (3500字)，存储在 common_3500.txt
  - 拼音: pypinyin 库的内置字典，带声调标注

用法: pip install pypinyin && python generate_data.py
"""

import json
import os
import sys

try:
    from pypinyin import pinyin, Style
except ImportError:
    print("请先安装 pypinyin: pip install pypinyin", file=sys.stderr)
    sys.exit(1)


def load_common_chars():
    """加载《通用规范汉字表》一级字表 (3500字)"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    chars_path = os.path.join(script_dir, "common_3500.txt")

    if not os.path.exists(chars_path):
        print(f"错误: 找不到 {chars_path}", file=sys.stderr)
        print("请确保 common_3500.txt 与本脚本在同一目录下", file=sys.stderr)
        sys.exit(1)

    with open(chars_path, "r", encoding="utf-8") as f:
        chars = list(f.read().strip())

    return chars


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "hanzi_data.json")

    print("加载《通用规范汉字表》一级字表 (3500字)...")
    common_chars = load_common_chars()
    print(f"常用汉字: {len(common_chars)} 个")

    print("生成拼音映射...")
    pinyin_map = {}
    missing = []
    for char in common_chars:
        try:
            py_list = pinyin(char, style=Style.TONE)
            if py_list and py_list[0][0] != char:
                pinyin_map[char] = py_list[0][0]
            else:
                missing.append(char)
        except Exception:
            missing.append(char)

    # 只保留有拼音的汉字
    valid_chars = [c for c in common_chars if c in pinyin_map]

    print(f"\n统计:")
    print(f"  一级字表: {len(common_chars)}")
    print(f"  有拼音:   {len(valid_chars)}")
    print(f"  缺拼音:   {len(missing)}")
    if missing:
        print(f"  缺拼音示例: {missing[:10]}")

    data = {
        "chars": valid_chars,
        "pinyin": pinyin_map,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    size_kb = os.path.getsize(output_path) / 1024
    print(f"\n已写入: {output_path}")
    print(f"文件大小: {size_kb:.0f} KB")
    print(f"\n示例 (前10个):")
    for c in valid_chars[:10]:
        print(f"  {c} -> {pinyin_map[c]}")
    print(f"\n最后几个:")
    for c in valid_chars[-5:]:
        print(f"  {c} -> {pinyin_map[c]}")


if __name__ == "__main__":
    main()
