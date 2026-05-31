/**
 * Feishu interactive card JSON builders.
 * Builds Card JSON structures for various UI elements.
 */

/** Simple text card */
export function buildTextCard(title: string, content: string): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: title },
    },
    elements: [
      { tag: 'markdown', content },
    ],
  }
}

/** Help card with all commands */
export function buildHelpCard(): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'indigo',
      title: { tag: 'plain_text', content: 'InkFlow 帮助' },
    },
    elements: [
      {
        tag: 'markdown',
        content: [
          '**项目管理**',
          '`/list` — 查看所有项目',
          '`/create <标题> [类型] [风格]` — 创建项目',
          '`/select <projectId>` — 选择当前项目',
          '`/current` — 查看当前项目信息',
          '',
          '**内容浏览**',
          '`/outline` — 查看大纲结构',
          '`/lore` — 查看设定（世界观/角色）',
          '`/chapters` — 查看段落列表',
          '`/review <stageId>` — 查看审稿结果',
          '',
          '**对话**',
          '`/clear` — 清空对话历史',
          '`/history` — 查看对话历史',
          '',
          '**自由输入 = 与编剧 Agent 对话**',
          '直接发消息即可与 AI 编剧对话，支持写剧本、修改大纲、提交审稿等。',
        ].join('\n'),
      },
    ],
  }
}

/** Book list with select buttons */
export function buildBookListCard(books: { book_id: string; title: string; genre?: string }[]): Record<string, unknown> {
  if (books.length === 0) {
    return buildTextCard('项目列表', '暂无项目。发送 `/create <标题>` 创建一个新项目。')
  }
  const rows = books.map(b =>
    `**${b.title}**${b.genre ? ` (${b.genre})` : ''}\nID: \`${b.book_id}\``
  )
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'turquoise',
      title: { tag: 'plain_text', content: `项目列表 (${books.length})` },
    },
    elements: [
      {
        tag: 'action',
        actions: books.slice(0, 5).map(b => ({
          tag: 'button',
          text: { tag: 'plain_text', content: b.title },
          type: 'primary',
          value: { action: 'select_book', bookId: b.book_id },
        })),
      },
      { tag: 'markdown', content: rows.join('\n\n') },
      {
        tag: 'note',
        elements: [{ tag: 'plain_text', content: '点击按钮选择项目，或发送 /select <projectId>' }],
      },
    ],
  }
}

/** Single book info card */
export function buildBookInfoCard(book: { title: string; genre?: string; tone?: string; target_words?: number; book_id: string }): Record<string, unknown> {
  return buildTextCard(
    `当前项目: ${book.title}`,
    [
      `**ID:** \`${book.book_id}\``,
      book.genre ? `**类型:** ${book.genre}` : '',
      book.tone ? `**风格:** ${book.tone}` : '',
      book.target_words ? `**目标字数:** ${book.target_words.toLocaleString()}` : '',
    ].filter(Boolean).join('\n'),
  )
}

/** Outline tree as markdown */
export function buildOutlineCard(outline: any): Record<string, unknown> {
  function walkNodes(nodes: any[], depth: number): string {
    if (!nodes || !Array.isArray(nodes)) return ''
    return nodes.map(n => {
      const indent = '  '.repeat(depth)
      const icon = n.type === 'volume' || n.type === 'story_package' ? '📁' : n.type === 'chapter' || n.type === 'stage' ? '📄' : '📋'
      let line = `${indent}${icon} ${n.label || n.id}`
      if (n.status) line += ` [${n.status}]`
      if (n.children?.length) line += '\n' + walkNodes(n.children, depth + 1)
      return line
    }).join('\n')
  }

  const content = outline?.label
    ? walkNodes([outline], 0)
    : '大纲为空。与编剧 Agent 对话来创建大纲。'
  return buildTextCard('大纲结构', content)
}

/** Lore summary card */
export function buildLoreCard(lore: any): Record<string, unknown> {
  const sections: string[] = []
  if (lore?.meta?.title) sections.push(`**项目:** ${lore.meta.title}`)
  if (lore?.meta?.genre) sections.push(`**类型:** ${lore.meta.genre}`)
  if (lore?.world_setting) {
    const ws = typeof lore.world_setting === 'string'
      ? lore.world_setting.slice(0, 300)
      : JSON.stringify(lore.world_setting, null, 2).slice(0, 300)
    sections.push(`\n**世界观:**\n${ws}`)
  }
  if (lore?.characters?.length) {
    const names = lore.characters.map((c: any) => c.name || c).join(', ')
    sections.push(`\n**角色:** ${names}`)
  }
  return buildTextCard('设定概览', sections.join('\n') || '暂无设定数据。')
}

/** Chapter list with status */
export function buildChapterListCard(chapters: { id: string; label: string; status?: string }[]): Record<string, unknown> {
  if (!chapters?.length) {
    return buildTextCard('段落列表', '暂无段落。')
  }
  const rows = chapters.map(c => {
    const icon = c.status === 'draft' ? '✅' : '📋'
    return `${icon} **${c.label}** \`${c.id}\`${c.status ? ` [${c.status}]` : ''}`
  })
  return buildTextCard(`段落列表 (${chapters.length})`, rows.join('\n'))
}

/** Review results card */
export function buildReviewCard(review: any): Record<string, unknown> {
  if (!review?.feedbacks?.length) {
    return buildTextCard('审稿结果', '暂无审稿数据。')
  }
  const rows = review.feedbacks.map((f: any) => {
    const icon = f.pass_status === false ? '❌' : f.pass_status === true ? '✅' : '⚠️'
    return `${icon} **${f.type}**\n${f.feedback?.slice(0, 200) || '无反馈'}`
  })
  return buildTextCard('审稿结果', rows.join('\n\n'))
}

/** Agent streaming card element */
export function buildAgentStreamingElements(content: string, toolsUsed: string[]): Record<string, unknown>[] {
  const elements: Record<string, unknown>[] = [
    {
      tag: 'markdown',
      content: content || '正在思考...',
    },
  ]
  if (toolsUsed.length > 0) {
    elements.push({
      tag: 'note',
      elements: [{ tag: 'plain_text', content: `工具调用: ${toolsUsed.join(', ')}` }],
    })
  }
  return elements
}
