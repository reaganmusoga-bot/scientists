import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to the static HTML we placed in public/
  redirect('/index.html');
}
