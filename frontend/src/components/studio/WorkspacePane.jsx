import { GripVertical } from 'lucide-react'
import { WORKSPACE_MIN_WIDTH } from './workspaceLayout'
import { useI18n } from '../../hooks/useI18n'

export function WorkspacePane({
  collapsed,
  width,
  maxWidth,
  activeTab,
  onResizeStart,
  onKeyDown,
  children,
}) {
  const { t } = useI18n()
  return (
    <>
      <div
        className="workspace-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('workspace.resize')}
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
        {!collapsed && children}
      </aside>
    </>
  )
}
