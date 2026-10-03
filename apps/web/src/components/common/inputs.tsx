import { useEffect, useState } from 'react';
import { formatNumber, parseDecimal } from '@l10n/shared';
import { Input, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Número con formato español (acepta «1.234,56» o «1234.56»). Guarda al salir del campo.
 * `scale` convierte a enteros (100 para céntimos, 1 000 000 para tarifas).
 */
export function DecimalInput({
  value,
  onCommit,
  scale = 1,
  maxDecimals = 2,
  placeholder,
  className,
  suffix,
  id,
  disabled,
  testId,
}: {
  value: number | null | undefined;
  onCommit: (value: number | null) => void;
  scale?: number;
  maxDecimals?: number;
  placeholder?: string;
  className?: string;
  suffix?: string;
  id?: string;
  disabled?: boolean;
  testId?: string;
}) {
  const display = (v: number | null | undefined) =>
    v == null ? '' : formatNumber(v / scale, maxDecimals).replace(/\u00a0/g, ' ');
  const [text, setText] = useState(display(value));
  useEffect(() => setText(display(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    const parsed = parseDecimal(text);
    if (text.trim() !== '' && parsed == null) {
      setText(display(value));
      return;
    }
    // Con escala (céntimos, millonésimas) se guarda un entero; sin escala, el número con los
    // decimales permitidos (tipos de cambio, porcentajes, horas…).
    const next =
      parsed == null
        ? null
        : scale === 1
          ? Math.round(parsed * 10 ** maxDecimals) / 10 ** maxDecimals
          : Math.round(parsed * scale);
    if (next !== value) onCommit(next);
    setText(display(next));
  };

  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing)
            (e.target as HTMLInputElement).blur();
        }}
        className={cn('text-right tabular-nums', suffix && 'pr-12')}
        data-testid={testId}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

/** Campo de texto que guarda al salir (para notas y campos sueltos de una ficha). */
export function CommitInput({
  value,
  onCommit,
  multiline,
  rows = 4,
  className,
  placeholder,
  type,
  id,
  testId,
}: {
  value: string | null | undefined;
  onCommit: (value: string | null) => void;
  multiline?: boolean;
  rows?: number;
  className?: string;
  placeholder?: string;
  type?: string;
  id?: string;
  testId?: string;
}) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const commit = () => {
    const next = text.trim() === '' ? null : text;
    if ((next ?? null) !== (value ?? null)) onCommit(next);
  };
  return multiline ? (
    <Textarea
      id={id}
      value={text}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      className={className}
      data-testid={testId}
    />
  ) : (
    <Input
      id={id}
      type={type}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
      }}
      className={className}
      data-testid={testId}
    />
  );
}

/** Año razonable: al teclear una fecha, el navegador pasa por años como 0002 o 0202. */
const COMPLETE_DATE = /^(19|20)\d{2}-\d{2}-\d{2}$/;

/**
 * Fecha que se guarda al elegirla en el calendario o al terminar de escribirla, nunca con un año
 * a medias. Vaciar el campo la borra.
 */
export function DateInput({
  value,
  onCommit,
  className,
  id,
  testId,
}: {
  value: string | null | undefined;
  onCommit: (value: string | null) => void;
  className?: string;
  id?: string;
  testId?: string;
}) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const commit = (v: string) => {
    const next = v === '' ? null : v;
    if (next === (value ?? null)) return;
    if (next === null || COMPLETE_DATE.test(next)) onCommit(next);
  };
  return (
    <Input
      id={id}
      type="date"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
      // Si se deja a medias o con un año imposible, vuelve a la fecha guardada.
      onBlur={() => {
        if (text !== '' && !COMPLETE_DATE.test(text)) setText(value ?? '');
      }}
      className={className}
      data-testid={testId}
    />
  );
}
