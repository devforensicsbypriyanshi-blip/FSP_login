import { redirect } from 'next/navigation';

export default function RootHomePage() {
  redirect('/sign-in');
}
