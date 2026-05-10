/**
 * Tool Registry — registers all Author Agent tools.
 * Central entry point for tool creation.
 */
import { ToolRegistry } from './base-tool.js'
import { readFileTool } from './read-file.js'
import { searchLoreTool } from './search-lore.js'
import { saveDraftTool, saveOutlineTool, saveLoreTool, readOutlineTool } from './write-tools.js'
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
import { analyzeStyleProfileTool, browseExamplesTool } from './examples.js'
import { submitToEditorialTool } from '../editorial/editorial.js'

export function createAllTools(): ToolRegistry {
  const registry = new ToolRegistry()

  // Read tools
  registry.register(readFileTool)
  registry.register(searchLoreTool)
  registry.register(readOutlineTool)

  // Write tools
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
  registry.register(analyzeStyleProfileTool)

  // Editorial tools
  registry.register(submitToEditorialTool)

  return registry
}
