import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';

interface SheetProps {
  title: string;
  onClose(): void;
  children: ComponentChildren;
  /** Replaces the default "Done" button in the header. */
  headerAction?: ComponentChildren;
  footer?: ComponentChildren;
}

/** Bottom sheet dialog: tap the backdrop or press Escape to close. */
export function Sheet({ title, onClose, children, headerAction, footer }: SheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      class="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={sheetRef}>
        <div class="sheet-header">
          <h2 id={titleId}>{title}</h2>
          {headerAction ?? (
            <button type="button" class="text-button" onClick={onClose}>
              Done
            </button>
          )}
        </div>
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}
