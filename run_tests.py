"""
AutoNovel-Studio 测试运行器
便捷运行所有测试或单个测试
"""
import sys
import os
import subprocess
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent))


def print_header(text):
    """打印标题"""
    print("\n" + "=" * 60)
    print(text)
    print("=" * 60)


def run_test(test_name, test_file):
    """运行单个测试"""
    print_header(f"Running: {test_name}")
    result = subprocess.run(
        [sys.executable, test_file],
        capture_output=False,
        text=True
    )
    return result.returncode == 0


def main():
    """主函数"""
    print_header("AutoNovel-Studio Test Suite")

    tests = [
        ("API Connection Test", "tests/test_api.py"),
        ("Author Agent Test", "tests/test_author.py"),
        ("Reader Matrix Test (4 Readers)", "tests/test_readers.py"),
        ("AI Tone Scanner Test", "tests/test_ai_tone.py"),
        ("Editor Agent Test", "tests/test_editor.py"),
        ("Full System Test", "tests/test_system.py"),
    ]

    if len(sys.argv) > 1:
        # 运行指定的测试
        test_name = sys.argv[1]
        test_map = {
            "api": ("API Connection Test", "tests/test_api.py"),
            "author": ("Author Agent Test", "tests/test_author.py"),
            "readers": ("Reader Matrix Test", "tests/test_readers.py"),
            "ai_tone": ("AI Tone Scanner Test", "tests/test_ai_tone.py"),
            "editor": ("Editor Agent Test", "tests/test_editor.py"),
            "system": ("Full System Test", "tests/test_system.py"),
            "all": ("ALL TESTS", None),
        }

        if test_name == "all":
            # 运行所有测试
            results = []
            for name, file in tests:
                success = run_test(name, file)
                results.append((name, success))

            # 总结
            print_header("Test Results Summary")
            passed = sum(1 for _, success in results if success)
            total = len(results)

            for name, success in results:
                status = "✅ PASS" if success else "❌ FAIL"
                print(f"{status}: {name}")

            print(f"\nTotal: {passed}/{total} tests passed")
            sys.exit(0 if passed == total else 1)

        elif test_name in test_map:
            name, file = test_map[test_name]
            if file:
                success = run_test(name, file)
                sys.exit(0 if success else 1)
        else:
            print(f"Unknown test: {test_name}")
            print(f"Available tests: {', '.join(test_map.keys())}")
            sys.exit(1)
    else:
        # 显示菜单
        print("\nAvailable tests:")
        print("  api       - API连接测试")
        print("  author    - 作者代理测试")
        print("  readers   - 读者矩阵测试（4个读者）")
        print("  ai_tone   - AI味扫雷测试")
        print("  editor    - 编辑代理测试")
        print("  system    - 完整系统测试")
        print("  all       - 运行所有测试")
        print("\nUsage:")
        print("  python run_tests.py <test_name>")
        print("\nExamples:")
        print("  python run_tests.py author    # 运行作者测试")
        print("  python run_tests.py all       # 运行所有测试")
        print("\nOr run tests directly:")
        print("  python tests/test_author.py")


if __name__ == "__main__":
    main()
