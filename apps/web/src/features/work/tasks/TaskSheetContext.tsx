import { createContext, useContext, useState, type ReactNode } from 'react';
import { TaskSheet } from './TaskSheet';

const Ctx = createContext<(id: string) => void>(() => {});

/** Permite abrir el panel de una tarea desde cualquier pantalla. */
export function TaskSheetProvider({ children }: { children: ReactNode }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  return (
    <Ctx.Provider value={setTaskId}>
      {children}
      <TaskSheet taskId={taskId} onClose={() => setTaskId(null)} onOpenTask={setTaskId} />
    </Ctx.Provider>
  );
}

export function useOpenTask() {
  return useContext(Ctx);
}
