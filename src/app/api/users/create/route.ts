import { NextResponse } from "next/server";

import type { UserRole } from "@/types/domain";

type CreateUserRequest = {
  companyId?: unknown;
  role?: unknown;
  name?: unknown;
  email?: unknown;
  password?: unknown;
};

type FirestoreValue = {
  stringValue?: string;
  timestampValue?: string;
  nullValue?: null;
};

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
};

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

export async function POST(request: Request) {
  try {
    if (!apiKey || !projectId) {
      return NextResponse.json({ error: "Firebase設定が不足しています。" }, { status: 500 });
    }

    const token = readBearerToken(request);

    if (!token) {
      return NextResponse.json({ error: "認証情報がありません。" }, { status: 401 });
    }

    const actorUid = await lookupUidByIdToken(token);
    const actorDocument = await getFirestoreDocument(`users/${actorUid}`, token);

    if (!actorDocument) {
      return NextResponse.json({ error: "操作ユーザーが見つかりません。" }, { status: 403 });
    }

    const actor = readUserFields(actorDocument);

    if (actor.status !== "active") {
      return NextResponse.json({ error: "停止中のアカウントでは操作できません。" }, { status: 403 });
    }

    const body = (await request.json()) as CreateUserRequest;
    const parsed = parseCreateUserRequest(body);

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { companyId, email, name, password, role } = parsed.value;

    if (actor.role === "admin" && (role !== "sales" || actor.companyId !== companyId)) {
      return NextResponse.json({ error: "自社の営業マンのみ追加できます。" }, { status: 403 });
    }

    if (actor.role !== "owner" && actor.role !== "admin") {
      return NextResponse.json({ error: "ユーザー追加権限がありません。" }, { status: 403 });
    }

    const companyDocument = await getFirestoreDocument(`companies/${companyId}`, token);

    if (!companyDocument) {
      return NextResponse.json({ error: "指定された会社が見つかりません。" }, { status: 404 });
    }

    const authUser = await createAuthUser({ email, name, password });

    await writeUserDocument(
      authUser.localId,
      {
        companyId,
        createdBy: actorUid,
        email,
        name,
        role,
        status: "active",
      },
      token,
    );

    return NextResponse.json({ uid: authUser.localId });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "ユーザー追加に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function lookupUidByIdToken(token: string) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    },
  );
  const data = (await response.json()) as {
    users?: Array<{ localId?: string }>;
    error?: { message?: string };
  };

  if (!response.ok || !data.users?.[0]?.localId) {
    throw new ApiError("認証情報を確認できませんでした。", 401);
  }

  return data.users[0].localId;
}

async function createAuthUser(input: {
  email: string;
  name: string;
  password: string;
}) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: input.name,
        email: input.email,
        password: input.password,
        returnSecureToken: false,
      }),
    },
  );
  const data = (await response.json()) as {
    localId?: string;
    error?: { message?: string };
  };

  if (!response.ok || !data.localId) {
    if (data.error?.message === "EMAIL_EXISTS") {
      throw new ApiError("このメールアドレスは既に登録されています。", 409);
    }

    throw new ApiError("Firebase Authユーザーの作成に失敗しました。", 502);
  }

  return { localId: data.localId };
}

async function getFirestoreDocument(path: string, token: string) {
  const response = await fetch(firestoreDocumentUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ApiError("Firestoreデータを確認できませんでした。", response.status);
  }

  return (await response.json()) as FirestoreDocument;
}

async function writeUserDocument(
  uid: string,
  input: {
    companyId: string;
    createdBy: string;
    email: string;
    name: string;
    role: "admin" | "sales";
    status: "active";
  },
  token: string,
) {
  const now = new Date().toISOString();
  const response = await fetch(firestoreDocumentUrl(`users/${uid}`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        uid: { stringValue: uid },
        companyId: { stringValue: input.companyId },
        role: { stringValue: input.role },
        name: { stringValue: input.name },
        email: { stringValue: input.email },
        status: { stringValue: input.status },
        createdBy: { stringValue: input.createdBy },
        createdAt: { timestampValue: now },
        lastLoginAt: { nullValue: null },
        updatedAt: { timestampValue: now },
      },
    }),
  });

  if (!response.ok) {
    throw new ApiError("Firestoreユーザードキュメントの作成に失敗しました。", response.status);
  }
}

function parseCreateUserRequest(body: CreateUserRequest):
  | {
      ok: true;
      value: {
        companyId: string;
        role: "admin" | "sales";
        name: string;
        email: string;
        password: string;
      };
    }
  | { ok: false; error: string } {
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const role = body.role === "admin" || body.role === "sales" ? body.role : null;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!companyId) return { ok: false, error: "会社を選択してください。" };
  if (!role) return { ok: false, error: "権限を選択してください。" };
  if (!name) return { ok: false, error: "名前を入力してください。" };
  if (!email || !email.includes("@")) return { ok: false, error: "メールアドレスを入力してください。" };
  if (password.length < 6) return { ok: false, error: "パスワードは6文字以上で入力してください。" };

  return { ok: true, value: { companyId, role, name, email, password } };
}

function readUserFields(document: FirestoreDocument) {
  const fields = document.fields ?? {};

  return {
    companyId: fields.companyId?.stringValue,
    role: fields.role?.stringValue as UserRole | undefined,
    status: fields.status?.stringValue,
  };
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim();
}

function firestoreDocumentUrl(path: string) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
}

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
