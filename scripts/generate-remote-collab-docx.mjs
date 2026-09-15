import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// 用法：node scripts/generate-remote-collab-docx.mjs [源 md] [输出 docx]
//   默认：docs/tutorials/remote-collab-usage-guide.md → 同名 .docx
//   例：  node scripts/generate-remote-collab-docx.mjs docs/tutorials/topology-deploy-tutorial.md
// docx 不入库（.gitignore docs/tutorials/*.docx），按需生成。
const ROOT = process.cwd();
const SOURCE_MD = path.resolve(ROOT, process.argv[2] ?? 'docs/tutorials/remote-collab-usage-guide.md');
const OUTPUT_DOCX = path.resolve(
  ROOT,
  process.argv[3] ?? SOURCE_MD.replace(/\.md$/i, '.docx'),
);
const MEDIA_DIR = path.dirname(SOURCE_MD);

const markdown = readFileSync(SOURCE_MD, 'utf8');

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const day =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, day };
}

function u16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

function u32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0);
  return buf;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, day } = dosDateTime();

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const crc = crc32(data);
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(time),
      u16(day),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
    ]);

    localParts.push(localHeader, data);

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(time),
      u16(day),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...localParts, central, end]);
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function textRuns(text) {
  const escaped = escapeXml(text);
  return `<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r>`;
}

function paragraph(text, style = 'Normal') {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${styleXml}${textRuns(text)}</w:p>`;
}

function codeParagraph(text) {
  return `<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function pngSize(buffer) {
  if (buffer.toString('ascii', 1, 4) !== 'PNG') {
    return { width: 1200, height: 720 };
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function imageParagraph(relId, alt, widthPx, heightPx) {
  const maxWidthEmu = 6_200_000;
  const ratio = heightPx / widthPx;
  const widthEmu = maxWidthEmu;
  const heightEmu = Math.round(widthEmu * ratio);
  return `<w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
          <wp:docPr id="${relId.replace('rId', '')}" name="${escapeXml(alt)}" descr="${escapeXml(alt)}"/>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="0" name="${escapeXml(alt)}"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;
}

function normalizeInline(text) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

// --- Markdown 表格 → Word 表格 ------------------------------------------
const isTableRow = (line) => /^\|.*\|$/.test(line.trim());
const isTableDivider = (line) => /^\|[\s:|-]+\|$/.test(line.trim()) && line.includes('-');

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => normalizeInline(cell.trim()));
}

function tableCell(text, { header = false, width } = {}) {
  const shading = header ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF2F7"/>' : '';
  const runProps = header ? '<w:rPr><w:b/></w:rPr>' : '';
  const widthXml = width ? `<w:tcW w:w="${width}" w:type="dxa"/>` : '';
  return `<w:tc><w:tcPr>${widthXml}${shading}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:r>${runProps}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p></w:tc>`;
}

/** rows[0] 当表头；列宽按整页 9638 dxa 均分 */
function tableXml(rows) {
  const columns = Math.max(...rows.map((r) => r.length));
  const width = Math.floor(9638 / columns);
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C9D2DC"/>`)
    .join('');
  const grid = Array.from({ length: columns }, () => `<w:gridCol w:w="${width}"/>`).join('');
  const body = rows
    .map((cells, rowIndex) => {
      const padded = [...cells, ...Array.from({ length: columns - cells.length }, () => '')];
      const header = rowIndex === 0;
      const rowProps = header ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
      return `<w:tr>${rowProps}${padded.map((c) => tableCell(c, { header, width })).join('')}</w:tr>`;
    })
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

const media = [];
const bodyParts = [];
let inCode = false;
let pendingTable = [];

function flushTable() {
  if (!pendingTable.length) return;
  bodyParts.push(tableXml(pendingTable));
  bodyParts.push('<w:p/>');
  pendingTable = [];
}

for (const rawLine of markdown.split(/\r?\n/)) {
  const line = rawLine.trimEnd();

  if (line.startsWith('```')) {
    flushTable();
    inCode = !inCode;
    continue;
  }

  if (inCode) {
    bodyParts.push(codeParagraph(line));
    continue;
  }

  if (isTableRow(line)) {
    if (!isTableDivider(line)) pendingTable.push(splitRow(line));
    continue;
  }
  flushTable();

  if (!line.trim()) {
    bodyParts.push('<w:p/>');
    continue;
  }

  const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (image) {
    const [, alt, relativePath] = image;
    const imagePath = path.resolve(MEDIA_DIR, relativePath);
    const data = readFileSync(imagePath);
    const { width, height } = pngSize(data);
    const index = media.length + 1;
    const extension = path.extname(imagePath).slice(1).toLowerCase() || 'png';
    const fileName = `image${index}.${extension}`;
    const relId = `rId${index}`;
    media.push({ relId, fileName, data });
    bodyParts.push(imageParagraph(relId, alt, width, height));
    bodyParts.push(paragraph(alt, 'Caption'));
    continue;
  }

  if (line.startsWith('# ')) {
    bodyParts.push(paragraph(normalizeInline(line.slice(2)), 'Title'));
  } else if (line.startsWith('## ')) {
    bodyParts.push(paragraph(normalizeInline(line.slice(3)), 'Heading1'));
  } else if (line.startsWith('### ')) {
    bodyParts.push(paragraph(normalizeInline(line.slice(4)), 'Heading2'));
  } else if (line.startsWith('> ')) {
    bodyParts.push(paragraph(normalizeInline(line.slice(2)), 'Quote'));
  } else if (line.startsWith('- ')) {
    bodyParts.push(paragraph(`• ${normalizeInline(line.slice(2))}`, 'ListParagraph'));
  } else if (/^\d+\.\s/.test(line)) {
    bodyParts.push(paragraph(normalizeInline(line), 'ListParagraph'));
  } else {
    bodyParts.push(paragraph(normalizeInline(line)));
  }
}
flushTable();

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyParts.join('\n')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
${media.map((item) => `  <Relationship Id="${item.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.fileName}"/>`).join('\n')}
</Relationships>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="40"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr><w:pPr><w:spacing w:after="240"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:rPr><w:b/><w:sz w:val="32"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr><w:pPr><w:spacing w:before="360" w:after="160"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:rPr><w:b/><w:sz w:val="26"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr><w:pPr><w:spacing w:before="260" w:after="120"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="360"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:rPr><w:i/><w:color w:val="6B7280"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="180"/></w:pPr><w:rPr><w:i/><w:color w:val="6B7280"/><w:sz w:val="18"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:pPr><w:spacing w:before="80" w:after="80"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`;

const created = new Date().toISOString();
const coreProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>异地协同监控台使用教程</dc:title>
  <dc:creator>Cursor</dc:creator>
  <cp:lastModifiedBy>Cursor</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
</cp:coreProperties>`;

const appProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>plant-collab-monitor docx generator</Application>
</Properties>`;

const entries = [
  { name: '[Content_Types].xml', data: contentTypes },
  { name: '_rels/.rels', data: rootRels },
  { name: 'docProps/core.xml', data: coreProps },
  { name: 'docProps/app.xml', data: appProps },
  { name: 'word/document.xml', data: documentXml },
  { name: 'word/styles.xml', data: styles },
  { name: 'word/_rels/document.xml.rels', data: rels },
  ...media.map((item) => ({ name: `word/media/${item.fileName}`, data: item.data })),
];

writeFileSync(OUTPUT_DOCX, createZip(entries));
console.log(`Wrote ${OUTPUT_DOCX}`);
console.log(`Embedded ${media.length} images`);
