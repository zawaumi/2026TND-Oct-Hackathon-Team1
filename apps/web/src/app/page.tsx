export default function Home() {
  const count: number = "ぴあとも"; // CIの失敗確認用（あとで取り消す）
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-indigo-50 text-slate-900">
      <h1 className="text-4xl font-bold text-blue-700">ぴあとも</h1>
      <p className="text-slate-600">AIに教えて学ぶ学習アプリ（準備中）</p>
    </main>
  );
}