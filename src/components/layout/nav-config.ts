import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  FileCheck,
  FileText,
  FolderOpen,
  GitPullRequest,
  GraduationCap,
  HelpCircle,
  Home,
  Inbox,
  Key,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Radio,
  Receipt,
  Settings,
  ShieldCheck,
  Smartphone,
  Tag,
  ToggleLeft,
  Users,
  Video,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import type { FlagKey } from '@/lib/flags';

export type Role = 'student' | 'educator' | 'admin' | 'support' | 'developer';

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile bottom bar, where space is ~64px. */
  shortLabel?: string;
  icon: LucideIcon;
  /** Include in the mobile bottom bar. Max 4 per role — the 5th slot is "More". */
  primary?: boolean;
  /** Hidden in production when this module flag is off. See lib/flags.ts. */
  flag?: FlagKey;
}

export interface PortalConfig {
  role: Role;
  basePath: string;
  brandBadge: string;
  brandEyebrow: string;
  brandName: string;
  accent: string;
  nav: NavItem[];
}

export const PORTALS: Record<Role, PortalConfig> = {
  student: {
    role: 'student',
    basePath: '/app',
    brandBadge: 'FS',
    brandEyebrow: 'Forensic Science by',
    brandName: 'Priyanshi',
    accent: 'var(--color-role-student)',
    nav: [
      { href: '/app', label: 'Home', icon: Home, primary: true },
      {
        href: '/app/learning',
        label: 'My Courses',
        shortLabel: 'Courses',
        icon: BookOpen,
        primary: true,
        flag: 'module.courses',
      },
      {
        href: '/app/live',
        label: 'Live Classes',
        shortLabel: 'Live',
        icon: Video,
        primary: true,
        flag: 'module.live_classes',
      },
      {
        href: '/app/calendar',
        label: 'Calendar',
        icon: CalendarDays,
        primary: true,
        flag: 'module.calendar',
      },
      {
        href: '/app/tests',
        label: 'Tests & Quizzes',
        shortLabel: 'Tests',
        icon: FileCheck,
        flag: 'module.quizzes',
      },
      { href: '/app/notes', label: 'Notes & DPPs', icon: FileText, flag: 'module.notes' },
      { href: '/app/doubts', label: 'Doubts & Forum', icon: HelpCircle, flag: 'module.doubts' },
      { href: '/app/mentorship', label: '1:1 Mentorship', icon: Users, flag: 'module.mentorship' },
    ],
  },

  educator: {
    role: 'educator',
    basePath: '/studio',
    brandBadge: 'ED',
    brandEyebrow: 'Educator Studio ·',
    brandName: 'Priyanshi Verma',
    accent: 'var(--color-role-educator)',
    nav: [
      { href: '/studio', label: 'Overview', icon: LayoutDashboard, primary: true },
      {
        href: '/studio/courses',
        label: 'Courses & Lectures',
        shortLabel: 'Courses',
        icon: FolderOpen,
        primary: true,
        flag: 'module.courses',
      },
      {
        href: '/studio/schedule',
        label: 'Class Schedule',
        shortLabel: 'Schedule',
        icon: CalendarDays,
        primary: true,
        flag: 'module.calendar',
      },
      {
        href: '/studio/live',
        label: 'Live Studio',
        shortLabel: 'Live',
        icon: Radio,
        primary: true,
        flag: 'module.live_classes',
      },
      { href: '/studio/doubts', label: 'Doubts Desk', icon: MessageSquare, flag: 'module.doubts' },
      { href: '/studio/quizzes', label: 'Quiz Builder', icon: FileCheck, flag: 'module.quizzes' },
      { href: '/studio/analytics', label: 'Student Analytics', icon: BarChart3, flag: 'module.analytics' },
      { href: '/studio/broadcasts', label: 'Broadcasts', icon: Megaphone },
    ],
  },

  admin: {
    role: 'admin',
    basePath: '/admin',
    brandBadge: 'AD',
    brandEyebrow: 'Platform Admin ·',
    brandName: 'God Mode',
    accent: 'var(--color-role-admin)',
    nav: [
      { href: '/admin', label: 'Overview', icon: BarChart3, primary: true },
      // Enrolments is primary and sits second on purpose: with payments off at
      // launch, granting access by hand is the only way a student gets in.
      {
        href: '/admin/enrollments',
        label: 'Enrolments',
        shortLabel: 'Access',
        icon: GraduationCap,
        primary: true,
      },
      { href: '/admin/users', label: 'Users & RBAC', shortLabel: 'Users', icon: Users, primary: true },
      {
        href: '/admin/settings',
        label: 'Platform Settings',
        shortLabel: 'Settings',
        icon: Settings,
        primary: true,
      },
      { href: '/admin/approvals', label: 'Course Approvals', icon: CheckSquare, flag: 'module.courses' },
      { href: '/admin/emails', label: 'Email Deliverability', icon: Mail },
      { href: '/admin/transactions', label: 'Payments & Refunds', icon: Receipt, flag: 'module.payments' },
      { href: '/admin/coupons', label: 'Coupons & Offers', icon: Tag, flag: 'module.payments' },
      { href: '/admin/audit', label: 'Audit Logs', icon: ShieldCheck },
    ],
  },

  support: {
    role: 'support',
    basePath: '/support',
    brandBadge: 'SU',
    brandEyebrow: 'Student Helpdesk ·',
    brandName: 'Support Team',
    accent: 'var(--color-role-support)',
    nav: [
      { href: '/support', label: 'Ticket Inbox', shortLabel: 'Inbox', icon: Inbox, primary: true },
      {
        href: '/support/chat',
        label: 'Live Support Chat',
        shortLabel: 'Chat',
        icon: MessageCircle,
        primary: true,
      },
      {
        href: '/support/accounts',
        label: 'Account & Email Helper',
        shortLabel: 'Accounts',
        icon: Smartphone,
        primary: true,
      },
      {
        href: '/support/materials',
        label: 'Study Materials',
        shortLabel: 'Materials',
        icon: FileText,
        primary: true,
      },
      { href: '/support/tests', label: 'Tests & Quizzes', icon: FileCheck, flag: 'module.quizzes' },
      {
        href: '/support/escalations',
        label: 'Doubt Escalations',
        icon: GitPullRequest,
        flag: 'module.doubts',
      },
      { href: '/support/kb', label: 'Knowledge Base', icon: HelpCircle },
    ],
  },

  developer: {
    role: 'developer',
    basePath: '/dev',
    brandBadge: 'DV',
    brandEyebrow: 'System Console ·',
    brandName: 'Developer',
    accent: 'var(--color-role-developer)',
    nav: [
      { href: '/dev', label: 'System Health', shortLabel: 'Health', icon: Activity, primary: true },
      {
        href: '/dev/config',
        label: 'Feature Flags & Config',
        shortLabel: 'Config',
        icon: ToggleLeft,
        primary: true,
      },
      { href: '/dev/keys', label: 'API Keys & Secrets', shortLabel: 'Keys', icon: Key, primary: true },
      { href: '/dev/webhooks', label: 'Webhooks', icon: Webhook, primary: true },
      { href: '/dev/logs', label: 'Live API Logs', icon: FileText },
    ],
  },
};

/** Nav items visible in the current environment (docs Part 5 §3). */
export function visibleNav(portal: PortalConfig, isVisible: (flag?: FlagKey) => boolean): NavItem[] {
  return portal.nav.filter((item) => isVisible(item.flag));
}
