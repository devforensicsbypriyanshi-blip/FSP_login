'use client';

import { Check, ShieldAlert, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/field';
import { setUserRoles } from '@/lib/actions/console';
import { formatDate } from '@/lib/format';
import type { ConsoleUser } from '@/lib/data/console';

/**
 * Role assignment.
 *
 * `student` is not offered as a checkbox: every account has it, the database
 * adds it back if you leave it out, and showing a box that cannot be unticked
 * teaches people to distrust the other boxes.
 *
 * The two refusals worth knowing about — you cannot demote yourself, and the
 * last admin cannot be demoted at all — are enforced in the database. Both are
 * permanent lockouts otherwise: role grants require admin, so there is no way
 * back in.
 */

const ASSIGNABLE = [
  { key: 'educator', label: 'Educator', hint: 'Author courses, classes and tests' },
  { key: 'admin', label: 'Admin', hint: 'Everything, including roles and money' },
  { key: 'support', label: 'Support', hint: 'Tickets and account help' },
  { key: 'developer', label: 'Developer', hint: 'Flags, logs and webhooks' },
];

const ROLE_VARIANT: Record<string, 'purple' | 'success' | 'warning' | 'info' | 'gray'> = {
  admin: 'warning',
  educator: 'purple',
  support: 'info',
  developer: 'success',
  student: 'gray',
};

export function UserRoles({ users }: { users: ConsoleUser[] }) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ConsoleUser | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? users.filter(
        (user) => user.email.toLowerCase().includes(term) || user.fullName.toLowerCase().includes(term)
      )
    : users;

  function open(user: ConsoleUser) {
    setEditing(user);
    setDraft(user.roles.filter((role) => role !== 'student'));
    setFeedback(null);
  }

  function save() {
    if (!editing) return;
    startTransition(async () => {
      const result = await setUserRoles(editing.id, draft);
      setFeedback(result);
      if (result.ok) setEditing(null);
    });
  }

  const columns: Column<ConsoleUser>[] = [
    {
      key: 'person',
      header: 'Person',
      primary: true,
      render: (user) => (
        <div className="min-w-0">
          <p className="text-ink truncate font-semibold">{user.fullName}</p>
          <p className="text-ink-muted truncate text-[12.5px]">{user.email}</p>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) => (
        <div className="flex flex-wrap justify-end gap-1 md:justify-start">
          {user.roles.map((role) => (
            <Badge key={role} variant={ROLE_VARIANT[role] ?? 'gray'}>
              {role}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'courses',
      header: 'Courses',
      render: (user) => <span className="tabular-nums">{user.enrollments}</span>,
    },
    {
      key: 'seen',
      header: 'Last seen',
      render: (user) =>
        user.lastSeenAt ? (
          <span className="text-ink-secondary">{formatDate(user.lastSeenAt)}</span>
        ) : (
          <span className="text-ink-light">Never</span>
        ),
    },
    {
      key: 'action',
      header: '',
      render: (user) => (
        <Button size="sm" variant="outline" onClick={() => open(user)}>
          Roles
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <p
          className={
            feedback.ok
              ? 'border-success-border bg-success-bg text-success rounded-xl border p-3 text-[13px]'
              : 'border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]'
          }
          role={feedback.ok ? 'status' : 'alert'}
        >
          {feedback.message}
        </p>
      )}

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name or email…"
        aria-label="Search users"
      />

      {editing && (
        <div className="border-primary bg-surface rounded-2xl border-2 p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-ink font-semibold">{editing.fullName}</p>
              <p className="text-ink-muted text-[12.5px]">{editing.email}</p>
            </div>
            <Button size="sm" variant="ghost" aria-label="Close" onClick={() => setEditing(null)}>
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-ink-secondary mb-1 text-[13px] font-medium">
              Roles in addition to student
            </legend>
            {ASSIGNABLE.map((role) => (
              <label key={role.key} className="flex items-start gap-2.5 text-[13.5px]">
                <input
                  type="checkbox"
                  checked={draft.includes(role.key)}
                  onChange={(event) =>
                    setDraft(
                      event.target.checked ? [...draft, role.key] : draft.filter((key) => key !== role.key)
                    )
                  }
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span>
                  <span className="text-ink font-medium">{role.label}</span>
                  <span className="text-ink-muted block text-[12.5px]">{role.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {draft.includes('admin') && !editing.roles.includes('admin') && (
            <p className="border-warning-border bg-warning-bg text-warning mt-3 flex items-start gap-2 rounded-xl border p-3 text-[12.5px] leading-relaxed">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Admin can change roles, refund payments and read every ticket. There is no higher level to
                appeal to.
              </span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" loading={pending} onClick={save}>
              <Check className="size-4" aria-hidden /> Save roles
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filtered}
        empty={
          <EmptyState
            icon={ShieldAlert}
            title={term ? 'Nobody matches that' : 'No users yet'}
            description={term ? 'Try part of an email address.' : 'Accounts appear here as people register.'}
          />
        }
      />
    </div>
  );
}
