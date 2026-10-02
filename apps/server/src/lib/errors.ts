export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(what = 'El elemento') {
    super(404, 'no_encontrado', `${what} no existe o se ha eliminado.`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, issues?: { path: string; message: string }[]) {
    super(400, 'validacion', message, issues);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'conflicto', message);
  }
}

export class MaintenanceError extends AppError {
  constructor() {
    super(
      503,
      'mantenimiento',
      'Hay una operación de mantenimiento en curso. Inténtalo de nuevo en unos segundos.',
    );
  }
}
