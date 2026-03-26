#!/usr/bin/env python3
"""
测试 Few-Shot Examples 是否被正确加载
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.utils.example_library import ExampleLibrary

# 测试 ExampleLibrary
print("="*60)
print("测试 ExampleLibrary")
print("="*60)

library = ExampleLibrary()

# 列出所有分类
categories = library.list_categories()
print(f"\n可用的范文分类 ({len(categories)} 个):")
for cat in categories:
    print(f"  - {cat}")

# 获取统计信息
stats = library.get_stats()
print(f"\n文库统计:")
print(f"  总范文数: {stats['total_examples']}")
for cat, count in stats['categories'].items():
    print(f"  - {cat}: {count} 篇")

# 测试获取 dark_revenge 分类的范文
print("\n" + "="*60)
print("测试获取 dark_revenge 范文")
print("="*60)

samples = library.get_by_category(
    category="dark_revenge",
    random_choice=False,
    max_count=1
)

if samples:
    print("\n[OK] 成功获取范文:")
    print(samples[:500] + "..." if len(samples) > 500 else samples)
else:
    print("\n[FAIL] 未能获取范文")

# 测试分类映射
print("\n" + "="*60)
print("测试分类映射")
print("="*60)

book_meta = {
    "genre": "玄幻",
    "sub_genres": ["玄幻", "重生", "复仇"]
}

category_mapping = {
    "dark_revenge": "dark_revenge",
    "revenge": "dark_revenge",
    "玄幻": "fantasy_power",
    "fantasy": "fantasy_power",
    "重生": "dark_revenge"
}

matched_category = None
for genre in book_meta["sub_genres"]:
    genre_lower = genre.lower().replace(" ", "_").replace("-", "_")
    if genre_lower in category_mapping:
        matched_category = category_mapping[genre_lower]
        print(f"\n匹配成功: '{genre}' -> '{matched_category}'")
        break

if matched_category:
    samples = library.get_by_category(
        category=matched_category,
        random_choice=True,
        max_count=2
    )
    if samples:
        print(f"\n[OK] 成功获取 '{matched_category}' 范文 (前 300 字):")
        print(samples[:300] + "...")
    else:
        print(f"\n[FAIL] 未能获取 '{matched_category}' 范文")
else:
    print("\n[FAIL] 未能匹配分类")

print("\n" + "="*60)
print("测试完成")
print("="*60)
