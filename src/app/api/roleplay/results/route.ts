import { FieldValue, Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import {
  defaultMonthlyRoleplayQuota,
} from "@/lib/ai-quota";
import { getAdminAuth, getAdminFirestore } from "@/lib/server/firebase-admin";

type RoleplayResultRequest = {
  companyId?: unknown;
  scenarioId?: unknown;
  scenarioTitle?: unknown;
  productName?: unknown;
  userId?: unknown;
  score?: unknown;
  summary?: unknown;
  strengths?: unknown;
  improvements?: unknown;
  messages?: unknown;
};

type RoleplayMessage = {
  role: "customer" | "sales";
  content: string;
  createdAt: string;
};

export async function POST(request: Request) {
  try {
    const token = readBearerToken(request);

    if (!token) {
      return NextResponse.json({ error: "認証情報がありません。" }, { status: 401 });
    }

    const decodedToken = await getAdminAuth().verifyIdToken(token);
    const body = (await request.json()) as RoleplayResultRequest;
    const parsed = parseRoleplayResultRequest(body);

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    if (decodedToken.uid !== parsed.value.userId) {
      return NextResponse.json({ error: "自分のロープレ結果のみ保存できます。" }, { status: 403 });
    }

    const db = getAdminFirestore();
    const userSnapshot = await db.collection("users").doc(decodedToken.uid).get();

    if (!userSnapshot.exists) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません。" }, { status: 403 });
    }

    const user = userSnapshot.data() ?? {};

    if (user.status !== "active") {
      return NextResponse.json({ error: "停止中のアカウントでは保存できません。" }, { status: 403 });
    }

    if (user.companyId !== parsed.value.companyId) {
      return NextResponse.json({ error: "所属会社のロープレ結果のみ保存できます。" }, { status: 403 });
    }

    if (!canUseTeleapoDomain(user)) {
      return NextResponse.json({ error: "AIロープレを利用できません。" }, { status: 403 });
    }

    const resultId = await db.runTransaction(async (transaction) => {
      const companyRef = db.collection("companies").doc(parsed.value.companyId);
      const companySnapshot = await transaction.get(companyRef);

      if (!companySnapshot.exists) {
        throw new ApiError("会社情報が見つかりません。", 404);
      }

      const company = companySnapshot.data() ?? {};
      const limit = readQuota(company.monthlyRoleplayQuota, defaultMonthlyRoleplayQuota);

      if (limit !== null) {
        const usageQuery = db
          .collection("roleplayResults")
          .where("companyId", "==", parsed.value.companyId);
        const usageSnapshot = await transaction.get(usageQuery);
        const used = countCurrentMonthDocs(usageSnapshot.docs);

        if (used >= limit) {
          throw new ApiError(
            `ロープレの月間利用上限（${limit}回）に達しています。プラン変更または上限回数の変更を行ってください。`,
            429,
          );
        }
      }

      const resultRef = db.collection("roleplayResults").doc();
      transaction.set(resultRef, {
        ...parsed.value,
        createdAt: FieldValue.serverTimestamp(),
      });

      return resultRef.id;
    });

    return NextResponse.json({ id: resultId });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "ロープレ結果の保存に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function parseRoleplayResultRequest(body: RoleplayResultRequest):
  | {
      ok: true;
      value: {
        companyId: string;
        scenarioId: string;
        scenarioTitle: string;
        productName: string;
        userId: string;
        score: number;
        summary: string;
        strengths: string[];
        improvements: string[];
        messages: RoleplayMessage[];
      };
    }
  | { ok: false; error: string } {
  const companyId = readNonEmptyString(body.companyId);
  const scenarioId = readNonEmptyString(body.scenarioId);
  const scenarioTitle = readNonEmptyString(body.scenarioTitle);
  const productName = typeof body.productName === "string" ? body.productName : "";
  const userId = readNonEmptyString(body.userId);
  const summary = readNonEmptyString(body.summary);
  const strengths = readStringArray(body.strengths);
  const improvements = readStringArray(body.improvements);
  const messages = readMessages(body.messages);
  const score = typeof body.score === "number" && Number.isFinite(body.score)
    ? Math.max(0, Math.min(100, Math.round(body.score)))
    : null;

  if (!companyId || !scenarioId || !scenarioTitle || !userId || score === null || !summary) {
    return { ok: false, error: "ロープレ結果の保存内容が不正です。" };
  }

  if (messages.length < 2) {
    return { ok: false, error: "会話ログが不足しています。" };
  }

  return {
    ok: true,
    value: {
      companyId,
      scenarioId,
      scenarioTitle,
      productName,
      userId,
      score,
      summary,
      strengths,
      improvements,
      messages,
    },
  };
}

function countCurrentMonthDocs(docs: QueryDocumentSnapshot[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return docs.filter((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
    return createdAt !== null && createdAt >= monthStart && createdAt < nextMonthStart;
  }).length;
}

function canUseTeleapoDomain(user: Record<string, unknown>) {
  if (user.role === "admin") {
    return true;
  }

  if (user.role !== "sales") {
    return false;
  }

  const domains = user.enabledSalesDomains;

  if (!domains || typeof domains !== "object") {
    return true;
  }

  const teleapo = (domains as { teleapo?: unknown }).teleapo;
  return teleapo !== false;
}

function readQuota(value: unknown, fallback: number | null) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readMessages(value: unknown): RoleplayMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((message) => {
    if (!message || typeof message !== "object") {
      return [];
    }

    const role = (message as { role?: unknown }).role;
    const content = (message as { content?: unknown }).content;
    const createdAt = (message as { createdAt?: unknown }).createdAt;

    if ((role !== "customer" && role !== "sales") || typeof content !== "string" || typeof createdAt !== "string") {
      return [];
    }

    return [{ role, content, createdAt }];
  });
}

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
