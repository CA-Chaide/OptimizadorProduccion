
import * as React from 'react';

// Este layout ahora es más simple, ya que el proveedor principal está en la raíz.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

    