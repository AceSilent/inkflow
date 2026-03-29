import json
import logging
from pathlib import Path
from typing import Dict, Any, List
from src.core.models import TaskRecord, TaskStatus
from src.core.task_manager import update_task_status
from src.core.llm_factory import get_llm_client
from src.core.agent_tools import (
    AUTHOR_TOOLS, TERMINAL_TOOLS,
    read_file, search_lore, read_outline,
    load_skill, list_skills, save_draft, submit_for_review, save_outline, save_lore,
    read_tree, add_plot_node, confirm_path, prune_branch, merge_branches,
    present_options, request_guidance, browse_examples,
)
from src.core.groupchat_orchestrator import AGENT_SYSTEM_PROMPTS

logger = logging.getLogger(__name__)

# Tool dispatch table — maps tool name to (handler_fn, needs_book_id)
# Each handler receives (book_id, task_id, args) and returns a string result.
def _dispatch_tool(name: str, book_id: str, task_id: str, args: dict) -> tuple[str, bool]:
    """Dispatch a tool call. Returns (result_string, is_terminal).

    is_terminal=True means the agent has completed its work (e.g. submit_for_review).
    """
    # Check if this is a terminal tool
    is_terminal = name in TERMINAL_TOOLS

    if name == "read_file":
        return read_file(book_id, args.get("relative_path", "")), False
    elif name == "search_lore":
        return search_lore(book_id, args.get("query", "")), False
    elif name == "read_outline":
        return read_outline(book_id, args.get("volume")), False
    elif name == "load_skill":
        return load_skill(args.get("skill_name", "")), False
    elif name == "list_skills":
        return list_skills(), False
    elif name == "save_draft":
        return save_draft(book_id, args.get("file_path", ""), args.get("content", "")), False
    elif name == "save_outline":
        return save_outline(book_id, args.get("outline_json", "")), False
    elif name == "save_lore":
        return save_lore(book_id, args.get("category", ""), args.get("content_json", "")), False
    # Tree tools
    elif name == "read_tree":
        return read_tree(book_id, args.get("node_id")), False
    elif name == "add_plot_node":
        return add_plot_node(book_id, args.get("parent", ""), args.get("node_type", ""),
                             args.get("title", ""), args.get("description", ""),
                             args.get("characters", "")), False
    elif name == "confirm_path":
        return confirm_path(book_id, args.get("node_id", "")), False
    elif name == "prune_branch":
        return prune_branch(book_id, args.get("node_id", ""), args.get("reason", "")), False
    elif name == "merge_branches":
        return merge_branches(book_id, args.get("branch_ids", ""), args.get("convergence_title", "")), False
    elif name == "browse_examples":
        return browse_examples(book_id, args.get("category", ""), args.get("keyword", "")), False
    # Terminal tools
    elif name == "submit_for_review":
        result = submit_for_review(book_id, task_id, args.get("draft_text", ""))
        return result, True
    elif name == "present_options":
        result = present_options(book_id, args.get("description", ""), args.get("options", ""))
        return result, True
    elif name == "request_guidance":
        result = request_guidance(book_id, args.get("question", ""), args.get("context", ""))
        return result, True
    else:
        return f"Error: Unknown tool {name}", False


async def execute_drafting(task: TaskRecord) -> TaskRecord:
    """Execute the drafting phase. Author uses tools autonomously.
    No tool call limit — runs until a terminal tool is called.
    """
    llm = get_llm_client()
    system_prompt = AGENT_SYSTEM_PROMPTS["author"]

    scene_id = task.payload.get("scene_id", "Unknown Scene")
    user_prompt = (
        f"Task: Write the draft for scene '{scene_id}'.\n"
        f"Task ID: {task.id}\n"
        f"建议: 先 load_skill('iceberg_writing')，再 read_outline()，再 search_lore() 查相关设定。\n"
        f"完成后调用 submit_for_review(task_id='{task.id}', draft_text=...) 提交。"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    agent_submitted = False

    while True:
        try:
            if hasattr(llm, "client"):
                params = {
                    "model": llm.model_name,
                    "messages": messages,
                    "temperature": 0.7,
                    "tools": AUTHOR_TOOLS,
                    "tool_choice": "auto"
                }
                response = await llm.client.chat.completions.create(**params)
                message = response.choices[0].message

                # Append assistant message
                if hasattr(message, "model_dump"):
                    msg_dict = message.model_dump(exclude_none=True)
                else:
                    msg_dict = {"role": "assistant", "content": message.content}
                    if getattr(message, "tool_calls", None):
                        msg_dict["tool_calls"] = [
                            {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                            for tc in message.tool_calls
                        ]
                messages.append(msg_dict)

                if getattr(message, "tool_calls", None):
                    for tool_call in message.tool_calls:
                        args = json.loads(tool_call.function.arguments)
                        result, is_terminal = _dispatch_tool(
                            tool_call.function.name, task.book_id, task.id, args
                        )
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": tool_call.function.name,
                            "content": str(result)
                        })
                        if is_terminal:
                            agent_submitted = True

                    if agent_submitted:
                        break  # Agent has submitted — exit loop
                    continue  # More tools to call
                else:
                    # Agent responded with text but didn't submit — fallback
                    final_text = message.content or ""
                    if final_text:
                        return update_task_status(
                            task.book_id, task.id,
                            TaskStatus.EDITORIAL_REVIEW,
                            payload_updates={"draft_text": final_text}
                        )
                    break
            else:
                final_text = await llm.generate_with_fallback(system_prompt, user_prompt)
                return update_task_status(
                    task.book_id, task.id,
                    TaskStatus.EDITORIAL_REVIEW,
                    payload_updates={"draft_text": final_text}
                )
        except Exception as e:
            logger.error(f"Author drafting failed: {e}")
            return update_task_status(
                task.book_id, task.id,
                TaskStatus.ERROR,
                metadata_updates={"error": f"Drafting failed: {e}"}
            )

    if agent_submitted:
        # Agent already called submit_for_review — task state is updated
        from src.core.task_manager import get_task
        return get_task(task.book_id, task.id)

    # Fallback — agent stopped without submitting
    return update_task_status(
        task.book_id, task.id,
        TaskStatus.ERROR,
        metadata_updates={"error": "Agent stopped without calling a terminal tool."}
    )

async def execute_editorial_review(task: TaskRecord) -> TaskRecord:
    """Execute Editor review of the draft."""
    llm = get_llm_client()
    system_prompt = AGENT_SYSTEM_PROMPTS["editor"]
    draft = task.payload.get("draft_text", "")

    user_prompt = (
        f"Review the following draft. Return ONLY a JSON object with 'decision' (either 'pass' or 'reject') "
        f"and 'critique' (your feedback if rejecting).\n\nDraft:\n{draft}"
    )

    try:
        response = await llm.generate_with_fallback(system_prompt, user_prompt, response_format={"type": "json_object"})
        if isinstance(response, str):
            res_data = json.loads(response)
        else:
            res_data = response

        decision = res_data.get("decision", "pass").lower()
        critique = res_data.get("critique", "")

        if decision == "pass":
            return update_task_status(task.book_id, task.id, TaskStatus.HUMAN_APPROVAL_PENDING)
        else:
            retry_count = task.metadata.get("retry_count", 0) + 1
            if retry_count > 3:
                return update_task_status(task.book_id, task.id, TaskStatus.ERROR, metadata_updates={"error": "Max retries exceeded."})

            fb = task.payload.get("editor_feedback", "")
            new_fb = f"{fb}\n[Review {retry_count}]: {critique}"

            return update_task_status(
                task.book_id, task.id,
                TaskStatus.DRAFTING,
                payload_updates={"editor_feedback": new_fb.strip()},
                metadata_updates={"retry_count": retry_count}
            )

    except Exception as e:
        logger.error(f"Editorial review failed: {e}")
        return update_task_status(task.book_id, task.id, TaskStatus.ERROR, metadata_updates={"error": str(e)})
