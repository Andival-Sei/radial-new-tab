import type { Language } from './types';

const messages = {
  en: {
    search: 'Search the web or your shortcuts', settings: 'Settings', add: 'Add shortcut', focus: 'Focus mode',
    appearance: 'Appearance', system: 'System', light: 'Light', dark: 'Dark', language: 'Language', auto: 'Auto',
    russian: 'Russian', english: 'English', searchEngine: 'Search engine', browserDefault: 'Browser default', clock24: '24-hour clock', seconds: 'Show seconds',
    compact: 'Compact shortcuts', layout: 'Shortcut layout', orbit: 'Orbit', smartTiles: 'Smart tiles', opened: 'Opened', data: 'Your data', export: 'Export data', import: 'Import data', reset: 'Reset to defaults',
    close: 'Close', edit: 'Edit shortcut', remove: 'Remove', cancel: 'Cancel', save: 'Save', title: 'Name', url: 'Web address',
    titlePlaceholder: 'For example, GitHub', urlPlaceholder: 'https://example.com', invalidUrl: 'Enter a valid http(s) address',
    noResults: 'No matching shortcut. Press Enter to search the web.', searchFor: 'Search the web for', importError: 'Could not import this file',
    imported: 'Data imported', exported: 'Data exported', saved: 'Shortcut saved', deleted: 'Shortcut removed', resetDone: 'Defaults restored',
    reorderHint: 'Drag shortcuts to reorder', openSettings: 'Open settings', greetingMorning: 'Good morning', greetingDay: 'Good afternoon', greetingEvening: 'Good evening',
  },
  ru: {
    search: 'Поиск в интернете или по ссылкам', settings: 'Настройки', add: 'Добавить ссылку', focus: 'Режим фокуса',
    appearance: 'Оформление', system: 'Системная', light: 'Светлая', dark: 'Тёмная', language: 'Язык', auto: 'Авто',
    russian: 'Русский', english: 'English', searchEngine: 'Поисковая система', browserDefault: 'По умолчанию в браузере', clock24: '24-часовой формат', seconds: 'Показывать секунды',
    compact: 'Компактные ссылки', layout: 'Режим ссылок', orbit: 'Орбита', smartTiles: 'Умная плитка', opened: 'Открыто', data: 'Ваши данные', export: 'Экспортировать', import: 'Импортировать', reset: 'Сбросить настройки',
    close: 'Закрыть', edit: 'Изменить ссылку', remove: 'Удалить', cancel: 'Отмена', save: 'Сохранить', title: 'Название', url: 'Веб-адрес',
    titlePlaceholder: 'Например, GitHub', urlPlaceholder: 'https://example.com', invalidUrl: 'Введите корректный адрес http(s)',
    noResults: 'Подходящих ссылок нет. Нажмите Enter для поиска.', searchFor: 'Искать в интернете', importError: 'Не удалось импортировать файл',
    imported: 'Данные импортированы', exported: 'Данные экспортированы', saved: 'Ссылка сохранена', deleted: 'Ссылка удалена', resetDone: 'Настройки сброшены',
    reorderHint: 'Перетаскивайте ссылки, чтобы менять порядок', openSettings: 'Открыть настройки', greetingMorning: 'Доброе утро', greetingDay: 'Добрый день', greetingEvening: 'Добрый вечер',
  },
} as const;

export type MessageKey = keyof typeof messages.en;

export function resolveLanguage(language: Language): 'ru' | 'en' {
  if (language !== 'auto') return language;
  const candidate = globalThis.navigator?.language?.toLowerCase() ?? 'en';
  return candidate.startsWith('ru') ? 'ru' : 'en';
}

export function makeTranslator(language: Language) {
  const locale = resolveLanguage(language);
  return { locale, t: (key: MessageKey) => messages[locale][key] };
}
