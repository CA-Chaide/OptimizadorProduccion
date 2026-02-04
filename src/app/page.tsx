import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to the main dashboard page.
  redirect('/dashboard');
}
