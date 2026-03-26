import asyncio
import os
import sys
import json
from pathlib import Path

# Add project root to python path to resolve src imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt, Confirm
from rich.markdown import Markdown
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from src.core.showrunner_workflow import ShowrunnerWorkflow
from src.core.openai_client import OpenAILLMClient
from src.core.models import CharacterCognitionState

console = Console()

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def print_header():
    clear_screen()
    console.print(Panel.fit(
        "[bold cyan]AutoNovel-Studio v3.1[/bold cyan]\n"
        "[dim]The Showrunner AI Creative Engine[/dim]",
        border_style="cyan"
    ))

async def main():
    print_header()
    
    # 1. Initialize System
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        api_key = Prompt.ask("[yellow]Enter your OpenAI API Key (or set OPENAI_API_KEY environment variable)[/yellow]", password=True)
        if not api_key:
            console.print("[red]API Key is required to run the Showrunner Engine. Exiting.[/red]")
            return

    console.print("\n[dim]Initializing LLM Client and Showrunner Workflow...[/dim]")
    llm_client = OpenAILLMClient(api_key=api_key)
    
    book_id = Prompt.ask("\n[bold]Enter Book ID (e.g., 'my_novel')[/bold]", default="my_novel")
    workflow = ShowrunnerWorkflow(llm_client=llm_client, book_id=book_id)
    
    # Init workflow state
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        transient=True,
    ) as progress:
        progress.add_task(description="Loading Global Settings and Character States...", total=None)
        await workflow.initialize()
        
    console.print("[green]✔ System initialized.[/green]")
    
    # Show current characters
    if workflow.character_states.characters:
        table = Table(title="Current Character States (Information Gap Engine)")
        table.add_column("Character", style="cyan")
        table.add_column("Status", style="magenta")
        table.add_column("Known Facts", style="green")
        table.add_column("False Beliefs (Gaps)", style="red")
        
        for char_id, char in workflow.character_states.characters.items():
            facts_str = "\n".join([f"• {f}" for f in char.known_facts]) if char.known_facts else "None"
            beliefs_str = "\n".join([f"• {b}" for f in char.false_beliefs]) if char.false_beliefs else "None"
            table.add_row(char.name, char.status, facts_str, beliefs_str)
        console.print(table)
        
    # 2. Main Generation Loop
    while True:
        console.print("\n" + "="*50)
        console.print("[bold cyan]STAGE 1: Brainstorming (Inspiration)[/bold cyan]")
        
        inspiration = Prompt.ask("\n[bold yellow]Enter your 1-sentence prompt for the next scene[/bold yellow]")
        if not inspiration.strip() or inspiration.lower() == 'exit':
            break
            
        # Add mock contexts for the demo
        book_context = {"genre": "Fantasy", "style": "White Sketching", "tone": "Dark"}
        world_lore = {"setting": "Ancient Cultivation World"}

        # Brainstorm
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), transient=True) as progress:
            progress.add_task(description="Proposer & Devil's Advocate generating 3 distinct plots...", total=None)
            result = await workflow.brainstorm(inspiration, book_context, world_lore)
            
        console.print("\n[bold cyan]STAGE 2: Decision Matrix (Showrunner Selection)[/bold cyan]\n")
        
        for opt in result.options:
            panel = Panel(
                f"[bold]Core Concept:[/bold] {opt.core_concept}\n\n"
                f"[bold]Surface Plot:[/bold]\n{opt.surface_plot}\n\n"
                f"[bold red]🔥 Devil's Twist:[/bold red]\n{opt.devil_twist}\n\n"
                f"[bold magenta]🎭 Dramatic Irony:[/bold magenta]\n{opt.dramatic_irony}",
                title=f"Option [bold yellow]{opt.option_id}[/bold yellow]",
                border_style="yellow"
            )
            console.print(panel)
            
        selected_id = Prompt.ask("\n[bold]Choose an option to proceed[/bold]", choices=["A", "B", "C"])
        human_notes = Prompt.ask("[dim]Any manual tweaks/notes for the AI? (Leave blank for none)[/dim]")
        
        await workflow.select_option(selected_id, human_notes)
        
        # Outline & Draft
        console.print("\n" + "="*50)
        console.print("[bold cyan]STAGE 3: Iceberg Engine Rendering[/bold cyan]")
        
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), transient=True) as progress:
            progress.add_task(description="Expanding logic chain and outlining...", total=None)
            outline = await workflow.generate_outline(book_context, world_lore, recent_summaries="")
            
            progress.add_task(description="Iceberg Engine generating Internal Subtext & Final Prose...", total=None)
            final_prose, internal_script = await workflow.draft_scene(book_context, world_lore, recent_summaries="")
            
        console.print(Panel(internal_script, title="[dim]Internal Script (Subtext Array)[/dim]", border_style="black"))
        console.print(Panel(Markdown(final_prose), title="[bold green]Final Prose Output[/bold green]", border_style="green"))
        
        # State Update
        console.print("\n" + "="*50)
        console.print("[bold cyan]STAGE 4: State Mutations (Facts & Tension)[/bold cyan]")
        
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), transient=True) as progress:
            progress.add_task(description="StateUpdater extracting character fact learnings...", total=None)
            updates = await workflow.update_states(scene_text=final_prose, involved_char_ids=["char_001"]) # Mock ID extraction
            
        state_deltas = updates.get("state_deltas", {})
        emotion = updates.get("emotion_analysis", {})
        
        console.print(f"\n[bold magenta]Emotional Score:[/bold magenta] {emotion.get('score')}/100 ([dim]{emotion.get('dominant_emotion')}[/dim])")
        
        if state_deltas:
            for char_id, delta in state_deltas.items():
                char = workflow.character_states.get_character(char_id)
                char_name = char.name if char else char_id
                
                delta_text = []
                if delta.facts_learned:
                    delta_text.append("[green]Facts Learned:[/green]\n" + "\n".join([f"  + {f}" for f in delta.facts_learned]))
                if delta.beliefs_corrected:
                    delta_text.append("[yellow]Beliefs Corrected:[/yellow]\n" + "\n".join([f"  ~ {b['old']} -> {b['truth']}" for b in delta.beliefs_corrected]))
                if delta.new_false_beliefs:
                    delta_text.append("[red]New Misconceptions:[/red]\n" + "\n".join([f"  - {b}" for b in delta.new_false_beliefs]))
                    
                if delta_text:
                    console.print(Panel("\n".join(delta_text), title=f"Cognitive Updates for {char_name}"))
        else:
            console.print("[dim]No cognitive changes detected in this scene.[/dim]")

        # Commit
        commit_path = await workflow.commit_scene()
        console.print(f"\n[bold green]✔ Draft saved to:[/bold green] {commit_path}")
        
        if not Confirm.ask("\n[bold]Continue to next scene?[/bold]"):
            break
            
    console.print("\n[bold cyan]Showrunner session ended. Goodbye![/bold cyan]")

if __name__ == "__main__":
    asyncio.run(main())
