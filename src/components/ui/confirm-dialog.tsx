'use client';

import { useState } from 'react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';

/**
 * Confirmation for destructive actions.
 *
 * The confirm button is NOT autofocused. On a dialog whose purpose is to slow
 * someone down, putting the destructive action under an accidental Enter press
 * defeats the point — Dialog focuses the panel, so the title is read first.
 *
 * `requirePhrase` is for the genuinely irreversible ones: the button stays
 * disabled until the exact words are typed. Use it sparingly. Applied to
 * everything it becomes noise people learn to type through.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  pending = false,
  requirePhrase,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  pending?: boolean;
  requirePhrase?: string;
}) {
  const [typed, setTyped] = useState('');
  const unlocked = !requirePhrase || typed.trim() === requirePhrase;

  function close() {
    setTyped('');
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={pending}
            disabled={!unlocked}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {requirePhrase && (
        <label className="flex flex-col gap-2">
          <span className="text-ink-secondary text-[13px]">
            Type <strong className="text-ink font-mono">{requirePhrase}</strong> to confirm.
          </span>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
      )}
    </Dialog>
  );
}
