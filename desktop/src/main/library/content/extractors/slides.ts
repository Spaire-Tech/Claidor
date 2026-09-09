import fs from 'fs';
import JSZip from 'jszip';

import type { LibraryTextSection } from '../../../../shared/library/chunker';
import { LibraryContentLimits } from '../../../../shared/library/contentConstants';
import { corruptFileError, decodeXmlEntities, type LibraryExtractionResult } from './shared';

/**
 * PowerPoint through jszip and the slide XML: the `<a:t>` runs of every
 * `<a:p>` paragraph, one section per slide, with the speaker notes appended.
 */

const SLIDE_ENTRY = /^ppt\/slides\/slide(\d+)\.xml$/;
const PARAGRAPH = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
const TEXT_RUN = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>|<a:tab\b[^>]*\/>/g;
/** Field placeholders (slide number, date) carry no content worth indexing. */
const FIELD = /<a:fld\b[^>]*>[\s\S]*?<\/a:fld>/g;
const NOTES_RELATION = /Target="[^"]*notesSlides\/(notesSlide\d+\.xml)"/;

/** Paragraph text from slide XML; exported for the tests. */
export const textFromSlideXml = (xml: string): string => {
  const lines: string[] = [];
  const withoutFields = xml.replace(FIELD, '');
  for (const paragraph of withoutFields.matchAll(PARAGRAPH)) {
    let line = '';
    for (const run of paragraph[1].matchAll(TEXT_RUN)) {
      if (run[1] !== undefined) line += decodeXmlEntities(run[1]);
      else if (run[0].startsWith('<a:br')) line += '\n';
      else line += '\t';
    }
    const trimmed = line.trim();
    if (trimmed) lines.push(trimmed);
  }
  return lines.join('\n');
};

const readEntry = async (zip: JSZip, name: string): Promise<string | null> => {
  const file = zip.file(name);
  if (!file) return null;
  try {
    return await file.async('string');
  } catch (error) {
    console.warn(`[LibraryWorker] ${name} could not be read from the presentation`, error);
    return null;
  }
};

const resolveNotesEntry = async (zip: JSZip, slideNumber: number): Promise<string> => {
  const rels = await readEntry(zip, `ppt/slides/_rels/slide${slideNumber}.xml.rels`);
  const match = rels?.match(NOTES_RELATION);
  return `ppt/notesSlides/${match ? match[1] : `notesSlide${slideNumber}.xml`}`;
};

export const extractSlidesDocument = async (filePath: string): Promise<LibraryExtractionResult> => {
  const buffer = await fs.promises.readFile(filePath);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (error) {
    throw corruptFileError(error);
  }
  const slideNumbers = Object.keys(zip.files)
    .map(name => {
      const match = name.match(SLIDE_ENTRY);
      return match ? Number(match[1]) : null;
    })
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  const sections: LibraryTextSection[] = [];
  let chars = 0;
  for (const slideNumber of slideNumbers) {
    if (chars >= LibraryContentLimits.MaxTextChars) break;
    const slideXml = await readEntry(zip, `ppt/slides/slide${slideNumber}.xml`);
    if (slideXml === null) continue;
    let text = textFromSlideXml(slideXml);
    const notesXml = await readEntry(zip, await resolveNotesEntry(zip, slideNumber));
    if (notesXml !== null) {
      const notes = textFromSlideXml(notesXml);
      if (notes) text = text ? `${text}\n\nNotes:\n${notes}` : `Notes:\n${notes}`;
    }
    if (!text.trim()) continue;
    sections.push({ locator: { slide: slideNumber }, text });
    chars += text.length;
  }
  return { sections, pageCount: slideNumbers.length };
};
