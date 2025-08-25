
import * as React from 'react';

// This layout is now simplified as the main visual structure is in the page itself.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
