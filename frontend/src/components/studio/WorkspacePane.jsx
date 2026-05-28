import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'
import { WORKSPACE_MIN_WIDTH } from './workspaceLayout'

export function WorkspacePane({
  collapsed,
  width,
  maxWidth,
  activeTab,
  onToggle,
  onResizeStart,
  onKeyDown,
  children,
}) {
  return (
    <>
      <div
        className="workspace-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace"
        aria-valuemin={WORKSPACE_MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        tabIndex={collapsed ? -1 : 0}
        onPointerDown={onResizeStart}
        onKeyDown={onKeyDown}
        hidden={collapsed}
      >
        <GripVertical size={14} />
      </div>
      <aside
        className={`workspace-pane ${collapsed ? 'collapsed' : ''}`}
        style={{ width: collapsed ? 0 : width }}
        data-active-tab={activeTab}
      >
        <button className="workspace-collapse" type="button" onClick={onToggle} title={collapsed ? '展开作品空间' : '收起作品空间'}>
          {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
        {!collapsed && children}
      </aside>
    </>
  )
}
