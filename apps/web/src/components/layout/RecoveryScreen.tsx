import { TriangleAlert } from 'lucide-react';
import { BackupList, FullCopyPanel } from '@/features/settings/BackupsPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Se muestra si la base de datos no supera la comprobación de integridad al arrancar. */
export function RecoveryScreen() {
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-8">
      <div className="grid w-full max-w-3xl gap-6">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-1 size-7 text-destructive" />
          <div>
            <h1 className="text-2xl font-semibold">Hay un problema con la base de datos</h1>
            <p className="mt-1 text-muted-foreground">
              Al arrancar, L10N Suite ha comprobado tus datos y el archivo parece dañado. Para no
              empeorar la situación, la aplicación no lo modificará. Restaura la copia de seguridad
              más reciente o importa una copia completa.
            </p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Restaurar una copia de seguridad</CardTitle>
            <CardDescription>La más reciente aparece primero.</CardDescription>
          </CardHeader>
          <CardContent>
            <BackupList compact />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Importar una copia completa</CardTitle>
          </CardHeader>
          <CardContent>
            <FullCopyPanel />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
