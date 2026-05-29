export function primarySidebarActions() {
  return [
    { id: 'new-chat', label: '新对话', enabled: true },
    { id: 'search', label: '搜索', enabled: true, shortcut: '⌘G' },
  ]
}

export function bottomSidebarActions() {
  return [
    { id: 'settings', label: '设置', enabled: true },
    { id: 'mobile', label: '连接手机', enabled: false },
  ]
}
