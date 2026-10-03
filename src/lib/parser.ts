import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { dataDir } from './db';
const exec = promisify(execFile);
export type Page = { page: number; text: string };
export function splitPages(pages: Page[]) {
  return pages
    .flatMap((p) => {
      const text = p.text.replace(/\u0000/g, '').trim();
      const out: Page[] = [];
      for (let start = 0; start < text.length; start += 1100)
        out.push({ page: p.page, text: text.slice(start, start + 1400) });
      return out;
    })
    .filter((x) => x.text.trim().length > 10);
}
function xmlText(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: true,
    processEntities: false,
    trimValues: false,
  });
  const tree = parser.parse(xml);
  const values: string[] = [];
  const walk = (node: unknown, key = '') => {
    if (typeof node === 'string' || typeof node === 'number') {
      if (key === 'a:t' || key === 'w:t') values.push(String(node));
      return;
    }
    if (Array.isArray(node)) return node.forEach((x) => walk(x, key));
    if (node && typeof node === 'object') Object.entries(node).forEach(([k, v]) => walk(v, k));
  };
  walk(tree);
  return values.join('\n');
}
export async function officePages(file: string, ext: string): Promise<Page[]> {
  const zip = new AdmZip(await readFile(file));
  const entries = zip.getEntries();
  if (entries.length > 10000 || entries.reduce((s, e) => s + e.header.size, 0) > 100 * 1024 * 1024)
    throw new Error('Office 解压大小超过限制。');
  if (ext === 'docx') {
    const e = zip.getEntry('word/document.xml');
    if (!e) throw new Error('不是有效的 Word 文档。');
    return [{ page: 1, text: xmlText(e.getData().toString()) }];
  }
  const slides = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort(
      (a, b) =>
        Number(a.entryName.match(/slide(\d+)\.xml/)![1]) -
        Number(b.entryName.match(/slide(\d+)\.xml/)![1]),
    );
  if (!slides.length) throw new Error('不是有效的 PowerPoint 文档。');
  return slides.map((s, i) => ({ page: i + 1, text: xmlText(s.getData().toString()) }));
}
async function pdfPages(file: string): Promise<Page[]> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: await readFile(file) });
  try {
    const info = await parser.getInfo();
    if (info.total > 300) throw new Error('首版限制每份课件最多 300 页，请拆分后上传。');
    const result = await parser.getText();
    return result.pages.map((p) => ({ page: p.num, text: p.text }));
  } finally {
    await parser.destroy();
  }
}
export async function parseFile(
  docId: string,
  ext: string,
): Promise<{ pages: Page[]; preview: string; warning: string }> {
  const file = path.join(dataDir, 'uploads', `${docId}.${ext}`);
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext))
    return { pages: [], preview: '', warning: '图片可预览；首版尚未启用 OCR，请补充文字版资料。' };
  if (ext === 'pdf') {
    const pages = await pdfPages(file);
    return {
      pages,
      preview: '',
      warning: pages.some((p) => p.text.trim().length < 20)
        ? '部分页面没有可提取文字，可能为扫描页或图片；暂未进行 OCR。'
        : '',
    };
  }
  if (['txt', 'md'].includes(ext))
    return { pages: [{ page: 1, text: await readFile(file, 'utf8') }], preview: '', warning: '' };
  let preview = '';
  let warning = '';
  let pages: Page[] = [];
  const soffice = process.env.SOFFICE_PATH;
  if (soffice) {
    try {
      const out = path.join(dataDir, 'previews');
      await mkdir(out, { recursive: true });
      const profile = path.join(dataDir, 'office-profile');
      await exec(
        soffice,
        [
          `-env:UserInstallation=${new URL(`file://${profile}`).href}`,
          '--headless',
          '--convert-to',
          'pdf',
          '--outdir',
          out,
          file,
        ],
        { timeout: 90000, maxBuffer: 1024 * 1024 },
      );
      await access(path.join(out, `${docId}.pdf`));
      preview = `${docId}.pdf`;
      if (ext === 'ppt' || ext === 'docx') pages = await pdfPages(path.join(out, preview));
    } catch {
      warning = 'Office 转 PDF 未成功；PPTX 将显示提取文字，检查 SOFFICE_PATH 后可重新解析。';
    }
  }
  if (ext === 'ppt' && !preview)
    throw new Error('旧版 .ppt 需要 LibreOffice。请配置 SOFFICE_PATH，或另存为 .pptx/PDF 后上传。');
  if (!pages.length) pages = await officePages(file, ext);
  if (!preview) warning ||= '当前为文字预览，未保留原排版；配置 LibreOffice 可生成 PDF 预览。';
  return { pages, preview, warning };
}
export async function saveUpload(docId: string, ext: string, bytes: Buffer) {
  await mkdir(path.join(dataDir, 'uploads'), { recursive: true });
  await writeFile(path.join(dataDir, 'uploads', `${docId}.${ext}`), bytes, { flag: 'wx' });
}
