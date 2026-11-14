import { ApiError, isNetworkError, type OnboardingRequest, type SchoolLevel } from "@/lib/api/types";

/**
 * 同意した文書の版（API の terms_version・privacy_notice_version に送る）。
 * 利用規約・データの扱いの説明の正式な文面は、法務の確認のあとに決める。
 * それまでは仮の版（draft-1）。文面を変えたら、ここの版も更新する。
 */
export const TERMS_VERSION = "draft-1";
export const PRIVACY_NOTICE_VERSION = "draft-1";

/** ニックネームの最大の文字数（API と同じ） */
export const NICKNAME_MAX = 40;

export type OnboardingForm = {
  nickname: string;
  /** 未選択は "" */
  schoolLevel: SchoolLevel | "";
  /** 未選択は 0 */
  grade: number;
  consent: boolean;
};

export type FieldName = "nickname" | "schoolLevel" | "grade";
export type FormErrors = Partial<Record<FieldName, string>>;

export const emptyForm: OnboardingForm = { nickname: "", schoolLevel: "", grade: 0, consent: false };

/** 画面での入力チェック（API も同じ内容を確かめる）。エラーがなければ空のオブジェクト */
export function validate(form: OnboardingForm): FormErrors {
  const errors: FormErrors = {};
  const nickname = form.nickname.trim();
  const length = [...nickname].length;
  if (length === 0) errors.nickname = "ニックネームを入力してください。";
  else if (length > NICKNAME_MAX) errors.nickname = `ニックネームは${NICKNAME_MAX}文字までです。`;
  if (form.schoolLevel === "") errors.schoolLevel = "校種を選んでください。";
  if (![1, 2, 3].includes(form.grade)) errors.grade = "学年を選んでください。";
  return errors;
}

/** API に送る本文。同意（consent）が入っていないときは作れない */
export function toRequest(form: OnboardingForm): OnboardingRequest | null {
  if (!form.consent || form.schoolLevel === "") return null;
  return {
    nickname: form.nickname.trim(),
    school_level: form.schoolLevel,
    grade: form.grade,
    terms_version: TERMS_VERSION,
    privacy_notice_version: PRIVACY_NOTICE_VERSION,
    consent_confirmed: true,
  };
}

/** 登録に失敗したときに画面へ出す文。入力した内容は消さない */
export function messageForError(e: unknown): string {
  if (isNetworkError(e)) return "通信できませんでした。入力した内容は消えていません。もう一度押してください。";
  // 400 は API が日本語の理由を返す（例：ニックネームは1〜40文字で入力してください。）
  if (e instanceof ApiError && e.status === 400 && e.message) return e.message;
  return "登録できませんでした。入力した内容は消えていません。少し待ってから、もう一度押してください。";
}
