import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-6xl font-bold text-[#ff1e27] mb-4">404</h1>
      <h2 className="text-2xl font-semibold mb-2">الصفحة غير موجودة</h2>
      <p className="text-gray-400 mb-6">عذراً، الصفحة التي تبحث عنها غير متوفرة.</p>
      <Link
        href="/"
        className="px-6 py-2.5 rounded-full bg-[#ff1e27] text-white font-medium hover:bg-[#e01921] transition-colors"
      >
        العودة للرئيسية
      </Link>
    </div>
  );
}
