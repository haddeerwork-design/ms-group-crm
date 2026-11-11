import { PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { replayTour } from '@/components/layout/WelcomeTour'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// User guide in Arabic (Egyptian, simple). Screen names stay in English as they appear in the app.
const SECTIONS: { title: string; items: string[] }[] = [
  { title: 'البداية', items: [
    'ادخل بالإيميل والباسورد بتوعك. لو ظهرلك إن مالكش role، كلّم الـ Super Admin يديك صلاحية من Team & Roles.',
    'اللي بتشوفه في القايمة الجانبية على حسب الـ role بتاعك. الداتا نفسها محمية من الداتابيز، مش بس بإخفاء الزراير.',
    'ابحث عن أي حاجة من أي مكان: دوس Ctrl + K (أو زرار Search فوق) واكتب اسم شركة، رقم quotation أو order، رقم B/L أو container، أو اسم منتج.',
    'زرار New فوق بيضيف بسرعة شركة أو task أو quotation.',
  ] },
  { title: 'اختصارات الكيبورد', items: [
    'Ctrl + K أو / : البحث في السيستم كله.',
    'N : قايمة New (شركة، deal، task، quotation).',
    'Ctrl + S : حفظ عرض السعر أو البروفورما أو خطة الكونتينر وانت جواها.',
    'لو قفلت صفحة فيها تعديلات مش محفوظة، السيستم بيسألك الأول. ولما تأرشف حاجة يظهرلك زرار Undo كام ثانية.',
  ] },
  { title: 'CRM & Importers', items: [
    'كل شركة ليها صفحة فيها: الـ timeline، الـ deals والـ tasks، الـ contacts، والـ quotations.',
    'قبل ما تضيف شركة، السيستم بيدوّر لو هي موجودة باسم أو website أو إيميل أو تليفون شبهها، وبيقولك مين صاحبها.',
    'حدّد Next follow-up لكل شركة؛ المتأخر بيظهر بالأحمر في الـ Dashboard.',
    'تقدر تعمل Import من Excel/CSV وExport لـ CSV.',
  ] },
  { title: 'Market Research', items: [
    'هنا بتسجّل الشركات اللي لقيتها وانت بتدوّر على مشترين، مع لينك المصدر.',
    'الحالة بتمشي بالترتيب: Unverified lead، بعدها Potential buyer، بعدها Verified importer. مينفعش تختار Verified importer من غير لينك يثبت إنهم بيستوردوا.',
    'لما تبقى جاهز تتواصل، دوس Add to CRM؛ السيستم بيتأكد إنها مش موجودة قبل كده.',
  ] },
  { title: 'Sales Pipeline و Tasks', items: [
    'اسحب الـ deal من مرحلة لمرحلة. كل تغيير بيتسجّل.',
    'الـ tasks ليها تاريخ وأولوية. المدير بس يقدر يدي task لحد تاني. الإشعارات بتظهر في الجرس فوق.',
  ] },
  { title: 'Products و Pricing', items: [
    'كل منتج ليه packaging وموسم. الأسعار بتتحفظ كنسخ (history) ومش بتتمسح.',
    'سعر الصرف بيدخله الشخص المسؤول بإيده مع تاريخه؛ السيستم بيحذّرك لو قديم. مفيش أرقام بتتألف.',
  ] },
  { title: 'Container Planner و Quotations', items: [
    'الـ planner بيحسب الكراتين والباليتات والوزن على حسب الـ packaging وسعة الـ container اللي انت مدخلها.',
    'الـ quotation بتطلع على letterhead الشركة وتتطبع PDF. بعد ما تتبعت متتعدلش؛ لو محتاج تغيير اعمل Revise وبيتحفظ نسخة.',
    'لما العميل يوافق (Accepted) تقدر تعمل منها Proforma invoice بزرار واحد.',
  ] },
  { title: 'Proforma Invoices و Orders', items: [
    'الـ proforma بعد ما تتعمل Issue تقدر تحوّلها Order.',
    'الـ order بيمشي في مراحل من Confirmed لحد Completed. اللوجيستيكس بيعدّل بيانات الشحن والمرحلة بس.',
    'ارفع المستندات (Invoice، Packing list، Phyto…) جوه الـ order. الملفات private ومحدش يشوفها غير اللي ليه صلاحية.',
  ] },
  { title: 'Payments', items: [
    'اعمل جدول دفعات للـ order (مثلاً 50% مقدّم و50% بعد الـ B/L).',
    'تسجيل دفعة محتاج تاريخ وطريقة دفع ورقم مرجع. الفايننس والمدير بس اللي يسجّلوا.',
  ] },
  { title: 'Dashboard و Reports', items: [
    'الأرقام حيّة من الداتا. اختار الفترة، والمدير يقدر يختار موظف معيّن.',
    'الفلوس مش بتتحوّل بين العملات أبداً؛ كل عملة لوحدها.',
    'Reports: اختار التقرير والفترة، وبعدين CSV (يفتح على Excel) أو Print.',
  ] },
  { title: 'Old CRM archive', items: [
    'نسخة للقراءة بس من الـ CRM القديم: الـ quotations والـ invoices القديمة وسجل النشاط. محدش يقدر يعدّلها أو يمسحها.',
  ] },
  { title: 'للـ Super Admin', items: [
    'موظف جديد: من Team & Roles دوس Add employee، اكتب الاسم والإيميل واختار الـ role. هيطلعلك باسورد مؤقت ابعته للموظف، وهو هيغيّره أول ما يدخل. لو حد نسي الباسورد أو ساب الشغل، دوس Manage جنب اسمه: Reset password، أو Deactivate (مش هيقدر يدخل وشغله بيفضل محفوظ باسمه)، أو Delete للحسابات التجريبية بس.',
    'في Company Settings تحت فيه System check: Run security check بيتأكد إن مفيش حاجة مكشوفة، وRefresh old-CRM archive بياخد آخر نسخة من الـ CRM القديم.',
    'أوعى تحط الـ service_role key في أي حتة في الـ app أو تبعته لحد.',
  ] },
]

export function Help() {
  return (
    <>
      <PageHeader title="Help" summary="Quick user guide (Arabic)." action={<Button variant="outline" onClick={replayTour}><PlayCircle />Take the 1-minute tour</Button>} />
      <div dir="rtl" lang="ar" className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.title}>
            <CardHeader><CardTitle>{s.title}</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed">{s.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
