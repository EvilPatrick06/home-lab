import { z } from "zod";
import { ClassSchema } from "./schemas/classes.js";
import { FeatSchema } from "./schemas/feats.js";
import { BackgroundSchema } from "./schemas/backgrounds.js";
import fs from "fs";
import path from "path";

const HomebrewTypeSchema = z.enum(["class", "feat", "background"]);

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

function validateHomebrewItem(jsonContent: any, type: string): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  try {
    // First validate the type
    const itemType = HomebrewTypeSchema.parse(type);

    // Then validate against the appropriate schema
    switch (itemType) {
      case "class":
        ClassSchema.parse(jsonContent);
        break;
      case "feat":
        FeatSchema.parse(jsonContent);
        break;
      case "background":
        BackgroundSchema.parse(jsonContent);
        break;
    }

    // Additional custom validations
    result.warnings.push(...runCustomValidations(jsonContent, itemType));

  } catch (error) {
    result.isValid = false;
    if (error instanceof z.ZodError) {
      result.errors = error.errors.map(err => {
        const path = err.path.join('.');
        return `Field '${path}': ${err.message}`;
      });
    } else {
      result.errors = [`Validation error: ${error.message}`];
    }
  }

  return result;
}

function runCustomValidations(jsonContent: any, type: string): string[] {
  const warnings: string[] = [];

  switch (type) {
    case "class":
      // Check for balanced level progression
      if (jsonContent.levelProgression) {
        const levels = jsonContent.levelProgression;
        if (levels.length !== 20) {
          warnings.push("Class should have exactly 20 levels in progression");
        }

        // Check proficiency bonus progression
        const expectedProficiency = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];
        levels.forEach((level: any, index: number) => {
          if (level.proficiencyBonus !== expectedProficiency[index]) {
            warnings.push(`Level ${level.level} proficiency bonus should be ${expectedProficiency[index]}, got ${level.proficiencyBonus}`);
          }
        });
      }
      break;

    case "feat":
      // Check for valid prerequisites
      if (jsonContent.prerequisites) {
        if (jsonContent.prerequisites.level && jsonContent.prerequisites.level < 1) {
          warnings.push("Feat level prerequisite must be at least 1");
        }
      }
      break;

    case "background":
      // Check equipment costs
      if (jsonContent.equipment) {
        jsonContent.equipment.forEach((option: any) => {
          if (option.items) {
            option.items.forEach((item: any) => {
              if (typeof item === 'object' && item.quantity && item.quantity < 1) {
                warnings.push(`Equipment item quantity must be at least 1: ${item.item}`);
              }
            });
          }
        });
      }
      break;
  }

  return warnings;
}

function validateHomebrewFile(filePath: string): ValidationResult {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const jsonContent = JSON.parse(content);

    // Determine type from file path or content
    let type = "";
    const fileName = path.basename(filePath).toLowerCase();

    if (fileName.includes("class")) {
      type = "class";
    } else if (fileName.includes("feat")) {
      type = "feat";
    } else if (fileName.includes("background")) {
      type = "background";
    } else if (jsonContent.name && jsonContent.levelProgression) {
      type = "class";
    } else if (jsonContent.category && ["Origin", "General", "Fighting Style", "Epic Boon"].includes(jsonContent.category)) {
      type = "feat";
    } else if (jsonContent.skillProficiencies && jsonContent.equipment) {
      type = "background";
    }

    if (!type) {
      return {
        isValid: false,
        errors: ["Could not determine homebrew type from file content. File name should contain 'class', 'feat', or 'background', or the JSON structure should be recognizable."],
        warnings: []
      };
    }

    return validateHomebrewItem(jsonContent, type);

  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        isValid: false,
        errors: [`Invalid JSON syntax: ${error.message}`],
        warnings: []
      };
    }
    return {
      isValid: false,
      errors: [`File read error: ${error.message}`],
      warnings: []
    };
  }
}

function printValidationResult(filePath: string, result: ValidationResult) {
  console.log(`\n🔍 Validating: ${filePath}`);

  if (result.isValid) {
    console.log("✅ Validation PASSED");
  } else {
    console.log("❌ Validation FAILED");
    result.errors.forEach(error => {
      console.log(`  🚨 ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    console.log("⚠️  Warnings:");
    result.warnings.forEach(warning => {
      console.log(`  ⚠️  ${warning}`);
    });
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: npm run validate-homebrew <file-path> [file-path...]");
    console.log("Or: node scripts/validate-homebrew.ts <file-path> [file-path...]");
    process.exit(1);
  }

  let hasErrors = false;

  for (const filePath of args) {
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${filePath}`);
      hasErrors = true;
      continue;
    }

    const result = validateHomebrewFile(filePath);
    printValidationResult(filePath, result);

    if (!result.isValid) {
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.log("\n❌ Some files failed validation. Please fix the errors above.");
    process.exit(1);
  } else {
    console.log("\n✅ All files passed validation!");
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { validateHomebrewItem, validateHomebrewFile };
export type { ValidationResult };