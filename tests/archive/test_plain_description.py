#!/usr/bin/env python3
"""
测试白描铁律是否生效
对比：AI矫情写法 vs 人类白描写法
"""
import sys
import asyncio
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))

from src.core.openai_client import OpenAILLMClient


async def test_plain_description():
    """测试白描铁律"""
    print("="*60)
    print("测试：白描铁律（反矫情禁令）")
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

    # 测试prompt：包含白描铁律
    system_prompt = """你是专业网文作者。

## ⚪ 【白描铁律：禁止过度比喻】(反矫情禁令)
当需要通过动作和环境来暗示紧张感时，必须遵守以下铁律：

1. 禁止过度修饰目光：禁止使用复杂的比喻（如"像利剑、像蛛丝、仿佛要看透灵魂"）。直接写"他看着他"或"对上他的目光"即可。

2. 禁止赋予死物情感（反拟人化）：杯子就是杯子，水珠就是水珠。绝对禁止将环境物体比作人体的生理反应（如"水珠像冷汗"、"风像在叹息"）。

3. 严格遵守物理常识：动作的停顿只能发生在人身上（如"倒茶的手顿住了"），绝对不能发生违背物理常识的描写（如"水流在空中断开"）。

4. 一章只允许一次特写：不要在每一句话里都塞满微动作。大量使用陈述句，用极简的白描推进剧情。

### ❌ 错误示范（AI矫情写法）：
- "那目光像蛛丝，轻柔地缠上来，却在寻找血脉跳动的位置。"
- "壶嘴的水柱在空中断了一瞬，才落入杯中。"
- "杯沿有一滴水珠正在往下滑，像一滴被凝固的汗。"

### ✅ 正确示范（人类白描）：
- "他抬起眼，迎上叶流云的目光。"
- "叶流云提壶给他添茶。水声在静谧的密室里分外清晰。倒到七分满时，水声停了。"
- "叶流云放下茶壶，瓷底磕在木桌上，发出一声闷响。"

核心原则：用最干净的动词和名词，让事实本身说话。

## 你的任务
撰写一个200字的仙侠小说场景片段，描写林辰和叶流云对峙试探。
要求：严格遵守白描铁律，禁止使用过度比喻和违背物理常识的描写。
"""

    user_prompt = "场景：林辰走进丹房，看到叶流云正在炼丹。两人心知肚明对方来意不明。"

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

        # 检查AI味问题
        issues = []

        # 检查过度比喻
        if "像" in response and "蛛丝" in response or "利剑" in response or "毒蛇" in response:
            issues.append("检测到过度修饰目光（'像蛛丝/利剑/毒蛇'）")

        if "像" in response and "汗" in response:
            issues.append("检测到赋予死物情感（'像汗'）")

        if "断" in response and "水流" in response or "水柱" in response:
            issues.append("检测到违背物理常识（'水流断开'）")

        if "凝固" in response and "时间" in response:
            issues.append("检测到违背物理常识（'时间凝固'）")

        # 检查破折号
        dash_count = response.count("——")

        print("\n" + "="*60)
        print("检测结果:")
        print("="*60)
        print(f"破折号数量: {dash_count}")

        if issues:
            print(f"\n[FAIL] 检测到AI味问题:")
            for issue in issues:
                print(f"  - {issue}")
            return False
        elif dash_count > 0:
            print(f"\n[PARTIAL] 破折号未完全避免（{dash_count}个），但没有检测到矫情比喻")
            return True
        else:
            print(f"\n[OK] 完美！没有破折号，没有矫情比喻！")
            return True

    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_plain_description())
    sys.exit(0 if success else 1)
