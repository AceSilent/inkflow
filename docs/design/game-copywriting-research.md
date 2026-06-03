# Game Copywriting Tool Research

Date: 2026-05-31

This research distills features from established game narrative and script tools into InkFlow's game-copywriting direction. The goal is not to clone any one product, but to borrow durable workflow ideas that fit InkFlow's Agent-first model.

## Sources Reviewed

- Arcweave: visual game and narrative design, collaborative diagrams, variables, components, exports, and localization-oriented workflows. <https://arcweave.com/features>
- articy:draft: narrative design database, flow/branching structure, simulation, import/export, localization, Unity/Unreal integration, and consistency checks. <https://www.articy.com/en/articydraft/>
- Yarn Spinner: dialogue scripting for games, variables, commands, line IDs, localization, and Unity-focused integration. <https://docs.yarnspinner.dev/>
- ink / Inky: plain-text interactive narrative language with knots, choices, diverts, variables, and flow-oriented writing. <https://github.com/inkle/ink>
- Twine: passage-based interactive fiction and branching story authoring with links, variables, and story formats. <https://twinery.org/>
- Chat Mapper: branching dialogue, conversation simulation, localization, voice/script handoff, and engine exports. <https://www.chatmapper.com/>
- Celtx Gem: game and immersive narrative planning, scenes, characters, dialogue, and collaborative production workflow. <https://www.celtx.com/gem>

## Strong Patterns To Absorb

### 1. Narrative Is A Graph, Not A Document

Arcweave, articy:draft, Twine, Chat Mapper, ink, and Yarn all treat branching narrative as connected nodes or flow units. InkFlow should keep chat as the thinking surface, but the saved artifact should become a navigable graph of story packages, stages, choices, conditions, and effects.

InkFlow absorption:
- Keep `save_script` as the canonical structured write path for game-copywriting mode.
- Use `StoryPackage -> Stage -> Line/Choice` as the storage spine.
- Later add a visual stage workbench reading from `03_Scripts/*.json`, rather than making chat bubbles carry all structure.

### 2. Stable Line Identity Is Essential

Yarn-style line IDs and localization workflows show that game text must survive edits, localization, voiceover, and QA. A line is not just text; it has identity, status, metadata, and possibly audio direction.

InkFlow absorption:
- Every saved line keeps `id` and `loc_key`.
- Add `loc_state`, `voice`, `direction`, `notes`, and `tags`.
- The Agent must not casually rename old line IDs during revisions.

### 3. Branches Need Conditions, Effects, And Validation

Narrative scripting tools make branches executable by storing variables, flags, commands, conditions, and effects. The useful bit for InkFlow is not becoming an engine, but catching broken branches and preserving intent for export.

InkFlow absorption:
- Choices and stages support `conditions` and `effects`.
- `validate_script` checks missing targets, unreachable stages, duplicate line IDs, overlong choice labels, and no-terminal flows.
- Future workbench should show warnings inline near the affected stage/choice.

### 4. Tooling Should Support Human Review

Chat Mapper and production-oriented tools care about notes, status, handoff, and iteration, not just generation. InkFlow should let the Agent draft fast, then keep human review state explicit.

InkFlow absorption:
- Stage and line schemas include review/localization status and notes.
- Future UI should filter by draft/review/approved and show unresolved notes.
- Agent should write notes only when they help a human editor or future self understand a decision.

### 5. Export Should Be A First-Class Destination

Most serious tools offer engine exports or handoff formats. InkFlow should remain local and simple first, but the data model should already be export-friendly.

InkFlow absorption:
- Story packages include `engine`, `export_targets`, `source_locale`, `locales`, `variables`, and `assets`.
- Initial export can be JSON/CSV/Markdown; engine-specific adapters can come later.

## Recommended InkFlow Direction

The best-fit direction is a hybrid of:
- articy:draft / Arcweave for visual structure and world database thinking
- Yarn / ink for scriptable line identity and flow validation
- Chat Mapper for review, localization, and voice handoff

Avoid copying:
- Heavy all-in-one production suites
- Engine-specific authoring too early
- Large visual canvases that make fast Agent iteration feel slow

The next useful UI step is a `Game Script Workbench`: a page opened from the `+` menu or book workspace, listing story packages, stage graph, line table, validation warnings, and export actions.
