/** The stored shape of an API token and the view of it the owner sees. */
import { z } from "zod";

export const TOKEN_SCOPES = ["manage", "admin"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const MAX_NOTE = 200;

const HashedSecretSchema = z.object({ salt: z.string(), hash: z.string() });

const TokenRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.enum(TOKEN_SCOPES),
  secret: HashedSecretSchema,
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  revokedAt: z.string().optional(),
  rotatedAt: z.string().optional(),
  /** Where the owner keeps it, or what uses it; free text. */
  note: z.string().max(MAX_NOTE).optional(),
  /** The secret before the last rotation, honoured until graceUntil. */
  previous: HashedSecretSchema.extend({ graceUntil: z.string(), lastUsedAt: z.string().optional() }).optional(),
});
export type TokenRecord = z.infer<typeof TokenRecordSchema>;
export const FileSchema = z.object({ version: z.literal(1), tokens: z.array(TokenRecordSchema) });

/** A token as shown to the owner: everything but the secret material. */
export type ApiTokenView = Omit<TokenRecord, "secret" | "previous"> & {
  previousGraceUntil?: string;
  previousLastUsedAt?: string;
};

/** The principal a verified token represents. */
export interface TokenPrincipal {
  kind: "token";
  id: string;
  name: string;
  scope: TokenScope;
}

export function toView(record: TokenRecord): ApiTokenView {
  const { secret: _secret, previous, ...view } = record;
  return {
    ...view,
    ...(previous && { previousGraceUntil: previous.graceUntil, previousLastUsedAt: previous.lastUsedAt }),
  };
}

