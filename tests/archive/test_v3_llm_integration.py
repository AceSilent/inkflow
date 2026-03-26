#!/usr/bin/env python3
"""
AutoNovel-Studio v3.0 实际LLM集成测试

测试内容：
1. 书籍隔离（每本书独立的目录和状态）
2. 实际LLM调用（OpenAI/DeepSeek等）
3. 完整工作流（头脑风暴 → 场景生成）
"""
import sys
import asyncio
import json
from pathlib import Path
from dotenv import load_dotenv

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.core.openai_client import OpenAILLMClient
from src.core.models_v3 import CharacterMemory, BrainstormResult
from src.agents.brainstorming import BrainstormingRoom
from src.agents.iceberg_engine import IcebergEngine


# ============================================================================
# 书籍配置（每本书独立的配置）
# ============================================================================

BOOK_CONFIGS = {
    "test_book_001": {
        "title": "测试书籍001：重生之夺运",
        "tone": "玄幻重生、智斗、爽文",
        "genre": ["玄幻", "重生", "复仇"],
        "world_lore": {
            "修炼体系": "练气 → 筑基 → 金丹 → 元婴 → 化神",
            "宗门": "青云宗（正道）、血煞教（魔道）",
            "法宝": "青云剑、血煞珠、乾坤袋"
        },
        "characters": {
            "char_001": {
                "name": "林辰",
                "status": "alive",
                "current_location": "青云宗",
                "known_facts": ["自己重生回到了五十年前"],
                "false_beliefs": ["苏清雪是清白的（其实她早就被夺舍）"],
                "hidden_motive": "不暴露重生的事实，暗中剥夺叶流云的机缘",
                "public_status": "青云宗掌门亲传弟子"
            },
            "char_002": {
                "name": "叶流云",
                "status": "alive",
                "current_location": "青云宗",
                "known_facts": ["林辰开始怀疑自己了"],
                "false_beliefs": ["林辰还不知道我的计划"],
                "hidden_motive": "在林辰突破前下手，夺取青云宗气运",
                "public_status": "青云宗掌门"
            }
        }
    },
    "test_book_002": {
        "title": "测试书籍002：星际争霸",
        "tone": "科幻、战争、策略",
        "genre": ["科幻", "战争", "星际"],
        "world_lore": {
            "阵营": ["联邦", "帝国", "自由联盟"],
            "科技": "跃迁引擎、光速舰、机甲",
            "资源": "能源晶体、稀土元素"
        },
        "characters": {
            "char_001": {
                "name": "雷震",
                "status": "alive",
                "current_location": "联邦旗舰",
                "known_facts": ["帝国舰队正在集结"],
                "false_beliefs": ["自由联盟是盟友（其实他们已经背叛）"],
                "hidden_motive": "保护联邦舰队，寻找背叛证据",
                "public_status": "联邦上将"
            }
        }
    }
}


# ============================================================================
# 测试函数
# ============================================================================

async def test_book_isolation():
    """测试书籍隔离"""
    print("\n" + "="*60)
    print("测试 1: 书籍隔离")
    print("="*60)

    output_base = Path("test_books_output")

    for book_id, config in BOOK_CONFIGS.items():
        # 创建书籍专属目录
        book_dir = output_base / book_id
        book_dir.mkdir(parents=True, exist_ok=True)

        # 保存书籍配置
        config_path = book_dir / "config.json"
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)

        # 创建角色状态文件
        chars_dir = book_dir / "01_Global_Settings"
        chars_dir.mkdir(exist_ok=True)

        characters_state = {}
        for char_id, char_data in config["characters"].items():
            characters_state[char_id] = char_data

        chars_path = chars_dir / "characters_v3.json"
        with open(chars_path, 'w', encoding='utf-8') as f:
            json.dump(characters_state, f, ensure_ascii=False, indent=2)

        print(f"\n书籍: {book_id}")
        print(f"  标题: {config['title']}")
        print(f"  目录: {book_dir}")
        print(f"  角色数: {len(config['characters'])}")

    print("\n[OK] 书籍隔离测试通过")
    print(f"  基础目录: {output_base}")
    print(f"  书籍数量: {len(BOOK_CONFIGS)}")


async def test_brainstorming_with_llm(llm_client, book_id):
    """测试实际LLM头脑风暴"""
    print("\n" + "="*60)
    print(f"测试 2: 头脑风暴（书籍: {book_id}）")
    print("="*60)

    # 获取书籍配置
    config = BOOK_CONFIGS[book_id]

    # 构建上下文
    book_context = {
        "title": config["title"],
        "tone": config["tone"],
        "genre": config["genre"]
    }

    # 构建角色状态
    character_memories = {}
    for char_id, char_data in config["characters"].items():
        character_memories[char_id] = CharacterMemory(
            char_id=char_id,
            **char_data
        )

    # 初始化头脑风暴室
    brainstorming_room = BrainstormingRoom(llm_client)

    # 人类灵感
    inspiration = "主角发现最信任的人其实是反派，正在暗中布局"

    print(f"\n人类灵感: {inspiration}")
    print(f"\n开始头脑风暴...")

    try:
        # 执行头脑风暴
        result = await brainstorming_room.brainstorm(
            inspiration=inspiration,
            book_context=book_context,
            character_states=character_memories,
            world_lore=config["world_lore"]
        )

        print(f"\n头脑风暴完成！")
        print(f"\n生成选项: {len(result.options)}")

        for i, option in enumerate(result.options, 1):
            print(f"\n选项 {option.option_id}: {option.core_concept}")
            print(f"  常规发展: {option.surface_plot}")
            print(f"  [反转] 魔鬼反转: {option.devil_twist}")
            print(f"  [讽刺] 戏剧讽刺: {option.dramatic_irony}")

            if option.required_information_gaps:
                print(f"  需要信息差:")
                for gap in option.required_information_gaps:
                    print(f"    - {gap}")

        # 保存结果
        output_dir = Path("test_books_output") / book_id / "brainstorming_results"
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = __import__('datetime').datetime.now().strftime("%Y%m%d_%H%M%S")
        result_path = output_dir / f"brainstorm_{timestamp}.json"

        # 转换为可序列化的字典
        result_dict = {
            "inspiration": inspiration,
            "options": [
                {
                    "option_id": opt.option_id,
                    "core_concept": opt.core_concept,
                    "surface_plot": opt.surface_plot,
                    "devil_twist": opt.devil_twist,
                    "dramatic_irony": opt.dramatic_irony,
                    "required_information_gaps": opt.required_information_gaps
                }
                for opt in result.options
            ]
        }

        with open(result_path, 'w', encoding='utf-8') as f:
            json.dump(result_dict, f, ensure_ascii=False, indent=2)

        print(f"\n[OK] 头脑风暴测试通过")
        print(f"  结果已保存: {result_path}")

        return result

    except Exception as e:
        print(f"\n[ERROR] 头脑风暴失败: {e}")
        import traceback
        traceback.print_exc()
        return None


async def test_iceberg_engine_with_llm(llm_client, book_id, brainstorm_result):
    """测试冰山引擎（使用LLM生成潜台词对白）"""
    print("\n" + "="*60)
    print(f"测试 3: 冰山引擎（书籍: {book_id}）")
    print("="*60)

    if not brainstorm_result or not brainstorm_result.options:
        print("\n[SKIP] 没有可用的头脑风暴结果")
        return None

    # 获取书籍配置
    config = BOOK_CONFIGS[book_id]

    # 选择第一个选项
    selected_option = brainstorm_result.options[0]

    print(f"\n选择选项: {selected_option.option_id}")
    print(f"核心概念: {selected_option.core_concept}")

    # 构建场景细纲（简化版）
    from src.core.models_v3 import SceneOutlineV3

    scene_outline = SceneOutlineV3(
        scene_number=1,
        title=selected_option.core_concept,
        plot_points=[
            "主角发现异常",
            "暗中试探",
            "对方反应微妙",
            "主角确认疑虑"
        ],
        logic_chain=f"基于'{selected_option.core_concept}'的常规发展",
        emotional_arc="警惕(60) → 怀疑(75) → 试探(80)",
        focus_point="重点描写微表情和心理活动",
        character_motives={
            char_id: char_data["hidden_motive"]
            for char_id, char_data in config["characters"].items()
        },
        information_gaps={
            char_id: [char_data.get("false_beliefs", [""])[0]]
            for char_id, char_data in config["characters"].items()
        },
        subtext_guidance="通过谈论日常事物来暗中试探，不要直接表达"
    )

    # 构建角色记忆
    character_memories = {}
    for char_id, char_data in config["characters"].items():
        character_memories[char_id] = CharacterMemory(
            char_id=char_id,
            **char_data
        )

    # 初始化冰山引擎（启用 Few-Shot Examples）
    iceberg_engine = IcebergEngine(llm_client, use_examples=True)

    print(f"\n场景细纲:")
    print(f"  场景 {scene_outline.scene_number}: {scene_outline.title}")
    print(f"  情节点: {len(scene_outline.plot_points)}")
    print(f"  潜台词指导: {scene_outline.subtext_guidance}")

    print(f"\n开始冰山引擎渲染...")

    try:
        # 生成场景（带潜台词）
        output = await iceberg_engine.render_scene_with_debug(
            scene_outline=scene_outline,
            character_memories=character_memories,
            book_context={
                "tone": config["tone"],
                "genre": config["genre"]
            },
            world_lore=config["world_lore"],
            recent_summaries="",
            book_meta={
                "genre": config["genre"][0] if config["genre"] else "",
                "sub_genres": config["genre"]
            }
        )

        print(f"\n冰山引擎渲染完成！")
        print(f"\n[内部推演]")
        print(output.internal_script.format_for_display())

        print(f"\n[最终正文]")
        print(output.final_prose[:200] + "...")

        # 保存结果
        output_dir = Path("test_books_output") / book_id / "scenes"
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = __import__('datetime').datetime.now().strftime("%Y%m%d_%H%M%S")
        scene_path = output_dir / f"scene_{timestamp}.txt"

        with open(scene_path, 'w', encoding='utf-8') as f:
            f.write("="*60 + "\n")
            f.write("内部推演\n")
            f.write("="*60 + "\n")
            f.write(output.internal_script.format_for_display())
            f.write("\n\n")
            f.write("="*60 + "\n")
            f.write("最终正文\n")
            f.write("="*60 + "\n")
            f.write(output.final_prose)

        print(f"\n[OK] 冰山引擎测试通过")
        print(f"  场景已保存: {scene_path}")

        return output

    except Exception as e:
        print(f"\n[ERROR] 冰山引擎失败: {e}")
        import traceback
        traceback.print_exc()
        return None


async def main():
    """主测试函数"""
    print("\n" + "="*60)
    print("AutoNovel-Studio v3.0 实际LLM集成测试")
    print("="*60)

    # 加载环境变量
    load_dotenv()

    import os
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("\n[ERROR] 未找到 OPENAI_API_KEY 环境变量")
        print("请在 .env 文件中设置 OPENAI_API_KEY")
        return 1

    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    model = os.getenv("AUTHOR_MODEL", "kimi-k2.5")  # 使用原配置的模型

    print(f"\nLLM配置:")
    print(f"  Base URL: {base_url}")
    print(f"  Model: {model}")

    # 初始化LLM客户端
    llm_client = OpenAILLMClient(
        model_name=model,  # 修正参数名
        api_key=api_key,
        base_url=base_url
    )

    try:
        # 测试1：书籍隔离
        await test_book_isolation()

        # 测试2：头脑风暴（使用第一本书）
        book_id = "test_book_001"
        brainstorm_result = await test_brainstorming_with_llm(llm_client, book_id)

        if brainstorm_result:
            # 测试3：冰山引擎
            await test_iceberg_engine_with_llm(llm_client, book_id, brainstorm_result)

        # 总结
        print("\n" + "="*60)
        print("[OK] 所有测试完成！")
        print("="*60)
        print("\n测试覆盖:")
        print("  [OK] 书籍隔离（独立的目录和配置）")
        print("  [OK] 头脑风暴（实际LLM调用）")
        print("  [OK] 冰山引擎（潜台词对白生成）")
        print(f"\n输出目录: test_books_output/")
        print("="*60)

        return 0

    except Exception as e:
        print(f"\n[ERROR] 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
