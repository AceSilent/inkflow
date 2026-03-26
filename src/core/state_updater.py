"""
State Updater for AutoNovel-Studio v3.0.

核心功能：从场景文本中提取并更新角色认知状态（known_facts & false_beliefs）
这是 v3.0 最关键的组件——让 AI 能够"算计"和"推演"。
"""
import logging
import json
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from ..core.models import CharacterMemory, CharacterCognitionState
from ..core.llm_client import BaseLLMClient

logger = logging.getLogger(__name__)


class StateUpdateDelta(BaseModel):
    """
    状态变更增量。

    描述场景中角色认知的变化。
    """
    char_id: str
    facts_learned: List[str] = Field(
        default_factory=list,
        description="新学到的真相（从 false_beliefs 移入 known_facts）"
    )
    beliefs_corrected: List[Dict[str, str]] = Field(
        default_factory=list,
        description="被纠正的错误认知：[{old_belief, truth}, ...]"
    )
    new_false_beliefs: List[str] = Field(
        default_factory=list,
        description="新增的错误认知（被误导）"
    )

class StateUpdateResult(BaseModel):
    """
    接收 LLM 返回的结果包装器
    """
    updates: Dict[str, StateUpdateDelta] = Field(
        description="角色ID与其状态变更的映射"
    )


class StateUpdater:
    """
    状态更新器（State Mutator）

    使用轻量级 LLM（GPT-4o-mini / Claude 3 Haiku）从场景文本中提取角色认知变化。
    """

    SYSTEM_PROMPT = """
你是角色状态分析专家。你的任务是从小说场景中提取角色认知的变化。

## 核心概念
- **known_facts（已知事实）**: 角色确定的真相
- **false_beliefs（错误认知）**: 角色错误相信的事（戏剧冲突的来源）

## 分析流程
1. 识别场景中涉及的角色
2. 分析每个角色的认知变化：
   - 是否发现了新真相？（加入 known_facts）
   - 是否打破了之前的错误认知？（从 false_beliefs 移入 known_facts）
   - 是否被新的信息误导？（加入 false_beliefs）
3. 输出结构化的状态变更

## 示例
场景文本：
"林辰看着叶流云递来的茶，嗅到极淡的甜腥味。绝灵散！他终于明白了，五十年前背叛自己的就是这个徒弟。"

分析结果：
- char_id: "char_001" (林辰)
- facts_learned: ["叶流云是背叛者", "茶中有绝灵散"]
- beliefs_corrected: [{"old": "叶流云是忠诚徒弟", "truth": "叶流云是背叛者"}]
    """

    def __init__(self, llm_client: BaseLLMClient):
        """
        Initialize State Updater.

        Args:
            llm_client: LLM client (建议使用轻量级模型)
        """
        self.llm_client = llm_client

    async def update_from_scene(
        self,
        scene_text: str,
        current_states: CharacterCognitionState,
        involved_char_ids: List[str],
        scene_outline: Optional[str] = None
    ) -> Dict[str, StateUpdateDelta]:
        """
        从场景文本中更新角色状态。

        Args:
            scene_text: 场景文本
            current_states: 当前角色状态集
            involved_char_ids: 涉及的角色 ID 列表
            scene_outline: 场景大纲（可选，提供上下文）

        Returns:
            Dict of {char_id: StateUpdateDelta}
        """
        logger.info(f"StateUpdater: Analyzing scene for {len(involved_char_ids)} characters")

        # 构建分析提示
        prompt = self._build_analysis_prompt(
            scene_text=scene_text,
            current_states=current_states,
            involved_char_ids=involved_char_ids,
            scene_outline=scene_outline
        )

        # 调用 LLM 分析
        try:
            result = await self._call_llm_for_analysis(prompt)
            deltas = result.updates
        except Exception as e:
            logger.error(f"State analysis failed: {e}")
            deltas = self._mock_analysis(involved_char_ids)

        # 应用状态变更
        for char_id, delta in deltas.items():
            char_state = current_states.get_character(char_id)
            if char_state:
                self._apply_delta(char_state, delta, scene_text[:100])

        logger.info(f"State update complete: {len(deltas)} characters updated")
        return deltas

    def _build_analysis_prompt(
        self,
        scene_text: str,
        current_states: CharacterCognitionState,
        involved_char_ids: List[str],
        scene_outline: Optional[str] = None
    ) -> str:
        """构建状态分析提示。"""
        # 收集角色当前状态
        char_states_text = ""
        for char_id in involved_char_ids:
            char = current_states.get_character(char_id)
            if char:
                char_states_text += f"""
## 角色：{char.name} (ID: {char_id})
当前状态：{char.status}
当前已知事实：
{chr(10).join(f'  - {fact}' for fact in char.known_facts) if char.known_facts else '  - 无'}
当前错误认知：
{chr(10).join(f'  - {belief}' for belief in char.false_beliefs) if char.false_beliefs else '  - 无'}
隐藏动机：{char.hidden_motive}
---
                """

        prompt = f"""
{self.SYSTEM_PROMPT}

## 【当前场景】
{scene_outline if scene_outline else "（无大纲）"}

## 【场景文本】
{scene_text}

## 【涉及角色的当前状态】
{char_states_text}

## 【输出要求】
分析上述场景中每个角色的认知变化，输出 JSON 格式：

{{
  "updates": {{
    "char_001": {{
      "char_id": "char_001",
      "facts_learned": ["新学到的真相1", "真相2"],
      "beliefs_corrected": [
        {{"old": "旧错误认知", "truth": "真相"}},
        {{"old": "另一个错误", "truth": "真相"}}
      ],
      "new_false_beliefs": ["被误导的新认知"]
    }},
    "char_002": {{ ... }}
  }}
}}
        """
        return prompt.strip()

    async def _call_llm_for_analysis(self, prompt: str) -> StateUpdateResult:
        """调用 LLM 进行状态分析。"""
        return await self.llm_client.generate_json(
            system_prompt="你是顶级小说角色认知状态分析专家，专注于找出信息差的变化。",
            user_prompt=prompt,
            response_model=StateUpdateResult,
            temperature=0.3,
            max_tokens=1500
        )

    def _mock_analysis(self, involved_char_ids: List[str]) -> Dict[str, StateUpdateDelta]:
        """模拟分析（占位符）。"""
        # 返回空变更
        return {
            char_id: StateUpdateDelta(char_id=char_id)
            for char_id in involved_char_ids
        }

    def _apply_delta(
        self,
        char_state: CharacterMemory,
        delta: StateUpdateDelta,
        trigger_event: str
    ) -> None:
        """
        应用状态变更。

        Args:
            char_state: 角色状态
            delta: 状态变更增量
            trigger_event: 触发事件描述
        """
        # 添加新的事实
        for fact in delta.facts_learned:
            char_state.add_known_fact(fact, trigger_event)

        # 纠正错误认知
        for correction in delta.beliefs_corrected:
            char_state.remove_false_belief(
                correction["old"],
                f"纠正为: {correction['truth']}"
            )
            # 添加真相
            char_state.add_known_fact(correction["truth"], trigger_event)

        # 添加新的错误认知
        for false_belief in delta.new_false_beliefs:
            if false_belief not in char_state.false_beliefs:
                char_state.false_beliefs.append(false_belief)
                char_state.belief_history.append({
                    "timestamp": datetime.now().isoformat(),
                    "type": "false_belief_acquired",
                    "content": false_belief,
                    "trigger": trigger_event
                })


class EmotionalAnalysisOutput(BaseModel):
    score: int = Field(ge=0, le=100)
    dominant_emotion: str = Field(...)
    key_event: str = Field(...)
    reasoning: str = Field(...)

class EmotionalBeatTracker:
    """
    情绪节拍追踪器（Emotional Beat Tracker）

    维护宏观张力状态，防止流水账。
    """

    def __init__(self, llm_client: BaseLLMClient):
        """
        Initialize Emotional Beat Tracker.

        Args:
            llm_client: LLM client
        """
        self.llm_client = llm_client

    async def analyze_scene_emotion(
        self,
        scene_text: str,
        chapter_num: int,
        scene_num: int,
        current_curve: List[int]
    ) -> Dict[str, Any]:
        """
        分析场景的情绪节拍。

        Args:
            scene_text: 场景文本
            chapter_num: 章节号
            scene_num: 场景号
            current_curve: 当前情绪曲线（最近5章）

        Returns:
            Dict with:
                - score: 情绪值（0-100）
                - dominant_emotion: 主导情绪
                - key_event: 关键事件
                - needs_setback: 是否需要注入挫折
                - needs_relief: 是否需要缓解压力
        """
        logger.info(f"Analyzing emotion for ch{chapter_num}_scene{scene_num}")

        # 构建分析提示
        prompt = f"""
你是情绪分析专家。请分析以下场景的情绪指数。

## 【当前情绪曲线】
{current_curve}

## 【场景文本】
{scene_text}

## 【输出要求】
输出 JSON 格式：
{{
  "score": 75,  // 0-100，0=极度绝望，100=极度爽快
  "dominant_emotion": "希望/愤怒/爽快/绝望/平静",
  "key_event": "关键事件描述",
  "reasoning": "评分理由"
}}
        """

        try:
            result_obj = await self.llm_client.generate_json(
                system_prompt="你是情绪张力分析引擎。",
                user_prompt=prompt,
                response_model=EmotionalAnalysisOutput,
                temperature=0.5,
                max_tokens=500
            )
            score = result_obj.score
            dominant = result_obj.dominant_emotion
            key_event = result_obj.key_event
        except Exception as e:
            logger.error(f"Emotion analysis failed: {e}")
            score = 75
            dominant = "爽快"
            key_event = "主角反击"

        return {
            "score": score,
            "dominant_emotion": dominant,
            "key_event": key_event,
            "needs_setback": self._check_setback_needed(current_curve + [score]),
            "needs_relief": self._check_relief_needed(current_curve + [score])
        }

    def _check_setback_needed(self, new_curve: List[int]) -> bool:
        """检查是否需要注入挫折。"""
        if len(new_curve) < 3:
            return False
        return all(score > 70 for score in new_curve[-3:])

    def _check_relief_needed(self, new_curve: List[int]) -> bool:
        """检查是否需要缓解压力。"""
        if len(new_curve) < 3:
            return False
        return all(score < 30 for score in new_curve[-3:])


__all__ = [
    "StateUpdateDelta",
    "StateUpdater",
    "EmotionalBeatTracker",
]
