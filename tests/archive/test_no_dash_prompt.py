#!/usr/bin/env python3
"""
测试反AI味破折号禁令是否生效
"""
import sys
import asyncio
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))

from src.core.openai_client import OpenAILLMClient


async def test_dash_prohibition():
    """测试破折号禁令"""
    print("="*60)
    print("测试：反AI味破折号禁令")
    print("="*60)

    load_dotenv()
    import os
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL")
    model = os.getenv("AUTHOR_MODEL", "kimi-k2.5")

    llm_client = OpenAILLMClient(
        model_name=model,
        api_key=api_key,
        base_url=base_url
    )

    # 测试prompt：包含破折号禁令
    system_prompt = """你是专业网文作者。

## 🚫 【严禁破折号后缀句式】(反AI味铁律)
**绝对禁止使用破折号（——）来进行背景解说、物品说明或人物身份揭晓！**

- 🚫 错误写法：门牙缺了一颗——是赵虎，他入门时的室友。
- ✅ 正确写法：门牙缺了一颗。赵虎，他入门时的室友。

**强制要求**：遇到需要补充设定的地方，必须用逗号或句号断句，或者另起一句来写。禁止使用破折号进行解释说明！

## 你的任务
撰写一个200字的仙侠小说场景片段，描写主角林辰看到一把剑。
要求：禁止使用破折号进行物品说明。
"""

    user_prompt = "场景：林辰走进密室，看到案上放着一把剑。"

    print(f"\n使用模型: {model}")
    print(f"\n开始生成...")

    try:
        response = await llm_client.generate_text(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.8,
            max_tokens=500
        )

        print("\n" + "="*60)
        print("生成结果:")
        print("="*60)
        print(response)

        # 检查是否使用了破折号
        dash_count = response.count("——")
        print(f"\n检测结果:")
        print(f"  破折号出现次数: {dash_count}")

        if dash_count > 0:
            print(f"\n[FAIL] 反AI味禁令未生效！检测到 {dash_count} 个破折号")
            # 显示破折号所在行
            lines = response.split('\n')
            for i, line in enumerate(lines, 1):
                if "——" in line:
                    print(f"  第{i}行: {line.strip()}")
            return False
        else:
            print(f"\n[OK] 反AI味禁令生效！没有使用破折号")
            return True

    except Exception as e:
        print(f"\n错误: {e}")
        return False


if __name__ == "__main__":
    success = asyncio.run(test_dash_prohibition())
    sys.exit(0 if success else 1)
