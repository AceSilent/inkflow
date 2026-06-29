/**
 * Tool Registry — registers all Author Agent tools.
 * Central entry point for tool creation.
 */
import { ToolRegistry } from './base-tool.js'
import { readFileTool } from './read-file.js'
import { searchLoreTool } from './search-lore.js'
import {
  saveDraftTool,
  saveOutlineTool,
  saveLoreTool,
  saveScriptTool,
  readOutlineTool,
  readGameOutlineTool,
  saveGameOutlineTool,
} from './write-tools.js'
import { scriptValidateTool } from './script-validate.js'
import {
  readGraphTool,
  addPlotNodeTool,
  addEdgeTool,
  removeEdgeTool,
  queryUnresolvedSetupsTool,
  confirmPathTool,
  pruneBranchTool,
  mergeBranchesTool,
} from './plot-graph.js'
import { submitForReviewTool, presentOptionsTool, requestGuidanceTool } from './terminal.js'
import { loadSkillTool, listSkillsTool } from './skills.js'
import { analyzeStyleProfileTool, browseExamplesTool, readExemplarChapterTool } from './examples.js'
import { submitToEditorialTool } from '../editorial/editorial.js'
import { createBookTool } from './create-book.js'
import { updateBookTool } from './update-book.js'

export interface CreateAllToolsOptions {
  includeCreateBook?: boolean
}

export function createAllTools(options: CreateAllToolsOptions = {}): ToolRegistry {
  const registry = new ToolRegistry()
  const includeCreateBook = options.includeCreateBook ?? true

  // Read tools
  registry.register(readFileTool)
  registry.register(searchLoreTool)
  registry.register(readOutlineTool)
  registry.register(readGameOutlineTool)
  registry.register(scriptValidateTool)

  // Write tools
  if (includeCreateBook) registry.register(createBookTool)
  registry.register(updateBookTool)
  registry.register(saveGameOutlineTool)
  registry.register(saveScriptTool)
  registry.register(saveDraftTool)
  registry.register(saveOutlineTool)
  registry.register(saveLoreTool)

  // Plot graph tools
  registry.register(readGraphTool)
  registry.register(addPlotNodeTool)
  registry.register(addEdgeTool)
  registry.register(removeEdgeTool)
  registry.register(queryUnresolvedSetupsTool)
  registry.register(confirmPathTool)
  registry.register(pruneBranchTool)
  registry.register(mergeBranchesTool)

  // Terminal tools
  registry.register(submitForReviewTool)
  registry.register(presentOptionsTool)
  registry.register(requestGuidanceTool)

  // Skill tools
  registry.register(loadSkillTool)
  registry.register(listSkillsTool)
  registry.register(browseExamplesTool)
  registry.register(readExemplarChapterTool)
  registry.register(analyzeStyleProfileTool)

  // Editorial tools
  registry.register(submitToEditorialTool)

  return registry
}
