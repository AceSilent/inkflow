# AutoNovel-Studio

AI-Powered Novel Generation System using a GAN-inspired architecture with multiple agents.

## Architecture Overview

The system uses a **multi-agent architecture** inspired by Generative Adversarial Networks (GANs):

- **Author Agent** (Generator): Creates novel content
- **Reader Agents** (Discriminators): Evaluate content from multiple perspectives
  - Lore Keeper: Checks factual consistency
  - Pacing Junkie: Evaluates emotional experience
  - Anti-Trope Scanner: Detects forbidden content and clichés
- **Editor Agent** (Loss Function): Arbitrates and provides revision instructions
- **Human Intervention**: Final quality control

## Technology Stack

- **State Management**: Pure Python + `transitions` library
- **Data Validation**: Pydantic for strict LLM output formatting
- **LLM Interface**: OpenAI SDK (compatible with multiple providers)
- **Prompt Management**: Jinja2 templates
- **Concurrency**: asyncio for parallel reader reviews
- **Retry Logic**: Tenacity for robustness

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd AutoNovel-Studio

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env and add your API keys
# OPENAI_API_KEY=your_key_here
```

## Quick Start

```bash
# Generate chapter 1 (default)
python main.py

# Generate specific chapter
python main.py 5
```

## Project Structure

```
AutoNovel-Studio/
├── 00_Config/
│   └── book_meta.json          # Novel metadata
├── 01_Global_Settings/
│   ├── world_lore.json         # World-building dictionary
│   └── characters.json         # Character profiles
├── 02_Outlines/
│   ├── volume_01.md            # Volume outline
│   └── chapter_01_outline.json # Chapter detailed outline
├── 03_Story_Memory/
│   ├── full_summaries.md       # Complete story summaries
│   └── recent_chapters/        # Sliding window memory
├── 04_Drafts/
│   └── ch01_v1.txt             # Generated drafts with versions
├── 05_Reviews/
│   └── ch01_v1_readers.json    # Reader feedback
├── prompts/                    # Jinja2 prompt templates
├── src/
│   ├── agents/                 # Agent implementations
│   ├── core/                   # Core models and LLM client
│   └── utils/                  # File and prompt utilities
└── main.py                     # Main entry point
```

## Configuration

### LLM Provider

The system supports OpenAI-compatible APIs. Configure in `.env`:

```bash
# For OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
AUTHOR_MODEL=gpt-4o-mini
EDITOR_MODEL=gpt-4o
READER_MODEL=gpt-4o-mini

# For DeepSeek
OPENAI_API_KEY=your_deepseek_key
OPENAI_BASE_URL=https://api.deepseek.com/v1
AUTHOR_MODEL=deepseek-chat
```

### Novel Metadata

Edit `00_Config/book_meta.json` to configure your novel:

```json
{
  "title": "Your Novel Title",
  "genre": "Fantasy",
  "sub_genres": ["Adventure", "Magic"],
  "tone": "dark",
  "forbidden_elements": [
    "Protagonist being too nice",
    "Forced plot armor"
  ]
}
```

### Chapter Outlines

Create chapter outlines in `02_Outlines/chapter_XX_outline.json`:

```json
{
  "chapter_number": 1,
  "title": "Chapter Title",
  "summary": "Brief summary",
  "scenes": [
    {
      "scene_number": 1,
      "title": "Scene Title",
      "pov_character": "Character Name",
      "setting": "Location",
      "plot_points": ["Event 1", "Event 2"],
      "word_count_target": 800
    }
  ]
}
```

## Development Workflow

### For Testing/Development

1. **Mock Mode**: Run without API keys to test state machine
2. **Single Scene**: Test one scene at a time
3. **Check Logs**: Review `logs/autonovel.log` for details

### For Production

1. Set up API keys in `.env`
2. Prepare chapter outlines
3. Configure character and world lore
4. Run `python main.py <chapter_number>`

## Features

### No-Overwrite Policy

All generated content is versioned:
- Drafts: `ch01_v1.txt`, `ch01_v2.txt`, etc.
- Automatic backups before modifications
- Full traceability of all changes

### Circuit Breaker

Automatic retry limit prevents infinite loops:
- Max 3 retries per scene
- Triggers human intervention on deadlock
- Checkpoint recovery supported

### Concurrent Reviews

Reader agents run in parallel using asyncio:
- Faster feedback generation
- Respects API rate limits
- Configurable concurrency

## Logging

Logs are stored in `logs/autonovel.log` with:
- Rotation at 10 MB
- 1-week retention
- DEBUG level for development

## License

MIT License - See LICENSE file for details

## Contributing

1. Read the system documentation in `系统开发文档.md`
2. Follow the architecture guidelines
3. Test thoroughly before submitting

## Acknowledgments

Architecture inspired by:
- GAN (Generative Adversarial Networks)
- LangChain (concepts only, not used)
- transitions library (state machine)
