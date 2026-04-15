import type {
  DocumentAttachment,
  MultimodalContent,
  RequestMessage,
} from "../client/api";

export const MAX_ATTACH_DOCUMENTS = 5;
export const MAX_DOCUMENT_CHARS = 16000;
export const MAX_TOTAL_DOCUMENT_CHARS = 48000;

const SUPPORTED_DOCUMENT_EXTENSIONS = ["txt", "md", "pdf", "docx"] as const;

type SupportedDocumentExtension =
  (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number];

function getFileExtension(fileName: string): string {
  const segments = fileName.toLowerCase().split(".");
  return segments.length > 1 ? segments.at(-1) ?? "" : "";
}

function normalizeDocumentText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateDocumentText(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  return {
    text: `${text.slice(0, maxChars).trimEnd()}\n\n[文档内容过长，已截断]`,
    truncated: true,
  };
}

function cloneMultimodalContent(content: MultimodalContent[]) {
  return content.map((part) => {
    if (part.type === "image_url") {
      return {
        ...part,
        image_url: part.image_url ? { ...part.image_url } : undefined,
      };
    }

    return { ...part };
  });
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function parsePdf(file: File) {
  const pdfjs = await import("pdfjs-dist/webpack.mjs");

  const loadingTask = pdfjs.getDocument({
    data: await file.arrayBuffer(),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => {
        if (!("str" in item)) return "";
        return `${item.str ?? ""}${item.hasEOL ? "\n" : " "}`;
      })
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (pageText) {
      pages.push(`[第 ${pageIndex} 页]\n${pageText}`);
    }
  }

  return pages.join("\n\n");
}

async function parseDocx(file: File) {
  const mammoth = await import("mammoth/mammoth.browser");
  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  return result.value;
}

export function isSupportedDocumentFile(file: File) {
  const extension = getFileExtension(file.name);
  return SUPPORTED_DOCUMENT_EXTENSIONS.includes(
    extension as SupportedDocumentExtension,
  );
}

export async function parseDocumentFile(
  file: File,
): Promise<DocumentAttachment> {
  const extension = getFileExtension(file.name) as SupportedDocumentExtension;

  if (!SUPPORTED_DOCUMENT_EXTENSIONS.includes(extension)) {
    throw new Error("unsupported_document_type");
  }

  let rawText = "";

  switch (extension) {
    case "txt":
    case "md":
      rawText = await file.text();
      break;
    case "pdf":
      rawText = await parsePdf(file);
      break;
    case "docx":
      rawText = await parseDocx(file);
      break;
  }

  const normalizedText = normalizeDocumentText(rawText);

  if (!normalizedText) {
    throw new Error("empty_document_text");
  }

  const { text, truncated } = truncateDocumentText(
    normalizedText,
    MAX_DOCUMENT_CHARS,
  );

  return {
    id: `${file.name}-${file.lastModified}-${file.size}`,
    name: file.name,
    extension,
    text,
    charCount: text.length,
    truncated,
  };
}

export function formatDocumentsForPrompt(documents: DocumentAttachment[]) {
  if (documents.length === 0) {
    return "";
  }

  let remainingChars = MAX_TOTAL_DOCUMENT_CHARS;
  const sections: string[] = [];

  for (const document of documents) {
    if (remainingChars <= 0) {
      break;
    }

    let text = document.text;
    let truncated = Boolean(document.truncated);

    if (text.length > remainingChars) {
      text = `${text
        .slice(0, remainingChars)
        .trimEnd()}\n\n[达到总上下文长度上限，后续文档内容已截断]`;
      truncated = true;
    }

    remainingChars -= text.length;

    sections.push(
      `<document name="${escapeAttribute(document.name)}" type="${
        document.extension
      }" truncated="${truncated ? "true" : "false"}">\n${text}\n</document>`,
    );
  }

  if (sections.length === 0) {
    return "";
  }

  return `<documents>\n${sections.join("\n\n")}\n</documents>`;
}

export function appendDocumentsToMessage(
  message: RequestMessage,
): RequestMessage {
  const documents = message.documents ?? [];

  if (documents.length === 0) {
    return {
      role: message.role,
      content:
        typeof message.content === "string"
          ? message.content
          : cloneMultimodalContent(message.content),
    };
  }

  const documentBlock = formatDocumentsForPrompt(documents);

  if (!documentBlock) {
    return {
      role: message.role,
      content:
        typeof message.content === "string"
          ? message.content
          : cloneMultimodalContent(message.content),
    };
  }

  if (typeof message.content === "string") {
    const content = [message.content.trim(), documentBlock]
      .filter(Boolean)
      .join("\n\n");
    return { role: message.role, content };
  }

  const content = cloneMultimodalContent(message.content);
  const textIndex = content.findIndex((part) => part.type === "text");

  if (textIndex >= 0) {
    const textPart = content[textIndex];
    content[textIndex] = {
      ...textPart,
      text: [textPart.text?.trim() ?? "", documentBlock]
        .filter(Boolean)
        .join("\n\n"),
    };
  } else {
    content.unshift({
      type: "text",
      text: documentBlock,
    });
  }

  return {
    role: message.role,
    content,
  };
}
