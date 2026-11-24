export type SourceErrorKind = 'network' | 'timeout' | 'http' | 'format' | 'empty';

/** Fallo controlado de una fuente. El mensaje está pensado para mostrarse. */
export class SourceError extends Error {
  readonly kind: SourceErrorKind;
  readonly status: number | undefined;
  /** Espera que ha pedido la fuente (ms). */
  readonly retryAfter: number | undefined;

  constructor(kind: SourceErrorKind, message: string, status?: number, retryAfter?: number) {
    super(message);
    this.name = 'SourceError';
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
  }

  /** Solo tiene sentido reintentar en seguida los fallos pasajeros. */
  get transient(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      (this.kind === 'http' && (this.status ?? 0) >= 500)
    );
  }
}
