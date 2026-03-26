#!/usr/bin/env python3
"""
AutoNovel-Studio v3.0 核心功能测试

测试内容：
1. Pydantic 数据模型验证
2. 角色信息差检测
3. 情绪节拍器状态管理
4. FinalProseExtractor 提取功能
5. Internal Script 解析功能
"""
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.core.models_v3 import (
    CharacterMemory,
    EmotionalBeat,
    MacroTensionState,
    PlotOption,
    BrainstormResult,
    InternalScript,
    InternalScriptLine,
    IcebergDraftOutput,
    SceneOutlineV3
)
from src.agents.iceberg_engine import FinalProseExtractor


def test_character_memory():
    """测试角色记忆库和信息差检测"""
    print("\n" + "="*60)
    print("测试 1: 角色记忆库与信息差检测")
    print("="*60)

    # 创建主角
    protagonist = CharacterMemory(
        char_id="char_001",
        name="林辰",
        status="alive",
        current_location="青云宗",
        known_facts=[
            "自己重生回到了五十年前",
            "叶流云对自己有杀心"
        ],
        false_beliefs=[
            "苏清雪是清白的（其实她早就被夺舍）"
        ],
        hidden_motive="不暴露重生的事实，暗中剥夺叶流云的机缘",
        public_status="青云宗掌门亲传弟子"
    )

    # 创建反派
    antagonist = CharacterMemory(
        char_id="char_002",
        name="叶流云",
        status="alive",
        current_location="青云宗",
        known_facts=[
            "林辰开始怀疑自己了",
            "自己在茶里下了绝灵散"
        ],
        false_beliefs=[
            "林辰还不知道我的计划",
            "绝灵散无色无味，不会被察觉"
        ],
        hidden_motive="在林辰突破前下手，夺取青云宗气运",
        public_status="青云宗掌门"
    )

    print(f"\n主角: {protagonist.name}")
    print(f"  已知事实: {protagonist.known_facts}")
    print(f"  错误认知: {protagonist.false_beliefs}")
    print(f"  隐藏动机: {protagonist.hidden_motive}")

    print(f"\n反派: {antagonist.name}")
    print(f"  已知事实: {antagonist.known_facts}")
    print(f"  错误认知: {antagonist.false_beliefs}")
    print(f"  隐藏动机: {antagonist.hidden_motive}")

    # 检测信息差
    gaps = protagonist.has_information_gap(antagonist)
    print(f"\n信息差检测结果（{len(gaps)}个）:")
    for i, gap in enumerate(gaps, 1):
        print(f"  {i}. {gap}")

    assert len(gaps) > 0, "应该检测到信息差"
    print("\n[OK] 信息差检测功能正常")


def test_emotional_beat():
    """测试情绪节拍器"""
    print("\n" + "="*60)
    print("测试 2: 情绪节拍器")
    print("="*60)

    # 创建情绪节拍
    beat1 = EmotionalBeat(
        chapter_num=1,
        scene_num=1,
        score=85,
        dominant_emotion="紧张",
        key_event="林辰发现茶中有毒"
    )

    beat2 = EmotionalBeat(
        chapter_num=2,
        scene_num=1,
        score=90,
        dominant_emotion="愤怒",
        key_event="林辰与叶流云对质"
    )

    beat3 = EmotionalBeat(
        chapter_num=3,
        scene_num=1,
        score=75,
        dominant_emotion="悬疑",
        key_event="发现苏清雪被夺舍"
    )

    print(f"\n第1章情绪值: {beat1.score} - {beat1.dominant_emotion}")
    print(f"第2章情绪值: {beat2.score} - {beat2.dominant_emotion}")
    print(f"第3章情绪值: {beat3.score} - {beat3.dominant_emotion}")

    # 测试宏观张力状态（emotional_curve 只存储情绪值，不存储完整对象）
    macro_state = MacroTensionState(
        emotional_curve=[beat1.score, beat2.score, beat3.score]
    )

    # 计算平均张力指数
    avg_tension = sum(macro_state.emotional_curve) / len(macro_state.emotional_curve)
    print(f"\n平均张力指数: {avg_tension:.1f}")
    print(f"需要注入挫折: {macro_state.needs_setback()}")
    print(f"需要缓解压力: {macro_state.needs_relief()}")

    assert avg_tension > 70, "张力指数应该高于70"
    assert macro_state.needs_setback() == True, "连续高张力，需要注入挫折"
    print("\n[OK] 情绪节拍器功能正常")


def test_plot_option():
    """测试剧情选项"""
    print("\n" + "="*60)
    print("测试 3: 剧情选项与头脑风暴结果")
    print("="*60)

    # 创建3个剧情选项
    option_a = PlotOption(
        option_id="A",
        core_concept="直接对质",
        surface_plot="林辰直接质问叶流云为何下毒",
        devil_twist="叶流云其实被真正的幕后黑手威胁，不得不认罪",
        dramatic_irony="读者知道叶流云是被胁迫的，但林辰误判了他",
        required_information_gaps=[
            "林辰不知道幕后黑手的存在",
            "叶流云不知道林辰已经重生"
        ]
    )

    option_b = PlotOption(
        option_id="B",
        core_concept="暗中布局",
        surface_plot="林辰假装中毒，暗中设局揭穿",
        devil_twist="林辰的'铁证'其实是反派故意泄露的假线索",
        dramatic_irony="主角以为自己在布局，其实反而在反派的局中",
        required_information_gaps=[
            "林辰不知道这是反派的计中计",
            "反派不知道林辰已经识破部分真相"
        ]
    )

    option_c = PlotOption(
        option_id="C",
        core_concept="借力打力",
        surface_plot="借苏清雪之手试探叶流云",
        devil_twist="苏清雪早已被夺舍，反而成为反派的帮凶",
        dramatic_irony="林辰以为在借力，反而暴露了更多底牌",
        required_information_gaps=[
            "林辰不知道苏清雪被夺舍",
            "苏清雪（被夺舍）知道林辰重生的事实"
        ]
    )

    # 创建头脑风暴结果
    result = BrainstormResult(
        options=[option_a, option_b, option_c],
        selected_option_id="B",
        human_notes="把结局改惨一点，让林辰的布局彻底失败"
    )

    print("\n3个剧情选项:")
    for option in result.options:
        print(f"\n选项 {option.option_id}: {option.core_concept}")
        print(f"  常规发展: {option.surface_plot}")
        print(f"  [反转] 魔鬼反转: {option.devil_twist}")
        print(f"  [讽刺] 戏剧讽刺: {option.dramatic_irony}")

    print(f"\n人类选择: 选项 {result.selected_option_id}")
    print(f"批注: {result.human_notes}")

    # 测试获取选项
    selected = result.get_option("B")
    assert selected is not None
    assert selected.core_concept == "暗中布局"
    print("\n[OK] 剧情选项功能正常")


def test_iceberg_extractor():
    """测试冰山引擎提取器"""
    print("\n" + "="*60)
    print("测试 4: Final Prose 提取器")
    print("="*60)

    # 模拟 LLM 输出
    mock_llm_output = """
<Internal_Script>
分析：林辰想试探叶流云，叶流云想掩饰下毒。
林辰（潜台词）：这茶里有绝灵散，你到底还是动手了。
林辰（实际台词）：这今年的云雾青，味道似乎淡了些。
叶流云（潜台词）：别废话快喝下去，我紧张得手心出汗了。
叶流云（实际台词）：师父若是嫌淡，弟子再去换一壶。
</Internal_Script>

<Final_Prose>
密室幽蓝，星图与窍穴共鸣正酣。

叶流云端茶入内，青瓷盏底与檀木托盘相碰，发出极轻的声响。

"师尊，参茶。"

林辰闭目未应。元婴圆满的真元在经脉中奔涌，化神门槛触手可及。

茶香浓郁，混着极淡的甜腥。

林辰睁眼。

"这今年的云雾青，味道似乎淡了些。"他端起茶盏，却并未饮用，只在鼻端轻嗅，"叶儿，这茶是从何处采来？"

叶流云垂手立于一侧，袖中手指微不可察地颤了一下。"回禀师尊，是弟子昨日从后山茶林亲自采摘。"

"亲自采摘？"林辰轻笑，将茶盏置于案上，"难得你有这份孝心。"
</Final_Prose>
"""

    # 提取 Internal Script
    internal_script_text = FinalProseExtractor.extract_internal_script(mock_llm_output)
    print("\n[OK] Internal Script 提取成功:")
    print(internal_script_text[:100] + "...")

    # 提取 Final Prose
    final_prose_text = FinalProseExtractor.extract(mock_llm_output)
    print("\n[OK] Final Prose 提取成功:")
    print(final_prose_text[:100] + "...")

    assert internal_script_text is not None
    assert final_prose_text is not None
    assert "林辰" in final_prose_text
    assert "叶流云" in final_prose_text

    print("\n[OK] 冰山引擎提取器功能正常")


def test_internal_script_parsing():
    """测试 Internal Script 解析"""
    print("\n" + "="*60)
    print("测试 5: Internal Script 解析")
    print("="*60)

    # 创建 Internal Script
    script = InternalScript(
        analysis="林辰想试探叶流云，叶流云想掩饰下毒。",
        script_lines=[
            InternalScriptLine(
                character="林辰",
                subtext="这茶里有绝灵散，你到底还是动手了。",
                spoken_line="这今年的云雾青，味道似乎淡了些。"
            ),
            InternalScriptLine(
                character="叶流云",
                subtext="别废话快喝下去，我紧张得手心出汗了。",
                spoken_line="师父若是嫌淡，弟子再去换一壶。"
            )
        ]
    )

    print("\n分析: " + script.analysis)
    print("\n潜台词推演:")
    for line in script.script_lines:
        print(f"\n  {line.character}:")
        print(f"    （潜台词）{line.subtext}")
        print(f"    （实际台词）{line.spoken_line}")

    # 测试格式化输出
    formatted = script.format_for_display()
    assert "林辰" in formatted
    assert "潜台词" in formatted
    assert "实际台词" in formatted

    print("\n[OK] Internal Script 解析功能正常")


def test_iceberg_draft_output():
    """测试冰山引擎输出"""
    print("\n" + "="*60)
    print("测试 6: Iceberg Draft Output")
    print("="*60)

    # 创建完整的冰山输出
    internal_script = InternalScript(
        analysis="双方试探",
        script_lines=[
            InternalScriptLine(
                character="林辰",
                subtext="我知道你下了毒",
                spoken_line="这茶味道淡了"
            )
        ]
    )

    final_prose = """
密室幽蓝。林辰端起茶盏，并未饮用。
"这茶味道淡了。"
"""

    output = IcebergDraftOutput(
        internal_script=internal_script,
        final_prose=final_prose
    )

    print("\n内部推演:")
    print(output.internal_script.format_for_display())

    print("\n最终正文:")
    print(output.final_prose)

    # 测试获取纯正文
    prose_only = output.get_final_prose_only()
    assert prose_only == final_prose

    print("\n[OK] Iceberg Draft Output 功能正常")


def test_scene_outline():
    """测试场景细纲"""
    print("\n" + "="*60)
    print("测试 7: 场景细纲 v3.0")
    print("="*60)

    outline = SceneOutlineV3(
        scene_number=1,
        title="试探",
        plot_points=[
            "林辰闭关突破",
            "叶流云端茶进入",
            "林辰察觉异样，试探",
            "叶流云紧张掩饰"
        ],
        logic_chain="林辰重生 → 察觉茶中有毒 → 试探叶流云 → 叶流云紧张",
        emotional_arc="警惕(60) → 怀疑(75) → 试探(80)",
        focus_point="重点描写林辰的警觉和叶流云的微表情",
        word_count_target=800,
        character_motives={
            "char_001": "试探叶流云是否下毒，不暴露重生事实",
            "char_002": "掩饰下毒事实，让林辰喝下茶"
        },
        information_gaps={
            "char_001": ["林辰不知道幕后黑手是谁"],
            "char_002": ["叶流云不知道林辰已经重生"]
        },
        subtext_guidance="通过谈论茶的味道来暗中交锋"
    )

    print(f"\n场景 {outline.scene_number}: {outline.title}")
    print("\n情节要点:")
    for i, point in enumerate(outline.plot_points, 1):
        print(f"  {i}. {point}")

    print(f"\n因果逻辑链:\n{outline.logic_chain}")
    print(f"\n情绪弧线: {outline.emotional_arc}")

    print("\n角色动机:")
    for char_id, motive in outline.character_motives.items():
        print(f"  {char_id}: {motive}")

    print("\n信息差配置:")
    for char_id, gaps in outline.information_gaps.items():
        print(f"  {char_id}:")
        for gap in gaps:
            print(f"    - {gap}")

    print("\n[OK] 场景细纲 v3.0 功能正常")


def main():
    """运行所有测试"""
    print("\n" + "="*60)
    print("AutoNovel-Studio v3.0 核心功能测试")
    print("架构: 创意对抗沙盘 + 潜台词渲染引擎 + 信息差引擎")
    print("="*60)

    try:
        # 运行所有测试
        test_character_memory()
        test_emotional_beat()
        test_plot_option()
        test_iceberg_extractor()
        test_internal_script_parsing()
        test_iceberg_draft_output()
        test_scene_outline()

        # 总结
        print("\n" + "="*60)
        print("[OK] 所有测试通过！")
        print("="*60)
        print("\n测试覆盖:")
        print("  [OK] 角色独立记忆库（信息差引擎）")
        print("  [OK] 情绪节拍器（宏观张力控制）")
        print("  [OK] 剧情选项模型（头脑风暴结果）")
        print("  [OK] Final Prose 提取器（正则表达式解析）")
        print("  [OK] Internal Script 解析（潜台词推演）")
        print("  [OK] Iceberg Draft Output（冰山引擎输出）")
        print("  [OK] 场景细纲 v3.0（含信息差配置）")

        print("\n下一步:")
        print("  1. 集成实际 LLM（OpenAI/Claude）")
        print("  2. 测试完整工作流（ShowrunnerWorkflow）")
        print("  3. 启动 Gradio UI（launch_showrunner.py）")

        print("\n" + "="*60)

    except AssertionError as e:
        print(f"\n[ERROR] 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return 1
    except Exception as e:
        print(f"\n[ERROR] 错误: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
