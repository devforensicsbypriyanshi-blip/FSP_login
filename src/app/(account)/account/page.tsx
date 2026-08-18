import { GraduationCap, Mail, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProfileForm } from '@/components/account/profile-form';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { IS_DEMO_BUILD } from '@/lib/flags';
import { getSessionContext } from '@/lib/session/server';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Profile' };

/**
 * The avatar is initials, deliberately. Sign-in is email-only — there is no
 * Google account to pull a photo from — and asking 200 students to upload one
 * would buy a storage bucket and a moderation problem for very little.
 */
export default async function ProfilePage() {
  const session = await getSessionContext();

  if (!session) {
    if (!IS_DEMO_BUILD) redirect('/sign-in');
    return (
      <>
        <PageHeader title="Profile" description="Your account details." />
        <Card>
          <p className="text-ink-muted text-[13.5px]">Sign in to view and edit your profile.</p>
        </Card>
      </>
    );
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('bio, created_at, timezone')
    .eq('id', session.userId)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Profile" description="Your account details and how we address you." />

      <Card>
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar name={session.fullName} size="lg" />
          <div className="min-w-0">
            <h2 className="font-display text-ink text-lg font-bold">{session.fullName}</h2>
            <p className="text-ink-muted mt-0.5 flex items-center justify-center gap-1.5 text-[13px] sm:justify-start">
              <Mail className="size-3.5" aria-hidden /> {session.email}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {session.roles.map((role) => (
                <Badge key={role} variant={role === 'student' ? 'purple' : 'info'}>
                  {role}
                </Badge>
              ))}
              {profile?.created_at && <Badge variant="gray">Joined {formatDate(profile.created_at)}</Badge>}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit your details</CardTitle>
          <GraduationCap className="text-primary size-[18px]" aria-hidden />
        </CardHeader>
        <ProfileForm
          initial={{
            fullName: session.fullName,
            email: session.email,
            examTarget: session.examTarget,
            bio: profile?.bio ?? null,
          }}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <ShieldCheck className="text-success size-[18px]" aria-hidden />
        </CardHeader>
        <p className="text-ink-secondary text-[13.5px] leading-relaxed">
          Your account has no password — you sign in with a one-time code sent to your email, and only one
          device can be signed in at a time. Manage your signed-in device from settings.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4 self-start">
          <Link href="/account/settings">Settings &amp; devices</Link>
        </Button>
      </Card>
    </>
  );
}
