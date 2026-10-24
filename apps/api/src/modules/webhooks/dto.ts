import { WebhookAckSchema } from "@repo/types";
import { createZodDto } from "nestjs-zod";

export class WebhookAckDto extends createZodDto(WebhookAckSchema) {}
