'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

/**
 * Single modal focus-management system for drawers/dialogs/sheets.
 * On open: locks body scroll, focuses first control, traps Tab/Shift+Tab,
 * closes on Escape. On close: restores scroll + returns focus to the trigger.
 */
export function useModalFocus({
  active,
  onClose,
  initialFocusRef,
}: {
  active: boolean;
  onClose: () => void;
  initialFocusRef?: React.RefObject<HTMLElement>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const previousOverflow = useRef<string>('');

  useEffect(() => {
    if (!active) return;
    triggerRef.current = document.activeElement;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const container = containerRef.current;
    const focusTarget =
      initialFocusRef?.current ?? (container ? focusablesIn(container)[0] : undefined);
    // Focus after paint so the dialog is laid out (avoids scroll jumps).
    const frame = requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !container) return;
      const focusables = focusablesIn(container);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow.current;
      // Restore focus to the element that opened the dialog.
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement) trigger.focus({ preventScroll: true });
    };
  }, [active, onClose, initialFocusRef]);

  return containerRef;
}
