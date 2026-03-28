import starterTemplatesXml from "./starter-templates.xml?raw";

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  repository: string;
  previewImage: string | null;
  tag: string | null;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readXmlTag(block: string, tagName: string): string {
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i").exec(block);
  return decodeXmlText(match?.[1]?.trim() ?? "");
}

function parseStarterTemplates(xml: string): StarterTemplate[] {
  const matches = xml.matchAll(/<template(?:\s+id="([^"]+)")?>([\s\S]*?)<\/template>/gi);

  return Array.from(matches)
    .map((match, index) => {
      const block = match[2] ?? "";
      const name = readXmlTag(block, "name");
      const description = readXmlTag(block, "description");
      const repository = readXmlTag(block, "repository");
      const previewImage = readXmlTag(block, "previewImage");
      const tag = readXmlTag(block, "tag");

      if (!name || !repository) {
        return null;
      }

      return {
        id: match[1] ?? `template-${index + 1}`,
        name,
        description,
        repository,
        previewImage: previewImage || null,
        tag: tag || null,
      } satisfies StarterTemplate;
    })
    .filter((template): template is StarterTemplate => template !== null);
}

export const starterTemplates = parseStarterTemplates(starterTemplatesXml);
