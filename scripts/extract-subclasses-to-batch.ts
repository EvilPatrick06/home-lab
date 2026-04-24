import fs from 'fs';
import path from 'path';

const PHB_CLASSES_FILE = path.join(process.cwd(), '5.5e References/PHB2024/markdown/03-character-classes.md');
const OUTPUT_FILE = path.join(process.cwd(), 'batch-subclasses.jsonl');

const tsSchema = `
export interface SubclassFeature {
  name: string;
  level: number;
  description: string;
}

export interface SubclassData {
  id: string; // kebab-case of the subclass name, e.g. "path-of-the-berserker"
  name: string; // e.g., "Path of the Berserker"
  className: string; // e.g., "Barbarian"
  level: number; // e.g., 3
  description: string; // Flavor text
  features: SubclassFeature[];
  alwaysPreparedSpells?: Record<string, string[]>; // e.g. {"3": ["burning hands"]}
}
`;

function generateBatch() {
    const text = fs.readFileSync(PHB_CLASSES_FILE, 'utf-8');
    // Split the markdown by "## " which separates the 12 classes
    const blocks = text.split('\n## ');

    const requests = [];

    // Skip index 0 (intro to classes)
    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const lines = block.split('\n');
        const classNameFull = lines[0].trim();
        // Some lines might have extra text, so we split by space
        const className = classNameFull.split(' ')[0];

        // Ignore non-class headers if any, we only want the 12 core classes
        const validClasses = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
        if (!validClasses.includes(className)) continue;

        const fullText = '## ' + block;

        const prompt = `You are an expert D&D 5.5e Data Architect. 
Your task is to extract ALL Subclasses for the ${className} class from the provided markdown text.
There are typically exactly 4 subclasses defined in the PHB per class.
Read through the markdown, locate the sections defining the subclasses (usually under #### [Subclass Name]), and extract all of them into a JSON array of objects conforming to the following TypeScript interface:

\`\`\`typescript
${tsSchema}
\`\`\`

Rules:
1. Provide ONLY valid JSON.
2. The output MUST be a JSON array \`[ { ... }, { ... } ]\`.
3. Wrap the JSON array in \`\`\`json blocks.
4. Ensure the properties exactly match the \`SubclassData\` interface. Do not add hallucinated properties.
5. Extract EVERY feature listed for the subclass into the \`features\` array.
6. The \`level\` property of each feature should be a number corresponding to when the class gets it.
7. For \`alwaysPreparedSpells\`, if the subclass grants specific prepared spells at certain levels (like Domain Spells), include them as a dictionary mapping the string representation of the level ("3", "5") to an array of spell name strings (["burning hands", "command"]). Otherwise, omit the property.

Markdown Text:
${fullText}
`;

        requests.push({
            custom_id: `extract-subclasses-${className.toLowerCase()}`,
            params: {
                model: "claude-3-haiku-20240307",
                max_tokens: 4096,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            }
        });
    }

    const jsonl = requests.map(r => JSON.stringify(r)).join('\n');
    fs.writeFileSync(OUTPUT_FILE, jsonl);
    console.log(`Generated batch request with ${requests.length} classes to ${OUTPUT_FILE}`);
}

generateBatch();
