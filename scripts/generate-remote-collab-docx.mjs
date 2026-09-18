import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  // 「……依次是：」这种引出下面列表 / 表格的段落，跟它带的内容待在同一页
  const keepNext = /[：:]$/.test(text.trim()) ? '<w:keepNext/>' : '';
  const styleXml = style || keepNext ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${keepNext}</w:pPr>` : '';
  return `<w:p>${styleXml}${textRuns(text)}</w:p>`;
}

/** 教程里图下面那行 `*说明*`：斜体小字、居中，跟在图注（alt）后面 */
function captionNoteParagraph(text) {
  return `<w:p><w:pPr><w:pStyle w:val="CaptionNote"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
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

/** 正文可用宽度：A4 11906 twips 减左右各 1134 = 9638 twips，1 twip = 635 EMU */
const TEXT_WIDTH_TWIPS = 9638;
const TEXT_WIDTH_EMU = TEXT_WIDTH_TWIPS * 635;

function imageParagraph(relId, alt, widthPx, heightPx) {
  // 以前写死 6_200_000 EMU（488 pt），比 482 pt 的正文宽 6 pt，每张截图都探进右边距
  const maxWidthEmu = TEXT_WIDTH_EMU;
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
    .replace(/~~([^~]+)~~/g, '$1')
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

/** 中英混排下一列内容大概要多宽：汉字算 2、其余算 1，取该列各行的最大值再开方压缩（长文本列别把短列挤没） */
function columnWeight(cells) {
  const longest = Math.max(
    1,
    ...cells.map((cell) => [...cell].reduce((n, ch) => n + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1), 0)),
  );
  return Math.sqrt(longest);
}

/**
 * rows[0] 当表头；列宽按各列内容长度加权分配整页 9638 dxa，单列夹在 14%–64% 之间。
 * 以前是均分：「步骤 / 结果」「项 / 值」这种一短一长的两列表，短列白占一半、长列挤成竖条。
 */
function tableXml(rows) {
  const columns = Math.max(...rows.map((r) => r.length));
  const weights = Array.from({ length: columns }, (_, i) => columnWeight(rows.map((r) => r[i] ?? '')));
  const total = weights.reduce((a, b) => a + b, 0);
  let shares = weights.map((w) => Math.min(0.64, Math.max(0.14, w / total)));
  const shareSum = shares.reduce((a, b) => a + b, 0);
  shares = shares.map((s) => s / shareSum);
  const widths = shares.map((s) => Math.floor(TEXT_WIDTH_TWIPS * s));
  widths[widths.length - 1] += TEXT_WIDTH_TWIPS - widths.reduce((a, b) => a + b, 0);
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C9D2DC"/>`)
    .join('');
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const body = rows
    .map((cells, rowIndex) => {
      const padded = [...cells, ...Array.from({ length: columns - cells.length }, () => '')];
      const header = rowIndex === 0;
      const rowProps = header ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
      return `<w:tr>${rowProps}${padded.map((c, i) => tableCell(c, { header, width: widths[i] })).join('')}</w:tr>`;
    })
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_WIDTH_TWIPS}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

const media = [];
const bodyParts = [];
let inCode = false;
let pendingTable = [];
/** 文档属性里的标题：取第一个一级标题，没有就用旧的固定值 */
let docTitle = '';

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
    // 标题 / 「……：」引出段后面 md 里那个空行不落成空段：空段会把 keepNext 吃掉（标题只跟空段待一页，
    // 表格照样翻到下一页），标题样式自带 after 间距也不需要它
    const prev = bodyParts[bodyParts.length - 1] ?? '';
    if (/<w:keepNext\/>/.test(prev) || /w:pStyle w:val="(Title|Heading1|Heading2)"/.test(prev)) continue;
    bodyParts.push('<w:p/>');
    continue;
  }

  const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (image) {
    const [, alt, relativePath] = image;
    let imagePath = path.resolve(MEDIA_DIR, relativePath);
    // .svg 直接塞进 docx Word 打不开（「文件可能已经损坏」——usage-guide 那份一直如此）；
    // 图旁边有同名 .png 就用它，没有再原样嵌入并登记内容类型。
    if (imagePath.toLowerCase().endsWith('.svg') && existsSync(imagePath.replace(/\.svg$/i, '.png'))) {
      imagePath = imagePath.replace(/\.svg$/i, '.png');
    }
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

  const captionNote = line.match(/^\*([^*].*[^*])\*$/);
  if (captionNote) {
    // 教程生成器在每张图下面放一行 `*说明*`；以前当普通段落输出，星号原样留在正文里。
    // md 里图与说明之间隔一个空行，这里把那一空段吃掉，说明紧贴图注。
    if (bodyParts[bodyParts.length - 1] === '<w:p/>') bodyParts.pop();
    bodyParts.push(captionNoteParagraph(normalizeInline(captionNote[1])));
    continue;
  }

  if (line.startsWith('# ')) {
    if (!docTitle) docTitle = normalizeInline(line.slice(2));
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
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="gif" ContentType="image/gif"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
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
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="40"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr><w:pPr><w:keepNext/><w:spacing w:after="240"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:rPr><w:b/><w:sz w:val="32"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:rPr><w:b/><w:sz w:val="26"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="360"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:rPr><w:i/><w:color w:val="6B7280"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr><w:rPr><w:i/><w:color w:val="6B7280"/><w:sz w:val="18"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CaptionNote"><w:name w:val="Caption Note"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:rPr><w:i/><w:color w:val="374151"/><w:sz w:val="20"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:pPr><w:spacing w:before="80" w:after="80"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`;

const created = new Date().toISOString();
const coreProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(docTitle || '异地协同监控台使用教程')}</dc:title>
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
