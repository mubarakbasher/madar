import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodTypeAny, z } from "zod";

export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_root";
        fields[key] = issue.message;
      }
      throw new BadRequestException({
        code: "validation_failed",
        message: "Validation failed",
        fields,
      });
    }
    return parsed.data;
  }
}
