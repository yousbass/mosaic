// Thin wrappers over the claude.ai artifact runtime. Every capability may be
// absent (a saved copy, a viewer outside claude.ai), so each helper resolves
// null and the app falls back to working locally.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const w = (typeof window !== "undefined" ? window : {}) as Any;

export async function use<T = Any>(name: string): Promise<T | null> {
  try {
    if (!w.claude?.use) return null;
    return (await w.claude.use(name)) as T | null;
  } catch {
    return null;
  }
}

export type SampleFn = ((input: Any, opts?: Any) => Promise<{ text: string; truncated: boolean; modelTierApplied?: "quick" | "default" | "complex" }>) & {
  json: <T>(input: Any, opts?: Any) => Promise<T>;
  limits: () => Promise<{ tools?: { maxCount: number } }>;
};

export interface SampleError { code: string; message: string; text?: string }

export function isSampleError(e: unknown): e is SampleError {
  return !!e && typeof e === "object" && "code" in (e as Any);
}

/** Short user-facing copy for an AI failure code. */
export function aiErrorCopy(code: string, lang: "en" | "ar"): string {
  const en: Record<string, string> = {
    not_granted: "AI is turned off for this page. Allow it from the page's permissions to use the assistant.",
    sampling_disabled: "AI isn't available on this account.",
    rate_limited: "Too many requests right now. Try again in a minute.",
    session_expired: "Your session expired. Sign in to claude.ai again.",
    refused: "The assistant couldn't help with that request. Try rewording it.",
    prompt_too_large: "That's too much text at once. Try a shorter request.",
    invalid_json: "The answer came back in the wrong shape. Try again.",
    tools_unavailable: "This view can't run assistant actions. You can still ask questions.",
  };
  const ar: Record<string, string> = {
    not_granted: "الذكاء الاصطناعي متوقف لهذه الصفحة. اسمح به من أذونات الصفحة لاستخدام المساعد.",
    sampling_disabled: "الذكاء الاصطناعي غير متاح لهذا الحساب.",
    rate_limited: "طلبات كثيرة الآن. حاول بعد دقيقة.",
    session_expired: "انتهت الجلسة. سجّل الدخول إلى claude.ai مرة أخرى.",
    refused: "لم يتمكن المساعد من تنفيذ هذا الطلب. جرّب صياغة أخرى.",
    prompt_too_large: "النص طويل جدًا. جرّب طلبًا أقصر.",
    invalid_json: "وصلت الإجابة بصيغة غير متوقعة. حاول مرة أخرى.",
    tools_unavailable: "لا يمكن تنفيذ إجراءات المساعد هنا. يمكنك طرح الأسئلة فقط.",
  };
  return (lang === "ar" ? ar : en)[code] ?? (lang === "ar" ? "تعذّر الوصول إلى المساعد. حاول مرة أخرى." : "The assistant couldn't be reached. Try again.");
}

/** Offer a file to the viewer through the downloads capability. Returns false when unavailable or declined. */
export async function saveFile(filename: string, data: string): Promise<boolean> {
  const dl = await use<Any>("downloads");
  if (!dl) return false;
  try {
    await dl.save({ filename, data });
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
