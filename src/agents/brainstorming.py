"""
Brainstorming Room for AutoNovel-Studio v3.0.

核心思想：创意对抗沙盘 - 提案 vs 魔鬼代言人
"""
import logging
from typing import Dict, Any, List
from ..core.models import PlotOption, BrainstormResult
from ..core.llm_client import BaseLLMClient
from ..utils.prompt_utils import PromptBuilder, get_prompt_manager

logger = logging.getLogger(__name__)


class ProposerAgent:
    """
    提案 Agent（Proposer）

    生成3个基础剧情发展方向。
    """

    def __init__(self, llm_client: BaseLLMClient):
        """
        Initialize Proposer Agent.

        Args:
            llm_client: LLM client
        """
        self.llm_client = llm_client
        self.prompt_manager = get_prompt_manager()

    async def generate_proposals(
        self,
        inspiration: str,
        book_context: Dict[str, Any],
        character_states: Dict[str, Any],
        world_lore: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """
        生成3个基础剧情提案。

        Args:
            inspiration: 人类的一句话灵感
            book_context: 书籍上下文
            character_states: 角色状态
            world_lore: 世界观设定

        Returns:
            List of proposals: [{id, core_concept, surface_plot}, ...]
        """
        logger.info(f"Proposer Agent: Generating proposals for: {inspiration}")

        # 提取关键角色
        main_char_raw = character_states.get("char_001")
        antagonist_raw = character_states.get("char_002")

        def to_dict(char):
            if hasattr(char, 'model_dump'):
                return char.model_dump()
            elif hasattr(char, 'dict'):
                return char.dict()
            elif isinstance(char, dict):
                return char
            return {}

        main_char = to_dict(main_char_raw) if main_char_raw else {}
        antagonist = to_dict(antagonist_raw) if antagonist_raw else {}

        # 渲染系统提示词
        context = {
            "inspiration": inspiration,
            "main_char": main_char,
            "antagonist": antagonist,
            "book_context": book_context,
            "world_lore": world_lore
        }
        
        system_prompt = self.prompt_manager.render(
            "brainstorming_proposer.j2",
            context
        )

        user_prompt = "请生成3个提案，并严格以JSON格式输出：{'proposals': [{'id': 'A', 'core_concept': '...', 'surface_plot': '...'}, {'id': 'B', ...}, {'id': 'C', ...}]}"

        # 调用 LLM 生成提案
        try:
            response_data = await self.llm_client.generate_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_model=None,
                response_format={"type": "json_object"},
                temperature=0.8  # 提高创意性
            )

            # 解析 LLM 输出
            proposals = response_data.get("proposals", [])
            
            # 安全校验
            if not isinstance(proposals, list) or len(proposals) == 0:
                raise ValueError("JSON return missing 'proposals' array")
                
            logger.info(f"Generated {len(proposals)} proposals")
            return proposals

        except Exception as e:
            logger.error(f"Failed to generate proposals: {e}")
            # 降级到占位符
            return [
                {
                    "id": "A",
                    "core_concept": "常规发展：主角直接对抗",
                    "surface_plot": f"主角基于'{inspiration}'，选择直接正面冲突的方式解决..."
                },
                {
                    "id": "B",
                    "core_concept": "智取布局：主角暗中设局",
                    "surface_plot": f"主角基于'{inspiration}'，选择暗中布局的方式解决..."
                },
                {
                    "id": "C",
                    "core_concept": "借力打力：主角利用第三方",
                    "surface_plot": f"主角基于'{inspiration}'，选择借助第三方势力的方式解决..."
                }
            ]


class DevilsAdvocateAgent:
    """
    魔鬼代言人 Agent（Devil's Advocate）

    对每个提案注入致命反转或暗黑变数。
    """

    def __init__(self, llm_client: BaseLLMClient):
        """
        Initialize Devil's Advocate Agent.

        Args:
            llm_client: LLM client
        """
        self.llm_client = llm_client
        self.prompt_manager = get_prompt_manager()

    async def inject_twists(
        self,
        proposals: List[Dict[str, str]],
        character_states: Dict[str, Any],
        world_lore: Dict[str, Any]
    ) -> List[PlotOption]:
        """
        为每个提案注入魔鬼反转。

        Args:
            proposals: 基础提案列表
            character_states: 角色状态（含信息差）
            world_lore: 世界观设定

        Returns:
            List of PlotOption with devil_twist
        """
        logger.info("Devil's Advocate Agent: Injecting twists...")

        enhanced_options = []

        # 提取关键角色
        main_char_raw = character_states.get("char_001")

        def to_dict(char):
            if hasattr(char, 'model_dump'):
                return char.model_dump()
            elif hasattr(char, 'dict'):
                return char.dict()
            elif isinstance(char, dict):
                return char
            return {}

        main_char = to_dict(main_char_raw) if main_char_raw else {}
        false_beliefs = main_char.get("false_beliefs", [])

        for proposal in proposals:
            context = {
                "proposal": proposal,
                "false_beliefs": false_beliefs,
                "world_lore": world_lore
            }
            
            system_prompt = self.prompt_manager.render(
                "brainstorming_devil.j2",
                context
            )
            
            user_prompt = "请出具一份带有反转的剧情设计，并通过严格的 JSON 格式输出：{'devil_twist': '...', 'dramatic_irony': '...', 'information_gaps': ['...']}"

            # 调用 LLM 生成反转
            try:
                twist_data = await self.llm_client.generate_json(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    response_model=None,
                    response_format={"type": "json_object"},
                    temperature=0.9  # 提高创意性
                )
            except Exception as e:
                logger.error(f"Failed to generate twist: {e}")
                twist_data = {
                    "devil_twist": "（LLM调用失败，使用默认变数）主角的假设被证伪...",
                    "dramatic_irony": "读者看着主角自己踩入陷阱",
                    "information_gaps": ["主角假设的安全路线已被封死"]
                }

            # 构建 PlotOption
            option = PlotOption(
                option_id=proposal["id"],
                core_concept=proposal["core_concept"],
                surface_plot=proposal["surface_plot"],
                devil_twist=twist_data.get("devil_twist", "待生成"),
                dramatic_irony=twist_data.get("dramatic_irony", "待生成"),
                required_information_gaps=twist_data.get("information_gaps", [])
            )

            enhanced_options.append(option)

        logger.info(f"Enhanced {len(enhanced_options)} proposals with devil twists")
        return enhanced_options


class BrainstormingRoom:
    """
    创意对抗沙盘（Brainstorming Room）

    整合 Proposer 和 Devil's Advocate，生成带反转的剧情选项。
    """

    def __init__(self, llm_client: BaseLLMClient):
        """
        Initialize Brainstorming Room.

        Args:
            llm_client: LLM client
        """
        self.proposer = ProposerAgent(llm_client)
        self.devil = DevilsAdvocateAgent(llm_client)

    async def brainstorm(
        self,
        inspiration: str,
        book_context: Dict[str, Any],
        character_states: Dict[str, Any],
        world_lore: Dict[str, Any]
    ) -> BrainstormResult:
        """
        执行头脑风暴（提案 + 反转）。

        Args:
            inspiration: 人类灵感（一句话）
            book_context: 书籍上下文
            character_states: 角色状态
            world_lore: 世界观设定

        Returns:
            BrainstormResult with 3 enhanced options
        """
        logger.info("=== Starting Brainstorming Room ===")
        logger.info(f"Inspiration: {inspiration}")

        # Step 1: Proposer 生成基础提案
        logger.info("Step 1: Proposer generating base proposals...")
        proposals = await self.proposer.generate_proposals(
            inspiration=inspiration,
            book_context=book_context,
            character_states=character_states,
            world_lore=world_lore
        )

        # Step 2: Devil's Advocate 注入反转
        logger.info("Step 2: Devil's Advocate injecting twists...")
        enhanced_options = await self.devil.inject_twists(
            proposals=proposals,
            character_states=character_states,
            world_lore=world_lore
        )

        # Step 3: 构建结果
        result = BrainstormResult(options=enhanced_options)

        logger.info("=== Brainstorming Complete ===")
        for option in result.options:
            logger.info(f"Option {option.option_id}: {option.core_concept}")
            logger.info(f"  Twist: {option.devil_twist[:50]}...")

        return result


__all__ = [
    "ProposerAgent",
    "DevilsAdvocateAgent",
    "BrainstormingRoom",
]
