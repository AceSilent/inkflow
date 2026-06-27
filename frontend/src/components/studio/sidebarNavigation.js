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

export function settingsSidebarSections(t = defaultT) {
  return [
    { id: 'providers', label: t('settings.nav.providers') },
    { id: 'models', label: t('settings.nav.models') },
    { id: 'network', label: t('settings.nav.network') },
    { id: 'context', label: t('settings.nav.context') },
    { id: 'appearance', label: t('settings.nav.appearance') },
  ]
}
