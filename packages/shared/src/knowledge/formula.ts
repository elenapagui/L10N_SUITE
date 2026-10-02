/**
 * Fórmulas de las tablas personalizadas. Lenguaje pequeño y seguro (sin `eval`), con los
 * nombres de función de Excel en español y sus alias en inglés:
 *
 *   {Palabras} * {Tarifa}            referencias a columnas entre llaves (o corchetes)
 *   SI({Estado} = "Entregado"; 1; 0)  los argumentos se separan con «;» o «,»
 *   {Fecha} + 30                       una fecha más un número de días es otra fecha
 *   "KO" & "→" & "ES"                  concatenación
 *
 * Los decimales se escriben con punto (1.5) para no confundirlos con el separador.
 */

export type FormulaValue = number | string | boolean | null;

export class FormulaError extends Error {}

type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'ref'; name: string }
  | { k: 'neg'; e: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'call'; name: string; args: Node[] };

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i))!;
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) j++;
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new FormulaError('Falta cerrar las comillas');
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      const j = src.indexOf(close, i + 1);
      if (j < 0) throw new FormulaError(`Falta cerrar «${c}»`);
      out.push({ t: 'ref', v: src.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if (/[\p{L}_]/u.test(c)) {
      const m = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '<>', '!=', '=='].includes(two)) {
      out.push({ t: 'op', v: two === '!=' ? '<>' : two === '==' ? '=' : two });
      i += 2;
      continue;
    }
    if ('+-*/%^&=<>(),;'.includes(c)) {
      out.push({ t: 'op', v: c === ';' ? ',' : c });
      i++;
      continue;
    }
    throw new FormulaError(`Carácter no válido: «${c}»`);
  }
  return out;
}

function parseTokens(tokens: Token[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => {
    const t = peek();
    return t?.t === 'op' && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`Se esperaba «${v}»`);
    pos++;
  };

  function comparison(): Node {
    let l = concat();
    while (peek()?.t === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(peek()!.v as string)) {
      const op = (tokens[pos++] as { v: string }).v;
      l = { k: 'bin', op, l, r: concat() };
    }
    return l;
  }
  function concat(): Node {
    let l = additive();
    while (isOp('&')) {
      pos++;
      l = { k: 'bin', op: '&', l, r: additive() };
    }
    return l;
  }
  function additive(): Node {
    let l = term();
    while (isOp('+') || isOp('-')) {
      const op = (tokens[pos++] as { v: string }).v;
      l = { k: 'bin', op, l, r: term() };
    }
    return l;
  }
  function term(): Node {
    let l = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (tokens[pos++] as { v: string }).v;
      l = { k: 'bin', op, l, r: unary() };
    }
    return l;
  }
  function unary(): Node {
    if (isOp('-')) {
      pos++;
      return { k: 'neg', e: unary() };
    }
    if (isOp('+')) {
      pos++;
      return unary();
    }
    return power();
  }
  function power(): Node {
    const base = primary();
    if (isOp('^')) {
      pos++;
      return { k: 'bin', op: '^', l: base, r: unary() };
    }
    return base;
  }
  function primary(): Node {
    const t = tokens[pos++];
    if (!t) throw new FormulaError('La fórmula está incompleta');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'ref') return { k: 'ref', name: t.v };
    if (t.t === 'id') {
      const upper = t.v.toUpperCase();
      if (isOp('(')) {
        pos++;
        const args: Node[] = [];
        if (!isOp(')')) {
          args.push(comparison());
          while (isOp(',')) {
            pos++;
            args.push(comparison());
          }
        }
        expect(')');
        return { k: 'call', name: upper, args };
      }
      if (upper === 'VERDADERO' || upper === 'TRUE') return { k: 'bool', v: true };
      if (upper === 'FALSO' || upper === 'FALSE') return { k: 'bool', v: false };
      // Un nombre de columna sin llaves (una sola palabra) también vale.
      return { k: 'ref', name: t.v };
    }
    if (t.v === '(') {
      const e = comparison();
      expect(')');
      return e;
    }
    throw new FormulaError(`No se esperaba «${t.v}»`);
  }

  const node = comparison();
  if (pos < tokens.length) throw new FormulaError(`Sobra «${(tokens[pos] as { v: unknown }).v}»`);
  return node;
}

const cache = new Map<string, Node>();

export function parseFormula(src: string): Node {
  const hit = cache.get(src);
  if (hit) return hit;
  const node = parseTokens(tokenize(src));
  if (cache.size > 500) cache.clear();
  cache.set(src, node);
  return node;
}

function toNum(v: FormulaValue): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const n = Number(v.replace(',', '.'));
  if (Number.isNaN(n)) throw new FormulaError(`«${v}» no es un número`);
  return n;
}
function toStr(v: FormulaValue): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO';
  if (typeof v === 'number') return String(Math.round(v * 1e10) / 1e10);
  return v;
}
function toBool(v: FormulaValue): boolean {
  if (typeof v === 'string') return v !== '';
  return Boolean(v);
}
function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}
function fromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}
function compare(a: FormulaValue, b: FormulaValue): number {
  if (typeof a === 'number' || typeof b === 'number') return toNum(a) - toNum(b);
  return toStr(a).localeCompare(toStr(b), 'es', { sensitivity: 'base' });
}

type Fn = (args: FormulaValue[], lazy: { today: string }) => FormulaValue;

const FUNCTIONS: Record<string, Fn> = {
  REDONDEAR: (a) => {
    const d = a.length > 1 ? toNum(a[1]!) : 0;
    const f = 10 ** d;
    return Math.round(toNum(a[0]!) * f + Number.EPSILON) / f;
  },
  ABS: (a) => Math.abs(toNum(a[0]!)),
  MIN: (a) => (a.length ? Math.min(...a.map(toNum)) : 0),
  MAX: (a) => (a.length ? Math.max(...a.map(toNum)) : 0),
  SUMA: (a) => a.reduce<number>((s, v) => s + toNum(v), 0),
  PROMEDIO: (a) => (a.length ? a.reduce<number>((s, v) => s + toNum(v), 0) / a.length : 0),
  CONCAT: (a) => a.map(toStr).join(''),
  LARGO: (a) => [...toStr(a[0]!)].length,
  MAYUSC: (a) => toStr(a[0]!).toLocaleUpperCase('es'),
  MINUSC: (a) => toStr(a[0]!).toLocaleLowerCase('es'),
  ESBLANCO: (a) => a[0] == null || a[0] === '',
  Y: (a) => a.every(toBool),
  O: (a) => a.some(toBool),
  NO: (a) => !toBool(a[0]!),
  HOY: (_a, ctx) => ctx.today,
  DIAS: (a) => {
    const [end, start] = a;
    if (
      typeof end !== 'string' ||
      typeof start !== 'string' ||
      !ISO.test(end) ||
      !ISO.test(start)
    ) {
      return null;
    }
    return dayNumber(end) - dayNumber(start);
  },
};
const ALIASES: Record<string, string> = {
  ROUND: 'REDONDEAR',
  SUM: 'SUMA',
  AVERAGE: 'PROMEDIO',
  CONCATENAR: 'CONCAT',
  LEN: 'LARGO',
  UPPER: 'MAYUSC',
  LOWER: 'MINUSC',
  ISBLANK: 'ESBLANCO',
  AND: 'Y',
  OR: 'O',
  NOT: 'NO',
  TODAY: 'HOY',
  DAYS: 'DIAS',
  DÍAS: 'DIAS',
  IF: 'SI',
};

/** Nombres de función disponibles (para la ayuda del editor de fórmulas). */
export const FORMULA_FUNCTIONS = [
  { name: 'SI', example: 'SI({Estado} = "Hecho"; 1; 0)', help: 'Valor según una condición' },
  { name: 'REDONDEAR', example: 'REDONDEAR({Importe} * 1.21; 2)', help: 'Redondea a n decimales' },
  { name: 'SUMA', example: 'SUMA({A}; {B}; {C})', help: 'Suma los argumentos' },
  { name: 'PROMEDIO', example: 'PROMEDIO({A}; {B})', help: 'Media de los argumentos' },
  { name: 'MIN / MAX', example: 'MAX({A}; 0)', help: 'Mínimo o máximo' },
  { name: 'ABS', example: 'ABS({Diferencia})', help: 'Valor absoluto' },
  { name: 'DIAS', example: 'DIAS({Entrega}; HOY())', help: 'Días entre dos fechas' },
  { name: 'HOY', example: 'HOY() + 7', help: 'Fecha de hoy' },
  { name: 'CONCAT', example: 'CONCAT({KO}; " → "; {ES})', help: 'Une textos (también con &)' },
  { name: 'LARGO', example: 'LARGO({Texto})', help: 'Número de caracteres' },
  { name: 'MAYUSC / MINUSC', example: 'MAYUSC({Código})', help: 'Mayúsculas o minúsculas' },
  { name: 'Y / O / NO', example: 'Y({Pagado}; {Entregado})', help: 'Lógica' },
  { name: 'ESBLANCO', example: 'ESBLANCO({Notas})', help: '¿Está vacío?' },
] as const;

function evaluate(
  node: Node,
  lookup: (name: string) => FormulaValue,
  ctx: { today: string },
): FormulaValue {
  switch (node.k) {
    case 'num':
    case 'str':
    case 'bool':
      return node.v;
    case 'ref':
      return lookup(node.name);
    case 'neg':
      return -toNum(evaluate(node.e, lookup, ctx));
    case 'call': {
      const name = ALIASES[node.name] ?? node.name;
      if (name === 'SI') {
        if (node.args.length < 2) throw new FormulaError('SI necesita al menos 2 argumentos');
        const cond = toBool(evaluate(node.args[0]!, lookup, ctx));
        const branch = cond ? node.args[1] : node.args[2];
        return branch ? evaluate(branch, lookup, ctx) : null;
      }
      const fn = FUNCTIONS[name];
      if (!fn) throw new FormulaError(`Función desconocida: ${node.name}`);
      return fn(
        node.args.map((a) => evaluate(a, lookup, ctx)),
        ctx,
      );
    }
    case 'bin': {
      const l = evaluate(node.l, lookup, ctx);
      const r = evaluate(node.r, lookup, ctx);
      switch (node.op) {
        case '+':
        case '-': {
          if (typeof l === 'string' && ISO.test(l) && typeof r !== 'string') {
            return fromDayNumber(dayNumber(l) + (node.op === '+' ? 1 : -1) * toNum(r));
          }
          if (
            node.op === '-' &&
            typeof l === 'string' &&
            typeof r === 'string' &&
            ISO.test(l) &&
            ISO.test(r)
          ) {
            return dayNumber(l) - dayNumber(r);
          }
          return node.op === '+' ? toNum(l) + toNum(r) : toNum(l) - toNum(r);
        }
        case '*':
          return toNum(l) * toNum(r);
        case '/': {
          const d = toNum(r);
          if (d === 0) throw new FormulaError('División por cero');
          return toNum(l) / d;
        }
        case '%': {
          const d = toNum(r);
          if (d === 0) throw new FormulaError('División por cero');
          return toNum(l) % d;
        }
        case '^':
          return toNum(l) ** toNum(r);
        case '&':
          return toStr(l) + toStr(r);
        case '=':
          return compare(l, r) === 0;
        case '<>':
          return compare(l, r) !== 0;
        case '<':
          return compare(l, r) < 0;
        case '<=':
          return compare(l, r) <= 0;
        case '>':
          return compare(l, r) > 0;
        case '>=':
          return compare(l, r) >= 0;
      }
    }
  }
  throw new FormulaError('Expresión no válida');
}

/** Columnas a las que hace referencia una fórmula (para detectar referencias circulares). */
export function formulaReferences(src: string): string[] {
  const refs = new Set<string>();
  const walk = (n: Node) => {
    if (n.k === 'ref') refs.add(n.name);
    else if (n.k === 'neg') walk(n.e);
    else if (n.k === 'bin') {
      walk(n.l);
      walk(n.r);
    } else if (n.k === 'call') n.args.forEach(walk);
  };
  walk(parseFormula(src));
  return [...refs];
}

export type FormulaResult = { ok: true; value: FormulaValue } | { ok: false; error: string };

/**
 * Evalúa una fórmula. `lookup` devuelve el valor de una columna por su nombre (sin
 * distinguir mayúsculas); si la columna no existe debe lanzar FormulaError.
 */
export function evaluateFormula(
  src: string,
  lookup: (name: string) => FormulaValue,
  options: { today: string },
): FormulaResult {
  try {
    if (!src.trim()) return { ok: true, value: null };
    let value = evaluate(parseFormula(src), lookup, options);
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return { ok: false, error: 'Resultado no numérico' };
    }
    if (typeof value === 'number') value = Math.round(value * 1e10) / 1e10;
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof FormulaError ? error.message : 'Fórmula no válida',
    };
  }
}
