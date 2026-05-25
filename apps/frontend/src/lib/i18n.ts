import { useEffect, useState } from "react";

export type LanguageCode = "en" | "fr" | "ar";

const LANGUAGE_KEY = "nevo.language";
const LANGUAGE_EVENT = "nevo:language-change";

const arabicLabels: Record<string, string> = {
  "AI trading hub": "منصة التداول الذكي",
  "Assets hub": "مركز الأصول",
  "Strategy hub": "مركز الاستراتيجية",
  "Equipe": "الفريق",
  "Home": "الرئيسية",
  "Assets": "الأصول",
  "Strategy": "الاستراتيجية",
  "Team": "الفريق",
  "My Profile": "ملفي",
  "Notifications": "الإشعارات",
  "Language": "اللغة",
  "Support": "الدعم",
  "Sign out": "تسجيل الخروج",
  "Logout": "تسجيل الخروج",
  "Missions": "المهام",
  "Strategie": "الاستراتيجية",
  "Aujourd'hui": "اليوم",
  "Facture": "الفواتير",
  "Historique": "السجل",
  "Mon Niveau": "مستواي",
  "Revenus D'aujourd'hui": "دخل اليوم",
  "Solde Du Compte": "رصيد الحساب",
  "Revenus Totaux": "إجمالي الدخل",
  "Fonds De Strategie Disponibles": "أموال الاستراتيجية المتاحة",
  "Revenus D'equipe": "دخل الفريق",
  "Reservation live": "الحجز نشط",
  "Daily limit reached": "تم بلوغ الحد اليومي",
  "Next reservation": "الحجز التالي",
  "Deposit required": "الإيداع مطلوب",
  "Start now": "ابدأ الآن",
  "Fund account": "اشحن الحساب",
  "All reservations are complete. Slots reset at 5:00 AM.": "اكتملت كل الحجوزات. يتم التحديث عند 5:00 صباحا.",
  "The current 5 AM reservation window is open now.": "نافذة الحجز الحالية مفتوحة الآن.",
  "Fund the account to unlock the reservation window.": "اشحن الحساب لفتح نافذة الحجز.",
  "Tap for all VIPs": "اضغط لكل مستويات VIP",
  "Strategie V": "استراتيجية V",
  "execution track": "مسار التنفيذ",
  "Running": "قيد التشغيل",
  "Ready": "جاهز",
  "Locked": "مقفل",
  "Reset at 5 AM": "إعادة الضبط 5 صباحا",
  "Taux De Rendement Quotidien": "معدل العائد اليومي",
  "Depot Minimum": "الحد الأدنى للإيداع",
  "Actifs Participants": "الأصول المشاركة",
  "Utilisations Quotidiennes": "الاستخدامات اليومية",
  "Reservation Amount": "مبلغ الحجز",
  "Run in progress": "التشغيل جار",
  "Ready to activate": "جاهز للتفعيل",
  "Open Reservation": "فتح الحجز",
  "Reservation Running": "الحجز جار",
  "Wait For 5 AM": "انتظر حتى 5 صباحا",
  "Deposit": "إيداع",
  "Withdrawal": "سحب",
  "Trading income": "دخل التداول",
  "Team income": "دخل الفريق",
  "Confirmation De Réservation": "تأكيد الحجز",
  "Montant De Réservation": "مبلغ الحجز",
  "Mot De Passe": "كلمة المرور",
  "Tout": "الكل",
  "Confirmer": "تأكيد",
  "Confirmation...": "جار التأكيد...",
  "Impossible De Participer, Veuillez Contacter Votre Gestionnaire De Compte": "لا يمكن المشاركة، يرجى الاتصال بمدير حسابك",
  "Veuillez Vous Connecter Avant De Confirmer": "يرجى تسجيل الدخول قبل التأكيد",
  "Montant De Réservation Invalide": "مبلغ الحجز غير صالح",
  "Veuillez Saisir Votre Mot De Passe": "يرجى إدخال كلمة المرور",
  "Revenus Totaux(USDT)": "إجمالي الدخل (USDT)",
  "Enregistrements De Revenus": "سجلات الدخل",
  "Revenus D'aujourd'hui(USDT)": "دخل اليوم (USDT)",
  "Revenus D'équipe Totaux(USDT)": "إجمالي دخل الفريق (USDT)",
  "Revenus D'équipe D'aujourd'hui(USDT)": "دخل الفريق اليوم (USDT)",
  "Mon Équipe": "فريقي",
  "Comptage D'équipe": "عدد الفريق",
  "Revenus D'équipe": "دخل الفريق",
  "Aujourd'hui Ajouté": "أضيف اليوم",
  "Liste D'équipe": "قائمة الفريق",
  "générations": "أجيال",
  "Apercu Des Actifs": "نظرة عامة على الأصول",
  "Mes Revenus": "دخلي",
  "Total assets (USDT)": "إجمالي الأصول (USDT)",
  "Actifs Disponibles": "الأصول المتاحة",
  "En Attente De Sortie": "قيد السحب",
  "Total Verrouille": "إجمالي المقفل",
  "Deposer": "إيداع",
  "Retirer": "سحب",
  "Voir Les Revenus": "عرض الدخل",
  "Revenus Totaux (USDT)": "إجمالي الدخل (USDT)",
  "Revenus D'aujourd'hui (USDT)": "دخل اليوم (USDT)",
  "Revenus De Trading Totaux (USDT)": "إجمالي دخل التداول (USDT)",
  "Revenus De Trading D'aujourd'hui (USDT)": "دخل التداول اليوم (USDT)",
  "Revenus D'equipe Totaux (USDT)": "إجمالي دخل الفريق (USDT)",
  "Revenus D'equipe D'aujourd'hui (USDT)": "دخل الفريق اليوم (USDT)",
  "Liste Des Actifs": "قائمة الأصول",
  "Available": "متاح",
  "Active investment": "الاستثمار النشط",
  "Loading balances...": "جار تحميل الأرصدة...",
  "No wallet balances yet.": "لا توجد أرصدة بعد.",
  "Loading records...": "جار تحميل السجلات...",
  "No asset invoices yet.": "لا توجد فواتير أصول بعد.",
  "Recent account activity": "آخر نشاط للحساب",
  "Loading notifications...": "جار تحميل الإشعارات...",
  "No notifications yet.": "لا توجد إشعارات بعد.",
  "Strategy Scale": "حجم الاستراتيجية",
  "Cumulative Participants": "إجمالي المشاركين",
  "Cumulative Orders": "إجمالي الطلبات",
  "Hot List": "الأكثر نشاطا",
  "Gain List": "قائمة الارتفاع",
  "Currency": "العملة",
  "Price": "السعر",
  "24H Change": "تغير 24 ساعة",
  "Loading market feed...": "جار تحميل السوق...",
  "Market feed is unavailable right now.": "بيانات السوق غير متاحة حاليا.",
  "Live wallet": "المحفظة المباشرة",
  "Deposit Records": "سجلات الإيداع",
  "Agency\nCooperation": "تعاون\nالوكالة",
  "Invite\nFriends": "دعوة\nالأصدقاء",
  "VIP\nUpgrade": "ترقية\nVIP",
  "Online\nService": "الخدمة\nالمباشرة",
  "Top Up": "شحن",
  "Mission\nCenter": "مركز\nالمهام",
  "Help\nCenter": "مركز\nالمساعدة",
  "Deposit request created": "تم إنشاء طلب الإيداع",
  "fund your account": "اشحن حسابك",
  "Wallet address": "عنوان المحفظة",
  "Withdraw": "سحب",
  "request payout": "طلب السحب",
  "display": "العرض",
  "online service": "الخدمة المباشرة",
  "account protection": "حماية الحساب",
  "Personal Information": "المعلومات الشخصية",
  "Department Order": "أوامر القسم",
  "Login Password": "كلمة مرور الدخول",
  "Security Center": "مركز الأمان",
  "Activity Information": "معلومات النشاط",
  "Help Center": "مركز المساعدة",
  "User ID": "معرف المستخدم",
  "Referral code": "رمز الدعوة",
  "Not available": "غير متاح",
  "Transaction Password": "كلمة مرور المعاملة",
  "Withdrawal Address": "عنوان السحب",
  "Real-Name Verification": "التحقق من الاسم الحقيقي",
  "Phone Number": "رقم الهاتف",
  "Email": "البريد الإلكتروني",
  "Go To Setting": "اذهب للإعدادات",
  "Already Set": "تم الإعداد",
  "Online Service": "الخدمة المباشرة",
  "English": "English",
  "Francais": "Français",
  "العربية": "العربية"
};

export const readLanguage = (): LanguageCode => {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  return stored === "fr" || stored === "ar" ? stored : "en";
};

export const applyLanguagePreference = (language: LanguageCode) => {
  localStorage.setItem(LANGUAGE_KEY, language);
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  window.dispatchEvent(new CustomEvent<LanguageCode>(LANGUAGE_EVENT, { detail: language }));
};

export const getNextLanguage = (language: LanguageCode) => (language === "en" ? "fr" : language === "fr" ? "ar" : "en");

export const translateText = (language: LanguageCode, text: string) => {
  if (language !== "ar") {
    return text;
  }

  return arabicLabels[text] ?? text;
};

export function useAppLanguage() {
  const [language, setLanguage] = useState<LanguageCode>(() => readLanguage());

  useEffect(() => {
    applyLanguagePreference(language);

    const syncLanguage = () => setLanguage(readLanguage());
    window.addEventListener("storage", syncLanguage);
    window.addEventListener(LANGUAGE_EVENT, syncLanguage);

    return () => {
      window.removeEventListener("storage", syncLanguage);
      window.removeEventListener(LANGUAGE_EVENT, syncLanguage);
    };
  }, [language]);

  return language;
}
