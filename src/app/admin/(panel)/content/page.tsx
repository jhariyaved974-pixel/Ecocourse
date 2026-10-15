import { redirect } from 'next/navigation';

// The content index has no screen of its own; the homepage editor checks the role.
export default function ContentIndexPage() {
  redirect('/admin/content/homepage');
}
