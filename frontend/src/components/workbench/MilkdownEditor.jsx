// Milkdown wrapper (Task 11) — thin adapter over @milkdown/react v7.20 for the
// chapter workbench. The parent controls initial markdown via `initial`; every
// keystroke flows back through `onChange(markdown)`. Read-only behaviour is
// delegated to the workbench shell (pointer-events CSS while Agent is writing).
import { useEffect, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'

function EditorView({ initial, onChange }) {
  // `initial` is captured once at mount (parent remounts via key={chapterId}),
  // and we latch the latest `onChange` into a ref so the listener closure
  // always calls the current handler without re-running the editor factory.
  const initialAtMountRef = useRef(initial)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initialAtMountRef.current ?? '')
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          onChangeRef.current?.(markdown)
        })
      })
      .use(commonmark)
      .use(history)
      .use(listener),
  )

  return <Milkdown />
}

export function MilkdownEditor({ initial, readOnly, onChange }) {
  return (
    <MilkdownProvider>
      <div
        className="milkdown-host"
        aria-readonly={readOnly || undefined}
        style={readOnly ? { pointerEvents: 'none', opacity: 0.85 } : undefined}
      >
        <EditorView initial={initial} onChange={onChange} />
      </div>
    </MilkdownProvider>
  )
}
