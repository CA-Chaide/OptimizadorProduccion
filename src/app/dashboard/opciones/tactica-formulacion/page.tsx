'use client';

import { redirect } from 'next/navigation';

export default function TacticaFormulacionPage() {
  // Redirigir al dashboard ya que este módulo ha sido eliminado
  redirect('/dashboard');
  return null;
}
