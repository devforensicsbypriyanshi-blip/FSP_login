'use client';

import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { revokeOtherDevices } from '@/lib/actions/profile';
import { formatWhen } from '@/lib/format';

/**
 * The device list matters more here than on most platforms: only one device may
 * be signed in at a time, so students *will* get kicked out and will want to see
 * why. Showing them the list turns "the app logged me out" into "oh, that was me
 * on my phone".
 *
 * The current device is identified server-side from the httpOnly cookie, never
 * from anything the page could claim — otherwise "keep this one" would be a way
 * to keep someone else's.
 */

export interface DeviceRow {
  id: string;
  label: string | null;
  lastSeenAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export function DeviceList({ devices, currentDeviceId }: { devices: DeviceRow[]; currentDeviceId: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();

  const others = devices.filter((d) => !d.isCurrent);

  function revokeOthers() {
    startTransition(async () => {
      const outcome = await revokeOtherDevices(currentDeviceId);
      setConfirming(false);

      if (!outcome.ok) {
        toast({ tone: 'error', message: 'We could not sign the other devices out. Please try again.' });
        return;
      }

      toast({
        tone: 'success',
        message:
          outcome.count === 0
            ? 'No other devices were signed in.'
            : `Signed out ${outcome.count} other ${outcome.count === 1 ? 'device' : 'devices'}.`,
      });
    });
  }

  if (devices.length === 0) {
    return (
      <EmptyState
        icon={Monitor}
        title="No signed-in devices"
        description="Devices appear here after you sign in. Only one can be active at a time."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-line flex flex-col divide-y">
        {devices.map((device) => {
          const isPhone = /iphone|ipad|android/i.test(device.label ?? '');
          const Icon = isPhone ? Smartphone : Monitor;

          return (
            <li key={device.id} className="flex items-center gap-3.5 py-3.5 first:pt-0 last:pb-0">
              <span className="bg-hover text-ink-secondary grid size-10 shrink-0 place-items-center rounded-xl">
                <Icon className="size-[18px]" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-ink flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                  {device.label ?? 'Unknown device'}
                  {device.isCurrent && <Badge variant="success">This device</Badge>}
                </p>
                <p className="text-ink-muted mt-0.5 text-[12px]">
                  Last active {formatWhen(device.lastSeenAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {others.length > 0 && (
        <div className="border-line flex flex-col gap-2 border-t pt-4">
          <Button
            variant="danger-outline"
            size="sm"
            className="self-start"
            onClick={() => setConfirming(true)}
          >
            <LogOut className="size-4" aria-hidden /> Sign out other devices
          </Button>
          <p className="text-ink-muted text-[12px] leading-relaxed">
            Use this if you signed in somewhere you no longer have access to. This device stays signed in.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={revokeOthers}
        pending={pending}
        title="Sign out other devices?"
        confirmLabel="Sign them out"
        description={
          <>
            {others.length === 1 ? 'One other device' : `${others.length} other devices`} will be signed out
            immediately and will need a fresh email code to get back in. This device stays signed in.
          </>
        }
      />
    </div>
  );
}
