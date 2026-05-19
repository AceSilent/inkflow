/**
 * Export Tools — Pure functions for serialising a StoryPackage into
 * YAML, JSON, CSV, and self-contained HTML formats.
 */
import { stringify as yamlStringify } from 'yaml'
import type { StoryPackage } from '../schemas/index.js'

export function exportYaml(pkg: StoryPackage): string {
  return yamlStringify(pkg, { lineWidth: 120 })
}

export function exportJson(pkg: StoryPackage): string {
  return JSON.stringify(pkg, null, 2)
}

export function exportCsv(pkg: StoryPackage): string {
  const header = 'text_id,stage_id,speaker,text,type,emotion,voice_tone'
  const rows: string[] = [header]
  for (const stage of pkg.stages) {
    for (const line of stage.lines) {
      const cols = [
        line.id,
        stage.id,
        line.speaker ?? '',
        `"${(line.text ?? '').replace(/"/g, '""')}"`,
        line.type ?? '',
        line.emotion ?? '',
        line.voice?.tone ?? '',
      ]
      rows.push(cols.join(','))
    }
  }
  return rows.join('\n')
}

export function exportHtml(pkg: StoryPackage): string {
  const stageHtml = pkg.stages.map(stage => {
    const linesHtml = stage.lines.map(line => {
      if (line.speaker) {
        return `<div class="line dialogue"><span class="speaker">${line.speaker}</span>${line.emotion ? `<span class="emotion">[${line.emotion}]</span>` : ''}「${line.text}」</div>`
      }
      return `<div class="line ${line.type ?? 'narration'}">${line.text}</div>`
    }).join('\n')
    const choicesHtml = (stage.choices ?? []).map(c =>
      `<button onclick="showStage('${c.next_stage}')">${c.label}</button>`
    ).join('')
    const advanceBtn = stage.advance_next
      ? `<button onclick="showStage('${stage.advance_next}')">继续</button>`
      : ''
    return `<div class="stage" id="stage-${stage.id}" style="display:none">\n<h3>${stage.id}</h3>\n${linesHtml}\n<div class="choices">${choicesHtml}</div>\n${advanceBtn}\n</div>`
  }).join('\n')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${pkg.name}</title>
<style>body{max-width:600px;margin:auto;font-family:serif;padding:2em}.speaker{font-weight:bold;margin-right:.5em}.emotion{color:#888;font-size:.9em;margin-left:.3em}.line{margin:.8em 0}.narration{color:#555;font-style:italic}.action{color:#999}.choices{margin-top:1em}button{display:block;margin:.3em 0;padding:.5em 1em;cursor:pointer}</style></head>
<body><h1>${pkg.name}</h1>\n${stageHtml}\n<script>function showStage(id){document.querySelectorAll('.stage').forEach(e=>e.style.display='none');document.getElementById('stage-'+id).style.display='block'}showStage('${pkg.stages[0]?.id}')</script></body></html>`
}
