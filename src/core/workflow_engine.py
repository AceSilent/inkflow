import json
import logging
from typing import Dict, Any, List
from src.core.models import TaskRecord, TaskStatus
from src.core.task_manager import update_task_status
from src.core.llm_factory import get_llm_client
from src.core.agent_tools import AUTHOR_TOOLS, read_file, search_lore, read_outline
from src.core.groupchat_orchestrator import AGENT_SYSTEM_PROMPTS

logger = logging.getLogger(__name__)

async def execute_drafting(task: TaskRecord) -> TaskRecord:
    """Execute the drafting phase. Author uses tools to write."""
    llm = get_llm_client()
    system_prompt = AGENT_SYSTEM_PROMPTS["author"]
    
    # Base user prompt tells Author what to write
    scene_id = task.payload.get("scene_id", "Unknown Scene")
    user_prompt = f"Task: Write the draft for scene '{scene_id}'. Use tools to gather context first."
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    max_tool_loops = 5
    loops = 0
    final_text = ""
    
    while loops < max_tool_loops:
        loops += 1
        try:
            # We call the raw client to support tools
            # If using OpenAILLMClient, we can pass tools via extra kwargs
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
                        msg_dict["tool_calls"] = [{"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}} for tc in message.tool_calls]
                messages.append(msg_dict)
                
                if getattr(message, "tool_calls", None):
                    # Execute tools
                    for tool_call in message.tool_calls:
                        args = json.loads(tool_call.function.arguments)
                        name = tool_call.function.name
                        
                        tool_result = ""
                        if name == "read_file":
                            tool_result = read_file(task.book_id, args.get("relative_path", ""))
                        elif name == "search_lore":
                            tool_result = search_lore(task.book_id, args.get("query", ""))
                        elif name == "read_outline":
                            tool_result = read_outline(task.book_id, args.get("volume"))
                        else:
                            tool_result = f"Error: Unknown tool {name}"
                            
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": name,
                            "content": str(tool_result)
                        })
                    continue # Loop back to LLM with tool results
                else:
                    final_text = message.content
                    break
            else:
                # Fallback if unsupported client
                final_text = await llm.generate_with_fallback(system_prompt, user_prompt)
                break
        except Exception as e:
            logger.error(f"Author drafting failed: {e}")
            final_text = f"Drafting failed: {e}"
            break
            
    if not final_text:
        final_text = "Task failed to produce text."
        
    return update_task_status(
        task.book_id, 
        task.id, 
        TaskStatus.EDITORIAL_REVIEW, 
        payload_updates={"draft_text": final_text}
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
        # Parse output
        if isinstance(response, str):
            res_data = json.loads(response)
        else:
            res_data = response # if pydantic returned
            
        decision = res_data.get("decision", "pass").lower()
        critique = res_data.get("critique", "")
        
        if decision == "pass":
            return update_task_status(task.book_id, task.id, TaskStatus.HUMAN_APPROVAL_PENDING)
        else:
            retry_count = task.metadata.get("retry_count", 0) + 1
            if retry_count > 3:
                return update_task_status(task.book_id, task.id, TaskStatus.ERROR, metadata_updates={"error": "Max retries exceeded."})
            
            # Reject back to author
            fb = task.payload.get("editor_feedback", "")
            new_fb = f"{fb}\n[Review {retry_count}]: {critique}"
            
            return update_task_status(
                task.book_id, 
                task.id, 
                TaskStatus.DRAFTING, 
                payload_updates={"editor_feedback": new_fb.strip()},
                metadata_updates={"retry_count": retry_count}
            )
            
    except Exception as e:
        logger.error(f"Editorial review failed: {e}")
        return update_task_status(task.book_id, task.id, TaskStatus.ERROR, metadata_updates={"error": str(e)})
