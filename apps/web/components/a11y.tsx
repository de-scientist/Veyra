'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisible(element: HTMLElement): boolean {
  // offsetParent is null for fixed-position elements and for <body>, so it
  // cannot be used as a visibility test inside fixed drawers/dialogs/sheets.
  if (element.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function focusablesIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
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
  // Keep the latest onClose without re-subscribing the effect when the
  // caller's inline closure identity changes (avoids trap teardown/rebuild).
  const onCloseRef = useRef(onClose);
  const initialRefHolder = useRef(initialFocusRef);
  useEffect(() => {
    onCloseRef.current = onClose;
    initialRefHolder.current = initialFocusRef;
  });

  useEffect(() => {
    if (!active) return;
    triggerRef.current = document.activeElement;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const container = containerRef.current;
    // Read .current here (post-mount) so caller refs (e.g. Close button)
    // are already attached — reading during render would see null.
    const focusTarget =
      initialRefHolder.current?.current ?? (container ? focusablesIn(container)[0] : undefined);
    // Focus after paint so the dialog is laid out (avoids scroll jumps).
    const frame = requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !containerRef.current) return;
      const containerEl = containerRef.current;
      const focusables = focusablesIn(containerEl);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // If focus somehow escaped the modal (e.g. pointer click on the
      // mouse-only overlay), pull it back instead of letting Tab walk the
      // hidden page behind the dialog.
      if (!containerEl.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
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
  }, [active]);

  return containerRef;
}
