import { Users } from 'lucide-react';
import { UserRoles } from '@/components/admin/user-roles';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { getConsoleUsers } from '@/lib/data/console';

export const metadata = { title: 'Users & Roles' };

export default async function AdminUsersPage() {
  const users = await getConsoleUsers();

  return (
    <>
      <PageHeader title="Users & roles" description="Every account, and what each one is allowed to do." />

      <Card>
        <CardHeader>
          <CardTitle>
            Accounts
            <span className="text-ink-muted ml-2 text-[13px] font-normal">{users.length}</span>
          </CardTitle>
          <Users className="text-primary size-[18px]" aria-hidden />
        </CardHeader>
        <UserRoles users={users} />
      </Card>

      <p className="text-ink-muted mx-auto max-w-xl text-center text-xs leading-relaxed">
        Role changes are written to the audit log with who made them and what they were before. Nobody can
        remove their own admin role, and the last admin cannot be demoted — there would be no way back in.
      </p>
    </>
  );
}
