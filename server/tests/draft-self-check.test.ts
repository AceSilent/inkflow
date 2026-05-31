import { describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { stringify as yamlStringify } from 'yaml'
import { runDraftSelfCheck } from '../src/tools/draft-self-check.js'
import { createAllTools } from '../src/tools/index.js'

describe('draft self-check', () => {
  it('flags opening camera chains as editorial-blocking', () => {
    const opening = [
      '陆辞醒来的时候，半边脸贴在潮湿的泥地上。',
      '他撑起身体，低头看了眼手机，又抬头看向四周。',
      '他停下脚步，环顾一圈，盯着远处的木屋看了很久。',
      '他深吸一口气，意识到事情不太对劲。',
    ].join('\n')
    const result = runDraftSelfCheck(opening + '\n' + '正文推进。'.repeat(900), { minReviewChars: 2500 })
    expect(result.blockEditorial).toBe(true)
    expect(result.issues.some(issue => issue.type === 'Opening_Camera_Chain')).toBe(true)
  })

  it('flags explanatory afterthoughts without requiring LLM review', () => {
    const draft = [
      '他翻到短信界面，收件箱里多了一条离线缓存。',
      '不是实时接收的，像是穿越瞬间信号短暂跳动时强制写入的本地文件。',
      '也就是说，这个手机还能保留一部分异常通信能力。',
      '正文推进。'.repeat(900),
    ].join('\n')
    const result = runDraftSelfCheck(draft, { minReviewChars: 2500 })
    expect(result.issues.some(issue => issue.type === 'Explanatory_Afterthought')).toBe(true)
  })

  it('flags dense short-paragraph camera blocking from the E2E failure case', () => {
    const opening = [
      '手机彻底没信号，指南针在屏幕中央乱转。',
      '林星撑着地板坐起来，剧烈喘息了两口。冷汗浸透了后背的冲锋衣，贴着皮肤发凉。',
      '他低头快速扫了一遍。没骨折，没大出血，只是摔下来的钝伤还在神经上跳。',
      '他闭眼缓了五秒，把喉咙里的土腥味咽下去。再睁眼时，视线已经能聚焦。',
      '不是他租的公寓。也不是市郊那条铺了柏油的登山道。',
      '霉味和干草的腥气混在一起，直往鼻腔里钻。头顶的木板漏了个洞，阳光斜切进来，照出空气里浮动的灰尘。',
      '林星低头检查装备。背包带子还勒在肩上，鞋底沾着暗绿色的苔藓。',
      '他撑着膝盖站起来，腿肚子还在抖。拍了拍裤子上的灰，环顾四周。',
      '屋子不大。前厅空荡荡的，几张歪倒的木椅，一个裂了缝的柜台。',
      '培育屋。',
      '林星吸了口冷气。霉味说明通风极差，这种老木结构一旦受潮，墙板缝隙里绝对藏着毒虫和霉菌孢子。他得在天黑前确认这地方的结构安全，顺便找点干净的水。',
    ].join('\n\n')
    const result = runDraftSelfCheck(opening + '\n' + '正文推进。'.repeat(900), { minReviewChars: 2500 })
    expect(result.blockEditorial).toBe(true)
    expect(result.issues.some(issue => issue.type === 'Opening_Camera_Blocking_Density')).toBe(true)
    expect(result.issues.some(issue => issue.type === 'Analytical_Exposition')).toBe(true)
  })

  it('runDraftSelfCheck returns self-check issues for camera chain violations', () => {
    const content = [
      '陆辞醒来的时候，半边脸贴在潮湿的泥地上。',
      '他撑起身体，低头看手机，抬头看树，环顾四周，又盯着木屋。',
      '他停下脚步，深吸一口气，意识到事情不对。',
      '正文推进。'.repeat(900),
    ].join('\n')
    const result = runDraftSelfCheck(content, { minReviewChars: 2500 })
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.blockEditorial).toBe(true)
  })

  it('submit_to_editorial blocks severe self-check failures before slow review', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-self-check-review-'))
    try {
      const scriptsDir = path.join(tmpDir, 'book1', '03_Scripts')
      fs.mkdirSync(scriptsDir, { recursive: true })
      const content = [
        '陆辞醒来的时候，半边脸贴在潮湿的泥地上。',
        '他撑起身体，低头看手机，抬头看树，环顾四周，又盯着木屋。',
        '他停下脚步，深吸一口气，意识到事情不对。',
        '正文推进。'.repeat(900),
      ].join('\n')
      const lines = content.split('\n').map((text, i) => ({ id: `L${i}`, speaker: '旁白', text, type: 'narration' }))
      const pkg = { stages: [{ id: 'ch01', lines }] }
      fs.writeFileSync(path.join(scriptsDir, 'pkg1.yaml'), yamlStringify(pkg), 'utf-8')
      const registry = createAllTools()
      const result = await registry.execute('submit_to_editorial', {
        draft_text: content,
        chapter_id: 'ch01',
      }, { bookId: 'book1', dataDir: tmpDir })
      expect(result).toContain('本地快速自检')
      expect(result).toContain('Opening_Camera_Chain')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
