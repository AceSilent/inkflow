const defaultT = key => key

export function primarySidebarActions(t = defaultT) {
  return [
    { id: 'new-chat', label: t('sidebar.newChat'), enabled: true },
    { id: 'new-book', label: t('sidebar.newWork'), enabled: true },
    { id: 'search', label: t('sidebar.search'), enabled: true },
  ]
}

export function bottomSidebarActions(t = defaultT) {
  return [
    { id: 'settings', label: t('sidebar.settings'), enabled: true },
    { id: 'mobile', label: t('sidebar.mobile'), enabled: false },
  ]
}
