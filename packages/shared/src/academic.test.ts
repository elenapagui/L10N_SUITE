import { describe, expect, it } from 'vitest';
import {
  apaInText,
  apaText,
  decodeLatex,
  duplicateKey,
  formatApa,
  parseBibtex,
  parseRis,
  toBibtex,
  toRis,
  type CslItem,
} from '.';

const BIB = `
@string{tis = "Translation Studies"}
% comentario
@article{mangiron2007,
  author = {Mangiron, Carme and O'Hagan, Minako},
  title = {Game {Localisation}: Unleashing Imagination with \`\`Restricted'' Translation},
  journal = {The Journal of Specialised Translation},
  year = 2006,
  volume = {6},
  pages = {10--21},
  doi = {https://doi.org/10.1234/JOST.2006.6}
}
@incollection{bernal2015,
  author = {Bernal-Merino, Miguel {\\'A}ngel},
  editor = {Pérez-González, Luis and Kim, Ji-hye},
  title = {La traducci{\\'o}n de videojuegos},
  booktitle = tis # { Reader},
  publisher = {Routledge},
  year = {2015},
  pages = {155--170}
}
@phdthesis{lopez2020, author = {L\\'{o}pez Ib\\'a\\~nez, Ana}, title = {Honor\\'ificos coreanos en espa\\~nol}, school = {Universidad de Granada}, year = {2020}}
@misc{unesco, author = {{UNESCO}}, title = {Informe mundial}, year = {2022}, url = {https://unesco.org/x}}
`;

describe('BibTeX', () => {
  it('descodifica LaTeX', () => {
    expect(decodeLatex("{\\'A}ngel Ib\\'a\\~nez Mu\\\"{n}oz \\c{c} \\ss --- ``hola'' 10--20")).toBe(
      'Ángel Ibáñez Mun̈oz ç ß— “hola” 10–20',
    );
  });
  it('descodifica las órdenes de texto de Zotero', () => {
    expect(
      decodeLatex('{\\textquoteleft}Restricted{\\textquoteright} \\ldots{} \\textemdash fin'),
    ).toBe('‘Restricted’ … —fin');
  });
  it('lee entradas, macros, nombres, páginas y DOI', () => {
    const [a, b, c, d] = parseBibtex(BIB);
    expect(a).toMatchObject({
      type: 'article-journal',
      'citation-key': 'mangiron2007',
      title: 'Game Localisation: Unleashing Imagination with “Restricted” Translation',
      author: [
        { family: 'Mangiron', given: 'Carme' },
        { family: "O'Hagan", given: 'Minako' },
      ],
      'container-title': 'The Journal of Specialised Translation',
      issued: { 'date-parts': [[2006]] },
      page: '10-21',
      DOI: '10.1234/jost.2006.6',
    });
    expect(b).toMatchObject({
      type: 'chapter',
      'container-title': 'Translation Studies Reader',
      author: [{ family: 'Bernal-Merino', given: 'Miguel Ángel' }],
      editor: [
        { family: 'Pérez-González', given: 'Luis' },
        { family: 'Kim', given: 'Ji-hye' },
      ],
    });
    expect(c).toMatchObject({
      type: 'thesis',
      genre: 'Tesis doctoral',
      publisher: 'Universidad de Granada',
      title: 'Honoríficos coreanos en español',
    });
    expect(c!.author).toEqual([{ family: 'López Ibáñez', given: 'Ana' }]);
    expect(d!.author).toEqual([{ literal: 'UNESCO' }]);
  });
  it('exporta y vuelve a leer sin perder datos', () => {
    const items = parseBibtex(BIB);
    const again = parseBibtex(toBibtex(items));
    expect(again.map((i) => [i.type, i.title, i.author?.length, i.page])).toEqual(
      items.map((i) => [i.type, i.title, i.author?.length, i.page]),
    );
    expect(toBibtex(items)).toContain('pages = {10--21}');
  });
  it('respeta las letras especiales, \\textbackslash y las órdenes desconocidas', () => {
    expect(decodeLatex("\\L\\'od\\'z")).toBe('Łódź');
    expect(decodeLatex('a\\textbackslash{}b \\& c')).toBe('a\\b & c');
    expect(decodeLatex('\\textit{a {b} c} \\href{http://x}{enlace}')).toBe('a b c enlace');
    expect(decodeLatex('\\url{x}')).toBe('x');
  });
  it('no descodifica la URL ni el DOI', () => {
    const [item] = parseBibtex(`@misc{x,
  title = {Web},
  url = {\\url{https://example.org/~ana/a--b\\_c}},
  doi = {10.1000/a--b}
}`);
    expect(item!.URL).toBe('https://example.org/~ana/a--b_c');
    expect(item!.DOI).toBe('10.1000/a--b');
  });
  it('escapa al exportar y no repite claves', () => {
    const odd: CslItem = {
      id: 'x',
      type: 'book',
      title: 'C:\\juegos ~ 50 $ ^ 100% & más_cosas #1',
    };
    const out = toBibtex([odd]);
    expect(parseBibtex(out)[0]!.title).toBe(odd.title);
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...odd,
      id: String(i),
      'citation-key': 'kim2020',
    }));
    const keys = [...toBibtex(many).matchAll(/^@\w+\{([^,]+),/gm)].map((m) => m[1]!);
    expect(new Set(keys).size).toBe(30);
    for (const k of keys) expect(k).toMatch(/^kim2020[a-z]*$/);
  });
});

describe('RIS', () => {
  const RIS = `TY  - JOUR
AU  - Mangiron, Carme
AU  - O'Hagan, Minako
TI  - Game localisation
T2  - JoSTrans
PY  - 2006/06/01
VL  - 6
SP  - 10
EP  - 21
DO  - 10.1234/jost.2006.6
KW  - videojuegos
KW  - localización
ER  - 

TY  - BOOK
AU  - Bernal-Merino, Miguel Á.
TI  - Translation and localisation in video games
PB  - Routledge
CY  - Nueva York
PY  - 2015
SN  - 9780415743297
ER  - 
`;
  it('lee y exporta', () => {
    const [a, b] = parseRis(RIS);
    expect(a).toMatchObject({
      type: 'article-journal',
      page: '10-21',
      issued: { 'date-parts': [[2006, 6, 1]] },
      keyword: 'videojuegos, localización',
    });
    expect(b).toMatchObject({
      type: 'book',
      publisher: 'Routledge',
      'publisher-place': 'Nueva York',
      ISBN: '9780415743297',
    });
    const again = parseRis(toRis([a!, b!]));
    expect(again[0]).toMatchObject({
      title: 'Game localisation',
      DOI: '10.1234/jost.2006.6',
      page: '10-21',
    });
    expect(duplicateKey(a!)).toBe('doi:10.1234/jost.2006.6');
  });
});

describe('APA 7 en español', () => {
  const article: CslItem = {
    type: 'article-journal',
    author: [
      { family: 'Mangiron', given: 'Carme' },
      { family: "O'Hagan", given: 'Minako' },
    ],
    title: 'Game localisation: Unleashing imagination with “restricted” translation',
    'container-title': 'The Journal of Specialised Translation',
    volume: 6,
    issue: 2,
    page: '10-21',
    issued: { 'date-parts': [[2006]] },
    DOI: '10.1234/jost.2006.6',
  };
  it('artículo de revista con cursivas en revista y volumen', () => {
    expect(apaText(article)).toBe(
      "Mangiron, C. y O'Hagan, M. (2006). Game localisation: Unleashing imagination with “restricted” translation. The Journal of Specialised Translation, 6(2), 10–21. https://doi.org/10.1234/jost.2006.6",
    );
    const italics = formatApa(article)
      .filter((r) => r.italic)
      .map((r) => r.text);
    expect(italics).toEqual(['The Journal of Specialised Translation', '6']);
  });
  it('libro, capítulo, tesis, videojuego, web y sin fecha', () => {
    expect(
      apaText({
        type: 'book',
        author: [{ family: 'Bernal-Merino', given: 'Miguel Ángel' }],
        title: 'Translation and localisation in video games',
        edition: 2,
        publisher: 'Routledge',
        issued: { 'date-parts': [[2015]] },
      }),
    ).toBe(
      'Bernal-Merino, M. Á. (2015). Translation and localisation in video games (2.ª ed.). Routledge.',
    );
    expect(
      apaText({
        type: 'chapter',
        author: [{ family: 'Pérez', given: 'Ana' }],
        editor: [
          { family: 'Kim', given: 'Ji-hye' },
          { family: 'López', given: 'Luis' },
        ],
        title: 'La traducción de los honoríficos',
        'container-title': 'Estudios de traducción coreano-español',
        page: '155-170',
        publisher: 'Comares',
        issued: { 'date-parts': [[2021]] },
      }),
    ).toBe(
      'Pérez, A. (2021). La traducción de los honoríficos. En J.-H. Kim y L. López (Eds.), Estudios de traducción coreano-español (pp. 155–170). Comares.',
    );
    expect(
      apaText({
        type: 'thesis',
        author: [{ family: 'López', given: 'Ana' }],
        title: 'Honoríficos coreanos',
        publisher: 'Universidad de Granada',
        issued: { 'date-parts': [[2020]] },
      }),
    ).toBe('López, A. (2020). Honoríficos coreanos [Tesis doctoral, Universidad de Granada].');
    expect(
      apaText({
        type: 'software',
        author: [{ literal: 'Nexon' }],
        title: 'MapleStory',
        publisher: 'Nexon',
        issued: { 'date-parts': [[2003]] },
      }),
    ).toBe('Nexon. (2003). MapleStory [Videojuego].');
    expect(
      apaText({
        type: 'webpage',
        author: [{ literal: 'Asetrad' }],
        title: '¿Qué es la localización?',
        'container-title': 'Blog de Asetrad',
        URL: 'https://asetrad.org/x',
        issued: { 'date-parts': [[2023, 3, 4]] },
      }),
    ).toBe(
      'Asetrad. (2023, 4 de marzo). ¿Qué es la localización? Blog de Asetrad. https://asetrad.org/x',
    );
    expect(apaText({ type: 'book', title: 'Libro anónimo', publisher: 'Editorial' })).toBe(
      'Libro anónimo. (s. f.). Editorial.',
    );
  });
  it('citas en el texto', () => {
    expect(apaInText(article)).toBe("(Mangiron y O'Hagan, 2006)");
    expect(
      apaInText({ ...article, author: [...article.author!, { family: 'Kim', given: 'J.' }] }, '15'),
    ).toBe('(Mangiron et al., 2006, p. 15)');
  });
});
