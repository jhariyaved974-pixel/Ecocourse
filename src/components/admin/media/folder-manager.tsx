'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form-controls';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { createMediaFolder, deleteMediaFolder, renameMediaFolder } from '@/app/admin/(panel)/media/actions';
import type { MediaFolderOption } from '@/lib/admin/media';
import { cn } from '@/lib/utils';
import { CENTERED_DIALOG_CLASS } from './dialog-classes';

function FolderNameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialName,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initialName: string;
  submitLabel: string;
  /** Resolves to a field error to show, or null when done. */
  onSubmit: (name: string) => Promise<string | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(CENTERED_DIALOG_CLASS, 'h-fit')}>
        {/* Remounted on every opening so the field starts from initialName. */}
        <FolderNameForm title={title} description={description} initialName={initialName} submitLabel={submitLabel} onSubmit={onSubmit} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FolderNameForm({
  title,
  description,
  initialName,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  description: string;
  initialName: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initialName);
  const [error, setError] = React.useState<string | undefined>();
  const [pending, setPending] = React.useState(false);
  const fieldId = React.useId();
  const trimmed = name.trim();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!trimmed) {
          setError('Folder name is required.');
          return;
        }
        setPending(true);
        const problem = await onSubmit(trimmed);
        setPending(false);
        setError(problem ?? undefined);
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field label="Folder name" htmlFor={fieldId} error={error} required>
        <Input
          id={fieldId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoFocus
          autoComplete="off"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          placeholder="e.g. Summer drop 2026"
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} disabled={!trimmed || trimmed === initialName.trim()}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Creates a library folder and opens it. */
export function NewFolderButton({ variant = 'outline', size = 'sm' }: { variant?: ButtonProps['variant']; size?: ButtonProps['size'] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { run } = useActionRunner();
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        <FolderPlus /> New folder
      </Button>
      <FolderNameDialog
        open={open}
        onOpenChange={setOpen}
        title="New folder"
        description="Folders keep the library organised. Files can be moved between folders at any time."
        initialName=""
        submitLabel="Create folder"
        onSubmit={async (name) => {
          const res = await run(() => createMediaFolder({ name }), { success: 'Folder created', refresh: false });
          if (!res.ok) return res.fieldErrors?.name ?? res.error;
          setOpen(false);
          router.push(`/admin/media?folder=${res.data.id}`);
          return null;
        }}
      />
    </>
  );
}

/** Title row for the folder being viewed, with rename and delete (only when empty). */
export function FolderToolbar({ folder }: { folder: MediaFolderOption }) {
  const router = useRouter();
  const [renaming, setRenaming] = React.useState(false);
  const { run } = useActionRunner();
  const empty = folder.assetCount === 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted">Folder</p>
        <h2 className="truncate text-base font-semibold" title={folder.name}>
          {folder.name}
        </h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setRenaming(true)}>
          <Pencil /> Rename
        </Button>
        <ConfirmActionButton
          title="Delete this folder?"
          description={
            <>
              The empty folder <strong>{folder.name}</strong> will be deleted. No files are affected.
            </>
          }
          confirmLabel="Delete folder"
          danger
          variant="danger-outline"
          disabled={!empty}
          success="Folder deleted"
          action={async () => {
            const res = await deleteMediaFolder({ id: folder.id });
            if (res.ok) router.replace('/admin/media');
            return res;
          }}
        >
          <Trash2 /> Delete
        </ConfirmActionButton>
      </div>
      {!empty ? (
        <p className="w-full text-xs text-muted">
          To delete this folder, first move its {folder.assetCount} file{folder.assetCount === 1 ? '' : 's'} to another folder (open a file and change its folder).
        </p>
      ) : null}
      <FolderNameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename folder"
        description="Renaming does not change any file URLs."
        initialName={folder.name}
        submitLabel="Save name"
        onSubmit={async (name) => {
          const res = await run(() => renameMediaFolder({ id: folder.id, name }), { success: 'Folder renamed' });
          if (!res.ok) return res.fieldErrors?.name ?? res.error;
          setRenaming(false);
          return null;
        }}
      />
    </div>
  );
}
