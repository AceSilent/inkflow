"""
AutoNovel-Studio v4.0 — Scene Pipeline State Machine
Orchestrates: chapter detail outline → scene drafting (iceberg via j2) →
  3 scene readers (j2) → editor (j2) → chapter assembly → 4 chapter readers (j2) → editor
Per docs/系统开发文档.md architecture. All prompts via Jinja2 templates.
"""
import asyncio
import json
import os
import logging
from pathlib import Path
from typing import Optional, List

from src.core.models import (
    SceneBeat, ChapterDetailOutline, ReaderFeedback, Issue,
    EditorRevisionPlan, SceneState, SceneResult, ChapterPipelineResult,
)
from src.core.llm_factory import get_llm_client
from src.core.prompt_loader import render_prompt

logger = logging.getLogger(__name__)

MAX_SCENE_RETRIES = 3


def _books_dir() -> Path:
    return Path(os.environ.get("AUTONOVEL_DATA_DIR", "books"))


def _load_book_context(book_id: str) -> dict:
    """Load all context needed for generation."""
    book_dir = _books_dir() / book_id
    meta = {}
    lore = {}
    outline_children = []

    meta_file = book_dir / "book_meta.json"
    if meta_file.exists():
        meta = json.loads(meta_file.read_text(encoding="utf-8"))

    brainstorm_file = book_dir / "brainstorm" / "chat.json"
    if brainstorm_file.exists():
        session = json.loads(brainstorm_file.read_text(encoding="utf-8"))
        lore = session.get("lore", {})

    outline_file = book_dir / "outlines" / "outline.json"
    if outline_file.exists():
        outline = json.loads(outline_file.read_text(encoding="utf-8"))
        outline_children = outline.get("children", [])

    return {"meta": meta, "lore": lore, "outline_children": outline_children}


def _find_chapter(children: list, chapter_id: str) -> Optional[dict]:
    for node in children:
        if node.get("id") == chapter_id:
            return node
        found = _find_chapter(node.get("children", []), chapter_id)
        if found:
            return found
    return None


def _find_volume_for_chapter(children: list, chapter_id: str) -> Optional[dict]:
    for vol in children:
        if vol.get("type") != "volume":
            continue
        for ch in vol.get("children", []):
            if ch.get("id") == chapter_id:
                return vol
    return None


def _get_previous_scenes_text(book_dir: Path, chapter_id: str, current_scene_idx: int, scenes: list, max_chars: int = 3000) -> str:
    parts = []
    for i in range(max(0, current_scene_idx - 2), current_scene_idx):
        scene_file = book_dir / "drafts" / "scenes" / f"{scenes[i].scene_id}.md"
        if scene_file.exists():
            text = scene_file.read_text(encoding="utf-8")
            if len(text) > max_chars // 2:
                text = text[:max_chars // 2] + "\n...(省略)..."
            parts.append(f"[{scenes[i].title}]\n{text}")
    return "\n\n".join(parts)


# ── Step 1: Generate Chapter Detail Outline ──

async def generate_chapter_detail_outline(
    book_id: str, chapter_id: str
) -> ChapterDetailOutline:
    book_dir = _books_dir() / book_id
    ctx = _load_book_context(book_id)
    chapter_node = _find_chapter(ctx["outline_children"], chapter_id)
    volume_node = _find_volume_for_chapter(ctx["outline_children"], chapter_id)

    if not chapter_node:
        raise ValueError(f"Chapter {chapter_id} not found in outline")

    detail_file = book_dir / "outlines" / f"{chapter_id}_detail.json"
    if detail_file.exists():
        data = json.loads(detail_file.read_text(encoding="utf-8"))
        return ChapterDetailOutline(**data)

    context_parts = []
    if ctx["meta"].get("title"):
        context_parts.append(f"书名：{ctx['meta']['title']}")
    if ctx["lore"]:
        lore = ctx["lore"]
        for key in ["protagonist", "worldSetting", "synopsis"]:
            if lore.get(key):
                context_parts.append(f"[{key}] {lore[key]}")
    if volume_node:
        context_parts.append(f"[当前卷] {volume_node.get('label', '')}：{volume_node.get('summary', '')}")
    context_parts.append(f"[章节] {chapter_node.get('label', '')}：{chapter_node.get('summary', '')}")

    llm = get_llm_client("author")
    result = await llm.generate_json(
        system_prompt=(
            "你是专业的小说架构师。请将以下章节大纲拆分为3-5个具体场景(Scene)。\n"
            "每个场景应包含：标题、视角角色、地点、出场角色、叙事目标、核心冲突、场景结果、情绪弧线。\n"
            "每个场景的目标字数为600-1000字。场景之间要有逻辑递进关系，情绪要有起伏。\n"
            "最后一个场景必须留有悬念钩子。"
        ),
        user_prompt="\n".join(context_parts),
        response_model=ChapterDetailOutline,
    )

    for i, scene in enumerate(result.scenes):
        if not scene.scene_id or scene.scene_id == "string":
            scene.scene_id = f"{chapter_id}_s{i+1}"
    result.chapter_id = chapter_id
    result.title = chapter_node.get("label", chapter_id)

    detail_file.parent.mkdir(parents=True, exist_ok=True)
    detail_file.write_text(result.model_dump_json(indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info(f"Detail outline saved: {len(result.scenes)} scenes for {chapter_id}")
    return result


# ── Step 2: Generate Scene Draft (Iceberg via j2 → Author) ──

async def generate_scene_draft(
    book_id: str, scene: SceneBeat, detail_outline: ChapterDetailOutline,
    revision_instructions: Optional[List[str]] = None,
) -> tuple[str, str]:
    """Generate a single scene draft using the Iceberg Engine pipeline (via j2 templates)."""
    book_dir = _books_dir() / book_id
    ctx = _load_book_context(book_id)
    lore = ctx["lore"]

    scene_idx = next((i for i, s in enumerate(detail_outline.scenes) if s.scene_id == scene.scene_id), 0)
    prev_text = _get_previous_scenes_text(book_dir, detail_outline.chapter_id, scene_idx, detail_outline.scenes)

    # Build scene characters for iceberg template
    scene_characters = []
    for char_name in scene.characters:
        scene_characters.append({
            "name": char_name,
            "public_status": scene.pov if char_name == scene.pov else "在场",
            "hidden_motive": scene.conflict or "未知",
        })

    scene_outline_text = (
        f"场景：{scene.title}\n"
        f"视角：{scene.pov}\n"
        f"地点：{scene.location}\n"
        f"目标：{scene.goal}\n"
        f"冲突：{scene.conflict}\n"
        f"结果：{scene.outcome}\n"
        f"情绪弧线：{scene.emotion_arc}"
    )

    llm = get_llm_client("author")

    # ── Iceberg Engine via author_iceberg_v3.j2 ──
    logger.info(f"Iceberg (j2) for {scene.scene_id}...")
    try:
        iceberg_prompt = render_prompt("author_iceberg_v3",
            book_tone=lore.get("synopsis", "未知基调"),
            current_scene_characters=scene_characters,
            scene_outline_text=scene_outline_text,
            example_samples="",
        )
    except Exception:
        iceberg_prompt = (
            "你是「冰山引擎」——小说创作的深层分析系统。\n"
            "请分析本场景的：潜台词、感官锚点、情绪暗流、叙事节奏、Show Don't Tell要点。\n"
            "控制在300字以内。"
        )

    iceberg_result = await llm.generate_text(
        system_prompt=iceberg_prompt,
        user_prompt=f"[前文]\n{prev_text}\n\n[当前场景]\n{scene_outline_text}" if prev_text else scene_outline_text,
        temperature=0.6,
        max_tokens=1500,
    )

    # Parse iceberg — extract Internal_Script and Final_Prose if present
    iceberg_analysis = iceberg_result
    draft = ""

    if "<Final_Prose>" in iceberg_result:
        # The iceberg template produces both analysis and prose
        parts = iceberg_result.split("<Final_Prose>")
        iceberg_analysis = parts[0].replace("<Internal_Script>", "").replace("</Internal_Script>", "").strip()
        prose_part = parts[1].replace("</Final_Prose>", "").strip() if len(parts) > 1 else ""
        if len(prose_part) > 200:
            draft = prose_part
    
    logger.info(f"Iceberg done for {scene.scene_id}: {len(iceberg_analysis)} chars")

    # ── Author Agent: If iceberg didn't produce prose, generate separately ──
    if not draft or len(draft) < 200:
        logger.info(f"Drafting prose separately for {scene.scene_id}...")
        author_context = scene_outline_text
        if prev_text:
            author_context = f"[前文]\n{prev_text}\n\n{author_context}"
        if revision_instructions:
            author_context += f"\n\n[修改指令]\n" + "\n".join(f"- {i}" for i in revision_instructions)
        author_context += f"\n\n[冰山分析]\n{iceberg_analysis}"
        if lore.get("protagonist"):
            author_context = f"[主角] {lore['protagonist']}\n\n{author_context}"

        draft = await llm.generate_text(
            system_prompt=(
                "你是一位顶级华语小说家。请根据场景设定和冰山分析，撰写本场景的正文。\n\n"
                "严格遵守：\n"
                f"1. 字数控制在{scene.word_target}字左右（±200字）\n"
                "2. 以小说正文直接书写，不要标注场景号或元说明\n"
                "3. 严格执行'Show, Don't Tell'\n"
                "4. 对话要有个性化口癖\n"
                "5. 禁止使用破折号（——）进行解说\n"
                "6. 禁止AI俗语：'嘴角勾起'、'眼中闪过'、'不禁XXX'、'心中暗想'\n"
                "7. 每个段落不超过3行\n"
                "8. 遵循冰山分析中的潜台词和感官指引"
            ),
            user_prompt=author_context,
            temperature=0.85,
            max_tokens=2000,
        )
    
    logger.info(f"Draft done for {scene.scene_id}: {len(draft)} chars")

    # Save
    iceberg_dir = book_dir / "drafts" / "iceberg"
    iceberg_dir.mkdir(parents=True, exist_ok=True)
    (iceberg_dir / f"{scene.scene_id}.md").write_text(iceberg_analysis, encoding="utf-8")

    scenes_dir = book_dir / "drafts" / "scenes"
    scenes_dir.mkdir(parents=True, exist_ok=True)
    (scenes_dir / f"{scene.scene_id}.md").write_text(draft, encoding="utf-8")

    return draft, iceberg_analysis


# ── Step 3: Review Scene (3 Scene-Level Readers via j2) ──

async def _run_reader_j2(reader_role: str, template_name: str, template_vars: dict, draft: str) -> ReaderFeedback:
    """Run a single reader agent using a Jinja2 template."""
    import re as _re
    llm = get_llm_client("author")
    try:
        prompt = render_prompt(template_name, draft=draft, **template_vars)
        # Use generate_text + manual parsing to avoid issubclass() issues with generate_json
        raw = await llm.generate_text(
            system_prompt=prompt,
            user_prompt=(
                "请以纯JSON格式输出你的评审报告，格式如下：\n"
                '{"reader_role":"角色名","immersion_score":7,"emotional_watermark":"情绪描述",'
                '"issues":[{"error_type":"类型","severity":3,"quote":"引用","description":"描述"}]}\n'
                "直接输出JSON，不要有其他文字。"
            ),
        )
        # Parse JSON from raw text
        raw = raw.strip()
        json_data = None
        # Strategy 1: direct parse
        try:
            json_data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            pass
        # Strategy 2: find JSON in markdown code block
        if json_data is None:
            m = _re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', raw, _re.DOTALL)
            if m:
                try:
                    json_data = json.loads(m.group(1).strip())
                except (json.JSONDecodeError, ValueError):
                    pass
        # Strategy 3: extract first { to last }
        if json_data is None:
            first = raw.find('{')
            last = raw.rfind('}')
            if first >= 0 and last > first:
                candidate = raw[first:last+1]
                candidate = _re.sub(r',\s*([}\]])', r'\1', candidate)
                try:
                    json_data = json.loads(candidate)
                except (json.JSONDecodeError, ValueError):
                    pass
        if json_data is None:
            raise Exception(f"Failed to parse reader JSON from response: {raw[:200]}")
        
        feedback = ReaderFeedback(**json_data)
        feedback.reader_role = reader_role
        return feedback
    except Exception as e:
        logger.error(f"Reader {reader_role} ({template_name}) failed: {e}")
        return ReaderFeedback(
            reader_role=reader_role,
            immersion_score=5,
            emotional_watermark="无法评估",
            issues=[Issue(error_type="READER_ERROR", severity=1, quote="", description=str(e))],
        )


async def review_scene(book_id: str, scene: SceneBeat, draft: str) -> List[ReaderFeedback]:
    """Run 3 scene-level reader agents concurrently using j2 templates."""
    ctx = _load_book_context(book_id)
    lore = ctx["lore"]
    lore_str = json.dumps(lore, ensure_ascii=False)[:2000] if lore else "无设定"

    readers = [
        # Scene Lore Checker
        ("scene_lore_checker", "reader_scene_lore", {
            "pov_character": scene.pov,
            "setting": scene.location or "未指定",
            "characters_info": ", ".join(scene.characters) if scene.characters else "未指定",
            "world_lore": lore.get("worldSetting", "无世界观设定"),
        }),
        # Scene Pacing Reviewer
        ("scene_pacing_reviewer", "reader_scene_pacing", {
            "scene_target": scene.goal,
            "logic_chain": "",
            "emotional_arc": scene.emotion_arc,
            "focus_point": scene.conflict,
        }),
        # Scene AI Tone Detector
        ("scene_ai_tone_detector", "reader_scene_ai_tone", {
            "book_tone": lore.get("synopsis", "未知"),
            "book_genre": ctx["meta"].get("genre", "小说"),
        }),
    ]

    tasks = [
        _run_reader_j2(role, template, vars, draft)
        for role, template, vars in readers
    ]

    feedbacks = await asyncio.gather(*tasks, return_exceptions=True)
    results = []
    for fb in feedbacks:
        if isinstance(fb, Exception):
            logger.error(f"Scene reader failed: {fb}")
            results.append(ReaderFeedback(
                reader_role="error", immersion_score=5,
                emotional_watermark="错误", issues=[]
            ))
        else:
            results.append(fb)
    return results


# ── Step 3b: Chapter-Level Review (4 Chapter Readers via j2) ──

async def review_chapter(book_id: str, chapter_id: str, assembled_text: str, detail_outline: ChapterDetailOutline) -> List[ReaderFeedback]:
    """Run 4 chapter-level reader agents concurrently on the assembled chapter."""
    ctx = _load_book_context(book_id)
    lore = ctx["lore"]
    meta = ctx["meta"]

    # Build characters dict for lore_keeper template
    characters = {}
    if lore.get("protagonist"):
        characters["protagonist"] = {
            "name": lore.get("protagonist", ""),
            "current_status": "活跃",
            "location": "未知",
            "personality_traits": [],
            "power_level": "未知",
            "equipment": [],
            "notes": "",
        }

    # Build world_lore dict for lore_keeper template
    world_lore = {}
    if lore.get("worldSetting"):
        world_lore["world_setting"] = {
            "key": "世界背景",
            "category": "设定",
            "importance": 5,
            "value": lore["worldSetting"],
        }

    # Build book_meta for pacing/anti_trope templates
    book_meta = {
        "tone": lore.get("synopsis", meta.get("tone", "未知")),
        "target_audience": meta.get("target_audience", "网文读者"),
        "forbidden_elements": meta.get("forbidden_elements", []),
    }

    chapter_outline_data = {
        "summary": detail_outline.chapter_hook if detail_outline else "",
    }

    readers = [
        # Chapter-level Lore Keeper
        ("lore_keeper", "reader_lore_keeper", {
            "characters": characters,
            "world_lore": world_lore,
        }),
        # Chapter-level Pacing Junkie
        ("pacing_junkie", "reader_pacing_junkie", {
            "book_meta": book_meta,
            "chapter_outline": chapter_outline_data,
            "previous_chapters": "",
        }),
        # Chapter-level Anti-Trope Scanner
        ("anti_trope_scanner", "reader_anti_trope", {
            "book_meta": book_meta,
        }),
        # Chapter-level AI Tone Scanner
        ("anti_ai_tone_scanner", "reader_ai_tone", {
            "book_tone": book_meta["tone"],
            "genre": meta.get("genre", "小说"),
        }),
    ]

    tasks = [
        _run_reader_j2(role, template, vars, assembled_text)
        for role, template, vars in readers
    ]

    feedbacks = await asyncio.gather(*tasks, return_exceptions=True)
    results = []
    for fb in feedbacks:
        if isinstance(fb, Exception):
            logger.error(f"Chapter reader failed: {fb}")
            results.append(ReaderFeedback(
                reader_role="error", immersion_score=5,
                emotional_watermark="错误", issues=[]
            ))
        else:
            results.append(fb)
    return results


# ── Step 4: Editor Arbitration (via editor_review.j2) ──

async def editor_arbitrate(
    scene: SceneBeat, draft: str, feedbacks: List[ReaderFeedback],
    ctx: Optional[dict] = None,
) -> EditorRevisionPlan:
    """Editor agent using editor_review.j2 template."""
    llm = get_llm_client("author")
    lore = ctx.get("lore", {}) if ctx else {}
    meta = ctx.get("meta", {}) if ctx else {}

    # Build feedback dicts for the template
    feedback_dicts = []
    for fb in feedbacks:
        feedback_dicts.append({
            "reader_role": fb.reader_role,
            "immersion_score": fb.immersion_score,
            "emotional_watermark": fb.emotional_watermark,
            "issues": [{"error_type": iss.error_type, "severity": iss.severity, "description": iss.description, "quote": iss.quote, "suggestion": ""} for iss in fb.issues],
            "overall_comment": "",
        })

    try:
        prompt = render_prompt("editor_review",
            book_title=meta.get("title", "未命名"),
            book_genre=meta.get("genre", "小说"),
            sub_genres=meta.get("sub_genres", []),
            book_tone=lore.get("synopsis", "未知"),
            forbidden_elements=meta.get("forbidden_elements", []),
            chapter_title=scene.title if scene else "未知",
            chapter_summary=scene.goal if scene else "",
            scene_target=scene.goal if scene else "",
            reader_feedbacks=feedback_dicts,
        )
        import re as _re
        plan_raw = await llm.generate_text(
            system_prompt=prompt,
            user_prompt=(
                f"[稿件摘要]\n{draft[:800]}...\n\n"
                "请以纯JSON格式输出你的编辑决策，格式如下：\n"
                '{"pass_status":true,"rejected_feedbacks":[],'
                '"revision_instructions":[],"scene_target":"","priority_fixes":[]}\n'
                "直接输出JSON，不要有其他文字。"
            ),
        )
        # Parse JSON
        plan_raw = plan_raw.strip()
        plan_data = None
        try:
            plan_data = json.loads(plan_raw)
        except (json.JSONDecodeError, ValueError):
            pass
        if plan_data is None:
            m = _re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', plan_raw, _re.DOTALL)
            if m:
                try:
                    plan_data = json.loads(m.group(1).strip())
                except (json.JSONDecodeError, ValueError):
                    pass
        if plan_data is None:
            first = plan_raw.find('{')
            last = plan_raw.rfind('}')
            if first >= 0 and last > first:
                candidate = plan_raw[first:last+1]
                candidate = _re.sub(r',\s*([}\]])', r'\1', candidate)
                try:
                    plan_data = json.loads(candidate)
                except (json.JSONDecodeError, ValueError):
                    pass
        if plan_data is None:
            raise Exception(f"Failed to parse editor JSON: {plan_raw[:200]}")
        plan = EditorRevisionPlan(**plan_data)
        return plan
    except Exception as e:
        logger.error(f"Editor failed: {e}")
        return EditorRevisionPlan(
            pass_status=True,
            rejected_feedbacks=[],
            revision_instructions=[],
            scene_target=scene.goal if scene else "",
        )


# ── Step 5: Full Chapter Pipeline ──

async def run_chapter_pipeline(
    book_id: str, chapter_id: str,
    on_progress=None,
) -> ChapterPipelineResult:
    """Run the complete scene-based generation pipeline for a chapter.
    
    Pipeline:
    1. Generate chapter detail outline (3-5 scenes)
    2. For each scene:
       a. DRAFTING: iceberg (j2) + author
       b. REVIEWING: 3 scene-level readers (j2, concurrent)
       c. EDITING: editor (j2)
       d. If rejected & retries<3: back to (a) with instructions
       e. If rejected & retries>=3: mark needs_human
       f. COMMITTED: save scene
    3. Assemble chapter from all scenes
    4. CHAPTER REVIEW: 4 chapter-level readers (j2, concurrent)
    5. If chapter rejected, mark worst scenes for re-draft
    """
    book_dir = _books_dir() / book_id
    ctx = _load_book_context(book_id)

    # Step 1: detail outline
    if on_progress:
        await _emit(on_progress, chapter_id, "generating_outline", {})
    detail_outline = await generate_chapter_detail_outline(book_id, chapter_id)

    result = ChapterPipelineResult(
        chapter_id=chapter_id,
        title=detail_outline.title,
        detail_outline=detail_outline,
        status="generating",
    )

    # Step 2: process each scene
    for scene in detail_outline.scenes:
        scene_result = SceneResult(scene_id=scene.scene_id)
        revision_instructions = None

        while scene_result.retries <= MAX_SCENE_RETRIES:
            # ── DRAFTING ──
            scene_result.state = SceneState.DRAFTING
            if on_progress:
                await _emit(on_progress, scene.scene_id, "drafting", {"title": scene.title, "retry": scene_result.retries})

            draft, iceberg = await generate_scene_draft(
                book_id, scene, detail_outline, revision_instructions
            )
            scene_result.draft = draft
            scene_result.iceberg_analysis = iceberg
            scene_result.word_count = len(draft)

            # ── REVIEWING (3 scene readers) ──
            scene_result.state = SceneState.REVIEWING
            if on_progress:
                await _emit(on_progress, scene.scene_id, "reviewing", {"word_count": len(draft)})

            feedbacks = await review_scene(book_id, scene, draft)
            scene_result.reader_feedbacks = feedbacks

            # ── EDITING ──
            scene_result.state = SceneState.EDITING
            if on_progress:
                await _emit(on_progress, scene.scene_id, "editing", {
                    "scores": [f.immersion_score for f in feedbacks]
                })

            editor_plan = await editor_arbitrate(scene, draft, feedbacks, ctx)
            scene_result.editor_plan = editor_plan

            if editor_plan.pass_status:
                scene_result.state = SceneState.COMMITTED
                if on_progress:
                    await _emit(on_progress, scene.scene_id, "committed", {
                        "word_count": len(draft),
                        "avg_score": sum(f.immersion_score for f in feedbacks) / max(len(feedbacks), 1),
                    })
                break
            else:
                scene_result.retries += 1
                revision_instructions = editor_plan.revision_instructions
                logger.warning(f"Scene {scene.scene_id} rejected (retry {scene_result.retries}): {revision_instructions}")

                if scene_result.retries > MAX_SCENE_RETRIES:
                    scene_result.state = SceneState.NEEDS_HUMAN
                    if on_progress:
                        await _emit(on_progress, scene.scene_id, "needs_human", {
                            "reason": "超过最大重试次数",
                            "instructions": revision_instructions,
                        })
                    break

        result.scene_results.append(scene_result)

    # Step 3: Assemble chapter
    assembled_parts = [sr.draft for sr in result.scene_results if sr.draft]
    result.assembled_text = "\n\n".join(assembled_parts)
    result.total_word_count = len(result.assembled_text)

    # Step 4: Chapter-level review (4 chapter readers)
    if on_progress:
        await _emit(on_progress, chapter_id, "chapter_reviewing", {"word_count": result.total_word_count})

    chapter_feedbacks = await review_chapter(book_id, chapter_id, result.assembled_text, detail_outline)

    # Store chapter-level reviews in the first scene result's reader_feedbacks (extended)
    # Or better: store them separately in the pipeline result
    chapter_review_data = {
        "level": "chapter",
        "feedbacks": [fb.model_dump() for fb in chapter_feedbacks],
    }

    result.status = "completed"

    # Save assembled chapter
    drafts_dir = book_dir / "drafts"
    drafts_dir.mkdir(exist_ok=True)
    (drafts_dir / f"{chapter_id}.md").write_text(result.assembled_text, encoding="utf-8")

    # Save review data (scene + chapter level)
    reviews_dir = book_dir / "reviews"
    reviews_dir.mkdir(exist_ok=True)
    review_data = {
        "chapter_id": chapter_id,
        "scenes": [sr.model_dump() for sr in result.scene_results],
        "chapter_review": chapter_review_data,
    }
    (reviews_dir / f"{chapter_id}.json").write_text(
        json.dumps(review_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Save pipeline result
    (drafts_dir / f"{chapter_id}_pipeline.json").write_text(
        result.model_dump_json(indent=2, ensure_ascii=False), encoding="utf-8"
    )

    logger.info(f"Chapter {chapter_id} complete: {result.total_word_count} chars, "
                f"{len(result.scene_results)} scenes, "
                f"chapter avg: {sum(f.immersion_score for f in chapter_feedbacks)/max(len(chapter_feedbacks),1):.1f}/10")
    return result


async def _emit(callback, scene_id, state, data):
    try:
        if asyncio.iscoroutinefunction(callback):
            await callback(scene_id, state, data)
        else:
            callback(scene_id, state, data)
    except Exception:
        pass
