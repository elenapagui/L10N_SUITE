import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CalendarEvent,
  Journal,
  Publication,
  Reference,
  ReferenceCollection,
  ReferenceImportResult,
  Submission,
} from '@l10n/shared';
import { createTestApp, multipart, type TestApp } from './helpers';

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: () => new Date('2026-10-02T10:00:00Z') });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t.cleanup();
});

async function req<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  status?: number,
): Promise<T> {
  const res = await t.app.inject({ method, url, payload: payload as object });
  if (status) expect(res.statusCode, res.body).toBe(status);
  else expect(res.statusCode, res.body).toBeLessThan(300);
  return (res.headers['content-type']?.toString().includes('json') ? res.json() : res.body) as T;
}

const BIB = `@article{mangiron2006,
  author = {Mangiron, Carme and O'Hagan, Minako},
  title = {Game localisation: unleashing imagination},
  journal = {The Journal of Specialised Translation},
  year = {2006}, volume = {6}, pages = {10--21}, doi = {10.26034/cm.jostrans.2006.6}
}
@book{bernal2015, author = {Bernal-Merino, Miguel {\\'A}.}, title = {Translation and localisation in video games}, publisher = {Routledge}, year = {2015}}`;

/** PDF mínimo con una línea de texto. */
function pdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj ${o} endobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

describe('publicaciones, envíos y revistas', () => {
  it('sigue un artículo desde la idea hasta la aceptación', async () => {
    const journal = await req<Journal>(
      'POST',
      '/api/journals',
      {
        name: 'MonTI',
        issn: '1889-4178',
        indexing: ['Scopus', 'ESCI'],
        quartile: 'Q2',
        openAccess: 'diamond',
      },
      201,
    );
    const game = await req<{ id: string }>('POST', '/api/games', { title: 'Crónicas de Aether' });
    const pub = await req<Publication>(
      'POST',
      '/api/publications',
      {
        title: 'Los honoríficos coreanos en la localización de videojuegos',
        keywords: ['localización', 'coreano'],
        journalId: journal.id,
        deadline: '2026-11-15',
        authors: [
          {
            name: 'Elena Pagui',
            isMe: true,
            corresponding: true,
            affiliation: 'Universidad de Granada',
          },
        ],
        gameIds: [game.id],
      },
      201,
    );
    expect(pub).toMatchObject({ status: 'idea', journalName: 'MonTI', gameIds: [game.id] });
    expect(pub.authors[0]).toMatchObject({ name: 'Elena Pagui', isMe: true });

    // Tarea vinculada
    await req(
      'POST',
      '/api/tasks',
      {
        title: 'Revisar el marco teórico',
        relatedType: 'publication',
        relatedId: pub.id,
        dueDate: '2026-10-20',
      },
      201,
    );
    expect((await req<Publication>('GET', `/api/publications/${pub.id}`)).openTaskCount).toBe(1);

    // Envío: el estado pasa a «Enviado»; la decisión, a «Cambios solicitados»; el reenvío, a «Reenviado».
    const s1 = await req<Submission>(
      'POST',
      '/api/submissions',
      {
        publicationId: pub.id,
        journalId: journal.id,
        submittedAt: '2026-06-01',
        manuscriptId: 'MONTI-2026-042',
      },
      201,
    );
    expect((await req<Publication>('GET', `/api/publications/${pub.id}`)).status).toBe('submitted');
    const decided = await req<Submission>('PATCH', `/api/submissions/${s1.id}`, {
      decision: 'major',
      decisionAt: '2026-08-30',
      revisionDue: '2026-10-30',
    });
    expect(decided.responseDays).toBe(90);
    expect((await req<Publication>('GET', `/api/publications/${pub.id}`)).status).toBe('revisions');
    await req(
      'POST',
      '/api/submissions',
      { publicationId: pub.id, journalId: journal.id, submittedAt: '2026-10-25' },
      201,
    );
    expect((await req<Publication>('GET', `/api/publications/${pub.id}`)).status).toBe(
      'resubmitted',
    );

    const j = await req<Journal>('GET', `/api/journals/${journal.id}`);
    // «Cambios mayores» no es una decisión final: aún no hay tasa de aceptación.
    expect(j).toMatchObject({ submissionCount: 2, avgResponseDays: 90, acceptanceRate: null });

    // El calendario muestra el plazo y la fecha de entrega de los cambios.
    const events = await req<CalendarEvent[]>('GET', '/api/calendar?from=2026-10-01&to=2026-11-30');
    expect(
      events
        .filter((e) => e.kind === 'publication' || e.kind === 'submission')
        .map((e) => [e.kind, e.date, e.done]),
    ).toEqual([
      ['submission', '2026-10-30', true],
      ['publication', '2026-11-15', false],
    ]);

    // Papelera y búsqueda
    expect(
      (await req<{ entityId: string }[]>('GET', '/api/search?q=honorificos')).map(
        (r) => r.entityId,
      ),
    ).toContain(pub.id);
    await req('DELETE', `/api/publications/${pub.id}`);
    expect(await req<unknown[]>('GET', '/api/publications')).toHaveLength(0);
  });
});

describe('biblioteca de referencias', () => {
  it('importa BibTeX sin duplicados, exporta y deshace la importación', async () => {
    const first = await req<ReferenceImportResult>('POST', '/api/references/import', { text: BIB });
    expect(first).toMatchObject({ created: 2, duplicates: 0 });
    const again = await t.app.inject({
      method: 'POST',
      url: '/api/references/import',
      ...multipart([{ filename: 'zotero.bib', content: BIB }]),
    });
    expect(again.json()).toMatchObject({ created: 0, duplicates: 2 });

    const refs = await req<Reference[]>('GET', '/api/references');
    expect(refs.map((r) => r.citationKey).sort()).toEqual(['bernal2015', 'mangiron2006']);
    const mangiron = refs.find((r) => r.citationKey === 'mangiron2006')!;
    expect(mangiron.apa).toBe(
      "Mangiron, C. y O'Hagan, M. (2006). Game localisation: unleashing imagination. The Journal of Specialised Translation, 6, 10–21. https://doi.org/10.26034/cm.jostrans.2006.6",
    );
    expect(mangiron.apaHtml).toContain('<i>The Journal of Specialised Translation</i>');

    const bib = await req<string>('GET', '/api/references/export?format=bibtex');
    expect(bib).toContain('@article{mangiron2006,');
    const apa = await req<string>(
      'GET',
      `/api/references/export?format=apa&ids=${refs.map((r) => r.id).join(',')}`,
    );
    expect(apa.indexOf('Bernal-Merino')).toBeLessThan(apa.indexOf('Mangiron'));
    const ris = await req<string>('GET', '/api/references/export?format=ris');
    expect(ris).toContain('TY  - JOUR');

    await req('POST', `/api/import/batches/${first.batchId}/undo`);
    expect(await req<unknown[]>('GET', '/api/references')).toHaveLength(0);
  });

  it('alta por DOI (doi.org), notas, citas, colecciones, juegos y búsqueda', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            type: 'article-journal',
            title: ['Translating <i>honorifics</i>'],
            author: [{ family: 'Kim', given: 'Ji-hye' }],
            'container-title': 'Perspectives',
            issued: { 'date-parts': [[2021, 5]] },
            volume: '29',
            issue: '3',
            page: '400-415',
            ISSN: ['0907-676X'],
            abstract: '<jats:p>Honorifics in Korean games.</jats:p>',
          }),
          { status: 200, headers: { 'Content-Type': 'application/vnd.citationstyles.csl+json' } },
        ),
    );
    const looked = await req<{
      csl: { title: string; DOI: string; abstract: string };
      duplicateOf: string | null;
      apa: string;
    }>('POST', '/api/references/doi', { doi: 'https://doi.org/10.1080/0907676X.2021.1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://doi.org/10.1080/0907676x.2021.1',
      expect.objectContaining({ headers: { Accept: 'application/vnd.citationstyles.csl+json' } }),
    );
    expect(looked.csl).toMatchObject({
      title: 'Translating honorifics',
      DOI: '10.1080/0907676x.2021.1',
      abstract: 'Honorifics in Korean games.',
    });
    expect(looked.duplicateOf).toBeNull();

    const game = await req<{ id: string }>('POST', '/api/games', { title: 'Crónicas de Aether' });
    const col = await req<ReferenceCollection>(
      'POST',
      '/api/reference-collections',
      { name: 'Tesis' },
      201,
    );
    const ref = await req<Reference>(
      'POST',
      '/api/references',
      {
        csl: looked.csl,
        collectionIds: [col.id],
        gameIds: [game.id],
        notes: 'Clave para el marco teórico',
      },
      201,
    );
    expect(ref).toMatchObject({
      year: 2021,
      creators: 'Kim',
      collectionIds: [col.id],
      gameIds: [game.id],
    });
    expect(
      (
        await req<{ duplicateOf: string | null }>('POST', '/api/references/doi', {
          doi: '10.1080/0907676X.2021.1',
        })
      ).duplicateOf,
    ).toBe(ref.id);

    await req(
      'POST',
      '/api/quotes',
      { referenceId: ref.id, text: 'Los honoríficos codifican la jerarquía social', page: '402' },
      201,
    );
    expect((await req<Reference[]>('GET', '/api/references?q=jerarquia')).map((r) => r.id)).toEqual(
      [ref.id],
    );
    expect((await req<Reference[]>('GET', `/api/references?collectionId=${col.id}`)).length).toBe(
      1,
    );
    expect((await req<Reference[]>('GET', `/api/references?gameId=${game.id}`)).length).toBe(1);
    const updated = await req<Reference>('PATCH', `/api/references/${ref.id}`, {
      readStatus: 'read',
      rating: 4,
    });
    expect(updated).toMatchObject({
      readStatus: 'read',
      rating: 4,
      notes: 'Clave para el marco teórico',
    });
    expect((await req<ReferenceCollection[]>('GET', '/api/reference-collections'))[0]!.count).toBe(
      1,
    );

    // Bibliografía de una publicación
    const pub = await req<Publication>(
      'POST',
      '/api/publications',
      { title: 'Mi artículo', referenceIds: [ref.id] },
      201,
    );
    expect((await req<Reference>('GET', `/api/references/${ref.id}`)).publicationIds).toEqual([
      pub.id,
    ]);

    // Papelera
    await req('DELETE', `/api/references/${ref.id}`);
    expect((await req<Publication>('GET', `/api/publications/${pub.id}`)).referenceIds).toEqual([]);
    await req('POST', '/api/trash/restore', { entityType: 'reference', entityId: ref.id });
    expect((await req<Publication>('GET', `/api/publications/${pub.id}`)).referenceIds).toEqual([
      ref.id,
    ]);
  });

  it('extrae el texto del PDF para buscar dentro', async () => {
    const ref = await req<Reference>(
      'POST',
      '/api/references',
      { csl: { type: 'book', title: 'Libro con PDF' } },
      201,
    );
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/references/${ref.id}/pdf`,
      ...multipart([
        {
          filename: 'libro.pdf',
          content: pdf('Transcreacion de nombres de habilidades'),
          type: 'application/pdf',
        },
      ]),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ extracted: true, hasFullText: true });
    expect(
      (await req<Reference[]>('GET', '/api/references?q=transcreacion')).map((r) => r.id),
    ).toEqual([ref.id]);
    const content = await t.app.inject({
      url: `/api/attachments/${res.json().pdfAttachmentId}/content`,
    });
    expect(content.headers['content-type']).toContain('application/pdf');
    await t.app
      .inject({
        method: 'POST',
        url: `/api/references/${ref.id}/pdf`,
        ...multipart([{ filename: 'nota.txt', content: 'hola' }]),
      })
      .then((r) => expect(r.statusCode).toBe(400));
  });
});
