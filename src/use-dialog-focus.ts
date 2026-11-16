import { createContext, useContext, useEffect, useRef, type RefObject } from 'react';

export const DialogFocusContext = createContext<RefObject<HTMLElement | null> | null>(null);

/** Keep keyboard navigation in the topmost sheet and return focus on close. */
export function useDialogFocus() {
  const ref = useRef<HTMLElement>(null);
  const opener = useContext(DialogFocusContext);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Capture the trigger before React autofocus or `inert` changes focus.
    const previous = opener?.current ?? (document.activeElement as HTMLElement | null);
    const selector =
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), a[href], [tabindex="0"]';
    const controls = () =>
      Array.from(element.querySelectorAll<HTMLElement>(selector)).filter(
        (item) => item.getClientRects().length,
      );
    if (!element.contains(document.activeElement)) controls()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== element) return;
      const items = controls();
      const first = items[0],
        last = items[items.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || !element.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !element.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      if (previous?.isConnected) previous.focus();
    };
  }, [opener]);
  return ref;
}
