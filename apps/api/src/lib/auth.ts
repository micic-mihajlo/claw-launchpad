import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHash, timingSafeEqual } from "node:crypto";

export type AuthMode = "disabled" | "token" | "jwt";

export type AuthIssue = string;

export type AuthState = {
  enabled: boolean;
  ready: boolean;
  issues: AuthIssue[];
  defaultUserId: string;
  mode: AuthMode;
  resolveUserId: (authorizationHeader: string | null) => Promise<string | null>;
};

const SYSTEM_USER_ID = "system";
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

type JwtOptions = {
  jwksUrl: string;
  subClaim: string;
  issuer?: string | string[];
  audience?: string | string[];
  maxTokenAgeSeconds?: number;
  algorithms?: string[];
};

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

function parseJwtMode(raw: string | undefined, issues: AuthIssue[]): Exclude<AuthMode, "disabled"> {
  const candidate = (raw || "token").trim().toLowerCase();
  if (!candidate || candidate === "token") return "token";
  if (candidate === "jwt") return "jwt";

  issues.push(`Unsupported AUTH_MODE "${candidate}". Use "token" or "jwt".`);
  return "token";
}

function parseOptionalStringArray(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const items = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return items.length > 0 ? items : undefined;
}

type TokenMap = Map<string, string>;
type HashedTokenEntry = { tokenHash: Buffer; userId: string };

function parseTokenMap(raw: string): TokenMap {
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("AUTH_TOKEN_MAP must be a JSON object mapping token -> userId");
  }

  const map: TokenMap = new Map();
  for (const [token, userId] of Object.entries(parsed)) {
    if (typeof token !== "string" || typeof userId !== "string") {
      throw new Error("AUTH_TOKEN_MAP entries must be token => string userId pairs");
    }

    const normalizedToken = token.trim();
    const normalizedUserId = userId.trim();
    if (!normalizedToken || !normalizedUserId) {
      throw new Error("AUTH_TOKEN_MAP entries must contain non-empty token and userId");
    }

    map.set(normalizedToken, normalizedUserId);
  }

  return map;
}

function normalizeBearerToken(header: string | null): string | null {
  if (!header) return null;

  const trimmed = header.trim();
  if (!trimmed) return null;

  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

function buildTokenResolver(tokenToUser: TokenMap) {
  const entries: HashedTokenEntry[] = Array.from(tokenToUser.entries()).map(([token, userId]) => ({
    tokenHash: createHash("sha256").update(token).digest(),
    userId,
  }));

  return async (authorizationHeader: string | null): Promise<string | null> => {
    const token = normalizeBearerToken(authorizationHeader);
    if (!token) return null;

    const tokenHash = createHash("sha256").update(token).digest();
    let resolvedUserId: string | null = null;
    for (const entry of entries) {
      if (timingSafeEqual(entry.tokenHash, tokenHash)) {
        resolvedUserId = entry.userId;
        break;
      }
    }

    return resolvedUserId;
  };
}

function buildJwtResolver(options: JwtOptions): (authorizationHeader: string | null) => Promise<string | null> {
  const keyStore = createRemoteJWKSet(new URL(options.jwksUrl));

  const verifyOptions: {
    issuer?: string | string[];
    audience?: string | string[];
    algorithms?: string[];
    maxTokenAge?: string;
  } = {
    issuer: options.issuer,
    audience: options.audience,
    algorithms: options.algorithms,
  };

  if (options.maxTokenAgeSeconds && options.maxTokenAgeSeconds > 0) {
    verifyOptions.maxTokenAge = `${options.maxTokenAgeSeconds}s`;
  }

  return async (authorizationHeader: string | null): Promise<string | null> => {
    const token = normalizeBearerToken(authorizationHeader);
    if (!token) return null;

    try {
      const verification = await jwtVerify(token, keyStore, verifyOptions);
      const rawSub = (verification.payload as Record<string, unknown>)[options.subClaim];
      if (typeof rawSub !== "string") {
        return null;
      }

      const normalized = rawSub.trim();
      return normalized || null;
    } catch {
      return null;
    }
  };
}

function createTokenAuthState(
  defaultUserId: string,
  issues: AuthIssue[],
): AuthState {
  const tokenMapSource = process.env.AUTH_TOKEN_MAP?.trim();
  const singleToken = process.env.AUTH_TOKEN?.trim();
  const legacyToken = process.env.API_BEARER_TOKEN?.trim();

  const tokenToUser: TokenMap = new Map();

  if (legacyToken) {
    tokenToUser.set(legacyToken, defaultUserId);
  }

  if (tokenMapSource) {
    try {
      for (const [token, userId] of parseTokenMap(tokenMapSource).entries()) {
        tokenToUser.set(token, userId);
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (singleToken) {
    if (!tokenToUser.has(singleToken)) {
      tokenToUser.set(singleToken, defaultUserId);
    }
  }

  if (tokenToUser.size === 0) {
    issues.push("AUTH enabled but no usable token configuration. Set AUTH_TOKEN or AUTH_TOKEN_MAP.");
  }

  return {
    enabled: true,
    ready: issues.length === 0,
    issues,
    mode: "token",
    defaultUserId,
    resolveUserId: buildTokenResolver(tokenToUser),
  };
}

function createJwtAuthState(defaultUserId: string, issues: AuthIssue[]): AuthState {
  const jwksUrl = process.env.AUTH_JWKS_URL?.trim();
  const subClaim = (process.env.AUTH_JWT_SUB_CLAIM || "sub").trim() || "sub";
  const issuerRaw = process.env.AUTH_JWT_ISSUER?.trim();
  const audienceRaw = process.env.AUTH_JWT_AUDIENCE?.trim();
  const algorithmsRaw = process.env.AUTH_JWT_ALGORITHMS?.trim();
  const algorithms = parseOptionalStringArray(algorithmsRaw)?.map((algorithm) => algorithm.toUpperCase()) ?? ["RS256"];
  const audience = parseOptionalStringArray(audienceRaw);
  const maxTokenAgeSecondsRaw = process.env.AUTH_JWT_MAX_TOKEN_AGE_SECONDS?.trim();
  const maxTokenAgeSeconds = maxTokenAgeSecondsRaw
    ? Number.parseInt(maxTokenAgeSecondsRaw, 10)
    : undefined;

  if (!jwksUrl) {
    issues.push("AUTH_MODE=jwt requires AUTH_JWKS_URL");
  } else {
    try {
      new URL(jwksUrl);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (maxTokenAgeSecondsRaw && maxTokenAgeSecondsRaw.length > 0) {
    if (!Number.isFinite(maxTokenAgeSeconds || NaN) || (maxTokenAgeSeconds || 0) <= 0) {
      issues.push("AUTH_JWT_MAX_TOKEN_AGE_SECONDS must be a positive integer when set.");
    }
  }

  const ready = issues.length === 0;
  const resolver = ready
    ? buildJwtResolver({
      jwksUrl: jwksUrl || "",
      subClaim,
      issuer: issuerRaw ? parseOptionalStringArray(issuerRaw) || issuerRaw : undefined,
      audience,
      algorithms,
      maxTokenAgeSeconds,
    })
    : async () => null;

  return {
    enabled: true,
    ready,
    issues,
    mode: "jwt",
    defaultUserId,
    resolveUserId: resolver,
  };
}

export function createAuthState(): AuthState {
  const legacyToken = process.env.API_BEARER_TOKEN?.trim();
  const enabled = parseBoolean(process.env.AUTH_ENABLED) || Boolean(legacyToken);
  const issues: AuthIssue[] = [];
  const defaultUserId = (process.env.AUTH_DEFAULT_USER_ID || SYSTEM_USER_ID).trim() || SYSTEM_USER_ID;

  if (!enabled) {
    return {
      enabled: false,
      ready: true,
      issues,
      mode: "disabled",
      defaultUserId,
      resolveUserId: async () => defaultUserId,
    };
  }

  const mode = parseJwtMode(process.env.AUTH_MODE, issues);
  if (mode === "jwt") {
    return createJwtAuthState(defaultUserId, issues);
  }

  return createTokenAuthState(defaultUserId, issues);
}

export const AUTH_MODES: AuthMode[] = ["disabled", "token", "jwt"];
