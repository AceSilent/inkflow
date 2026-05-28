import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'

export function WorkspacePane({
  collapsed,
  width,
  activeTab,
  onToggle,
  onResizeStart,
  onTabChange,
  children,
}) {
  return (
    <>
      <div
        className="workspace-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace"
        onPointerDown={onResizeStart}
        hidden={collapsed}
      >
        <GripVertical size={14} />
      </div>
      <aside
        className={`workspace-pane ${collapsed ? 'collapsed' : ''}`}
        style={{ width: collapsed ? 0 : width }}
        data-active-tab={activeTab}
        data-has-tab-handler={Boolean(onTabChange)}
      >
        <button className="workspace-collapse" type="button" onClick={onToggle} title={collapsed ? '展开作品空间' : '收起作品空间'}>
          {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
        {!collapsed && children}
      </aside>
    </>
  )
}
