import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  cleanNovelText,
  decodeHtmlNumericEntities,
  splitNovelChapters,
  writePersonalStudyChapters,
} from './novel-cleaner-core.mjs'

test('decodes HTML numeric entities and removes ad fragments without losing prose', () => {
  const raw = [
    '第一章七十二变',
    '　　，精彩小说无弹窗免费阅读！',
    '　　李老头死了。&#40;&#29378;&#95;&#20154;&#95;&#23567;&#95;&#35828;&#95;&#32593;&#45;&#119;&#119;&#119;&#46;&#120;&#105;&#97;&#111;&#115;&#104;&#117;&#111;&#46;&#107;&#114;&#41;',
    '　　月光照在书页上。手机端阅读：m.xiaoshuo.kr更多更好资源。。。。',
    '更多电子书请访问爱下电子书,简体:https://ixdzs8.com;繁体:https://ixdzs8.tw',
  ].join('\n')

  assert.equal(decodeHtmlNumericEntities('&#40;&#29378;&#41;'), '(狂)')
  const cleaned = cleanNovelText(raw)
  assert.match(cleaned, /第一章七十二变/)
  assert.match(cleaned, /李老头死了。/)
  assert.match(cleaned, /月光照在书页上。/)
  assert.doesNotMatch(cleaned, /精彩小说|xiaoshuo|狂_人|小说网|爱下电子书|ixdzs/)
})

test('splits cleaned text into chapter markdown files with personal-study metadata', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-cleaner-'))
  try {
    const cleaned = cleanNovelText([
      '------章节内容开始-------',
      '第一章七十二变',
      '李老头死了。',
      '第二章人头面',
      '月光恍若为线条勾勒的恶鬼注入了血肉。',
    ].join('\n'))
    const chapters = splitNovelChapters(cleaned)
    assert.equal(chapters.length, 2)
    assert.equal(chapters[0].title, '第一章七十二变')

    const result = writePersonalStudyChapters({
      text: cleaned,
      outputDir: tmpDir,
      workId: 'seventy-two-transformations',
      workTitle: '地煞七十二变',
      author: '祭酒',
      category: 'xianxia',
      tags: ['immortal_mood', 'zhiguai'],
      sourcePath: '/tmp/source.txt',
    })

    assert.equal(result.chapterCount, 2)
    const first = fs.readFileSync(result.files[0], 'utf8')
    assert.match(first, /license: personal_study/)
    assert.match(first, /work_title: 地煞七十二变/)
    assert.match(first, /李老头死了。/)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
