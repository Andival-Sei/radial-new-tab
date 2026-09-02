import type { Language } from './types';

const messages = {
  en: {
    search: 'Search the web or your shortcuts', settings: 'Settings', add: 'Add shortcut', focus: 'Focus mode',
    appearance: 'Appearance', system: 'System', light: 'Light', dark: 'Dark', language: 'Language', auto: 'Auto',
    russian: 'Russian', english: 'English', searchEngine: 'Search engine', browserDefault: 'Browser default', clock24: '24-hour clock', seconds: 'Show seconds',
    compact: 'Compact shortcuts', layout: 'Shortcut layout', orbit: 'Orbit', smartTiles: 'Smart tiles', opened: 'Opened', automation: 'Automatic shortcuts', autoAddTopSites: 'Add frequently visited sites', autoAddTopSitesHint: 'Uses the browser’s complete top sites list. Radial sends nothing to its own servers.', permissionRequired: 'Browser permission was not granted', background: 'Background', backgroundHint: 'Stored only on this device for a faster, private start page.', backgroundDefault: 'Radial atmosphere', backgroundSelected: 'Custom image', backgroundPreview: 'Background preview', chooseImage: 'Choose image', removeBackground: 'Remove image', backgroundSaved: 'Background saved', backgroundRemoved: 'Background removed', backgroundError: 'Choose an image up to 5 MB', data: 'Your data', export: 'Export data', import: 'Import data', reset: 'Reset to defaults',
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
    compact: 'Компактные ссылки', layout: 'Режим ссылок', orbit: 'Орбита', smartTiles: 'Умная плитка', opened: 'Открыто', automation: 'Автоматические ссылки', autoAddTopSites: 'Добавлять часто посещаемые сайты', autoAddTopSitesHint: 'Берёт весь конечный список популярных сайтов из браузера; Radial не отправляет его на свои серверы.', permissionRequired: 'Разрешение браузера не предоставлено', background: 'Фон', backgroundHint: 'Хранится только на этом устройстве для быстрой и приватной стартовой страницы.', backgroundDefault: 'Атмосфера Radial', backgroundSelected: 'Своё изображение', backgroundPreview: 'Предпросмотр фона', chooseImage: 'Выбрать изображение', removeBackground: 'Убрать изображение', backgroundSaved: 'Фон сохранён', backgroundRemoved: 'Фон убран', backgroundError: 'Выберите изображение до 5 МБ', data: 'Ваши данные', export: 'Экспортировать', import: 'Импортировать', reset: 'Сбросить настройки',
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
