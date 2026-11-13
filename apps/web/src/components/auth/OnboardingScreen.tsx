"use client";

import { useId, useState, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { PeerAvatar } from "@/components/PeerAvatar";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  NICKNAME_MAX,
  emptyForm,
  messageForError,
  toRequest,
  validate,
  type FieldName,
  type FormErrors,
  type OnboardingForm,
} from "@/lib/onboarding";

/** 選択肢（ラジオ）の1つ。選ばれているときは色に加えて ✓ も出す（色だけに頼らない） */
function Choice({
  name,
  checked,
  onChange,
  describedBy,
  id,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  describedBy?: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <label className="group relative flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-2xl border-[1.5px] border-outline bg-card px-4 text-[16px] font-bold text-ink has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link">
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        aria-describedby={describedBy}
        className="sr-only"
      />
      <span aria-hidden="true" className="mr-1.5 hidden group-has-[:checked]:inline">
        ✓
      </span>
      {children}
    </label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-[13.5px] font-bold text-danger">
      {message}
    </p>
  );
}

/**
 * 初回設定の画面（docs/04 の 9、デザイン 00b_onboarding・m00b_onboarding）。
 * ニックネーム・校種・学年だけを聞き、データの扱いを説明して、同意のチェックのあとに登録する。
 * 同意のチェックがなければ「はじめる」は押せない。氏名・学校名・生年月日は聞かない。
 */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { signOut } = useAuth();
  const uid = useId();
  const [form, setForm] = useState<OnboardingForm>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const ids = {
    nickname: `${uid}-nickname`,
    nicknameHint: `${uid}-nickname-hint`,
    nicknameError: `${uid}-nickname-error`,
    schoolLevel: `${uid}-school`,
    schoolLevelError: `${uid}-school-error`,
    grade: `${uid}-grade`,
    gradeError: `${uid}-grade-error`,
    consentHint: `${uid}-consent-hint`,
  };

  const update = (patch: Partial<OnboardingForm>, clear?: FieldName) => {
    setForm((f) => ({ ...f, ...patch }));
    if (clear) setErrors((e) => ({ ...e, [clear]: undefined }));
    setSubmitError(null);
  };

  const focusFirst = (e: FormErrors) => {
    const target = e.nickname ? ids.nickname : e.schoolLevel ? `${ids.schoolLevel}-middle` : `${ids.grade}-1`;
    document.getElementById(target)?.focus();
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    const body = toRequest(form);
    if (!body) return; // 同意がないときは送らない
    setBusy(true);
    setSubmitError(null);
    try {
      await api.completeOnboarding(body); // 201（初回）でも 200（登録済み）でも、次へ進む
      onDone();
    } catch (e) {
      setSubmitError(messageForError(e));
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 pt-10 pb-12 lg:pt-14">
      <div className="flex w-full max-w-[480px] flex-col items-center">
        <Logo className="h-9 lg:h-8" />
        <div className="mt-5 flex size-[96px] items-center justify-center rounded-[24px] bg-gradient-to-b from-[#F3F6FE] to-[#DCE6FB]">
          <PeerAvatar state="idle" size={88} decorative />
        </div>
        <h1 className="mt-5 text-center text-[24px] leading-snug font-black">はじめての設定</h1>
        <p className="mt-2 text-center text-[14.5px] leading-relaxed text-sub">
          ニックネーム・校種・学年だけを教えてください。
          <br />
          氏名・学校名・生年月日は登録しません。
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-6 flex w-full flex-col gap-4">
          <section className="rounded-card border border-line bg-card p-5" aria-labelledby={`${uid}-profile`}>
            <h2 id={`${uid}-profile`} className="text-[17px] font-black">
              あなたのこと
            </h2>

            <div className="mt-4">
              <label htmlFor={ids.nickname} className="text-[15px] font-bold">
                ニックネーム
                <span className="ml-1.5 text-[12.5px] font-bold text-danger">必須</span>
              </label>
              <input
                id={ids.nickname}
                type="text"
                value={form.nickname}
                onChange={(e) => update({ nickname: e.target.value }, "nickname")}
                autoComplete="nickname"
                maxLength={NICKNAME_MAX * 2}
                aria-required="true"
                aria-invalid={errors.nickname ? true : undefined}
                aria-describedby={`${ids.nicknameHint}${errors.nickname ? ` ${ids.nicknameError}` : ""}`}
                className="mt-2 h-12 w-full rounded-2xl border-[1.5px] border-outline bg-card px-4 text-[16px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link aria-[invalid=true]:border-danger"
              />
              <p id={ids.nicknameHint} className="mt-2 text-[13px] leading-relaxed text-sub">
                画面に表示される名前です。本名でなくてかまいません（{NICKNAME_MAX}文字まで）。
              </p>
              <FieldError id={ids.nicknameError} message={errors.nickname} />
            </div>

            <fieldset className="mt-5" aria-describedby={errors.schoolLevel ? ids.schoolLevelError : undefined}>
              <legend className="text-[15px] font-bold">
                校種<span className="ml-1.5 text-[12.5px] font-bold text-danger">必須</span>
              </legend>
              <div className="mt-2 flex gap-3">
                <Choice
                  id={`${ids.schoolLevel}-middle`}
                  name="school_level"
                  checked={form.schoolLevel === "middle"}
                  onChange={() => update({ schoolLevel: "middle" }, "schoolLevel")}
                  describedBy={errors.schoolLevel ? ids.schoolLevelError : undefined}
                >
                  中学校
                </Choice>
                <Choice
                  id={`${ids.schoolLevel}-high`}
                  name="school_level"
                  checked={form.schoolLevel === "high"}
                  onChange={() => update({ schoolLevel: "high" }, "schoolLevel")}
                  describedBy={errors.schoolLevel ? ids.schoolLevelError : undefined}
                >
                  高校
                </Choice>
              </div>
              <FieldError id={ids.schoolLevelError} message={errors.schoolLevel} />
            </fieldset>

            <fieldset className="mt-5" aria-describedby={errors.grade ? ids.gradeError : undefined}>
              <legend className="text-[15px] font-bold">
                学年<span className="ml-1.5 text-[12.5px] font-bold text-danger">必須</span>
              </legend>
              <div className="mt-2 flex gap-3">
                {[1, 2, 3].map((g) => (
                  <Choice
                    key={g}
                    id={`${ids.grade}-${g}`}
                    name="grade"
                    checked={form.grade === g}
                    onChange={() => update({ grade: g }, "grade")}
                    describedBy={errors.grade ? ids.gradeError : undefined}
                  >
                    {g}年
                  </Choice>
                ))}
              </div>
              <FieldError id={ids.gradeError} message={errors.grade} />
            </fieldset>
          </section>

          <section className="rounded-card border border-line bg-card p-5" aria-labelledby={`${uid}-data`}>
            <h2 id={`${uid}-data`} className="text-[17px] font-black">
              データの扱い
            </h2>
            <ul className="mt-3 list-disc space-y-2.5 pl-5 text-[14px] leading-relaxed">
              <li>
                登録するのは、ニックネーム・校種・学年だけです。氏名・学校名・生年月日は登録しません。
              </li>
              <li>
                授業で書いた文章（説明や質問）は、ぴあ友の返事をつくったり、説明力を評価したりするために、
                <strong>外部のAI事業者に送ります</strong>
                。メールアドレスやGoogleアカウントの情報は送りません。
              </li>
              <li>
                文章の中に、名前・学校名・住所などを書かないでください。書いた内容はそのまま送られます。
              </li>
              <li>
                会話の全文は、原則として<strong>サーバーに保存しません</strong>
                。画面を開いている間だけ、この端末のブラウザの中に置きます。
              </li>
              <li>
                外部のAI事業者での保存期間や利用条件、データを削除するしくみは、確認中です。確認できしだい、この説明を更新します。
              </li>
            </ul>
            <p className="mt-3 text-[13px] leading-relaxed text-sub">
              このアプリは、ハッカソン用の限定公開です。不安なときは、保護者の方や先生に相談してから進んでください。
            </p>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-soft p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => update({ consent: e.target.checked })}
                aria-describedby={ids.consentHint}
                className="mt-0.5 size-6 shrink-0 accent-primary"
              />
              <span className="text-[15px] leading-relaxed font-bold">
                「データの扱い」を読んで、内容を理解したうえで同意します。
              </span>
            </label>
          </section>

          {submitError && (
            <p className="rounded-xl bg-[#FDECEC] px-4 py-3 text-[14px] font-bold text-danger" role="alert">
              {submitError}
            </p>
          )}

          <div>
            <button
              type="submit"
              disabled={!form.consent || busy}
              className="h-14 w-full rounded-2xl bg-primary text-[17px] font-bold text-white transition-colors hover:bg-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "登録しています…" : "はじめる"}
            </button>
            <p id={ids.consentHint} className="mt-2 text-center text-[13px] text-sub">
              {form.consent ? "ログインはGoogleアカウントだけです。" : "同意のチェックを入れると、「はじめる」を押せます。"}
            </p>
          </div>
        </form>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-3 inline-flex min-h-11 items-center px-3 text-[13.5px] font-bold text-link underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
        >
          別のアカウントでログインしなおす
        </button>
      </div>
    </main>
  );
}
