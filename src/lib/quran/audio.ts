import type { Qari } from "./types";

/**
 * Reciter library — 20 qaris.
 * RTL 2-col grid: [0]=top-right, [1]=top-left, [2]=row2-right…
 * Order is intentional — do not reorder casually.
 */
export const QARIS: Qari[] = [
  // ── Top 10 (explicit product order) ───────────────────────────────────
  {
    id: "alafasy",
    nameAr: "مشاري راشد العفاسي",
    nameEn: "Mishary Alafasy",
    image: "/qaris/alafasy.jpg",
    everyAyahFolder: "Alafasy_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "قارئ كويتي معروف بصوته الهادئ وترتيبه الواضح — مناسب للحفظ.",
  },
  {
    id: "minshawi",
    nameAr: "محمد صديق المنشاوي",
    nameEn: "Al-Minshawi",
    image: "/qaris/minshawi.jpg",
    everyAyahFolder: "Minshawy_Murattal_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "من أشهر قرّاء مصر — ترتيل واضح.",
  },
  {
    id: "husary",
    nameAr: "محمود خليل الحصري",
    nameEn: "Mahmoud Al-Husary",
    image: "/qaris/husary.jpg",
    everyAyahFolder: "Husary_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "مرجع كلاسيكي في الترتيل — ممتاز للمبتدئين والتعلّم.",
  },
  {
    id: "dosari",
    nameAr: "ياسر الدوسري",
    nameEn: "Yasser Al-Dosari",
    image: "/qaris/dosari.jpg",
    everyAyahFolder: "Yasser_Ad-Dussary_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "إمام المسجد الحرام — صوت مؤثر.",
  },
  {
    id: "maher",
    nameAr: "ماهر المعيقلي",
    nameEn: "Maher Al-Muaiqly",
    image: "/qaris/maher.jpg",
    everyAyahFolder: "MaherAlMuaiqly128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "إمام المسجد الحرام — صوت عذب ومناسب للاستماع المتكرر.",
  },
  {
    id: "abdulbasit",
    nameAr: "عبد الباسط عبد الصمد",
    nameEn: "Abdul Basit",
    image: "/qaris/abdulbasit.jpg",
    everyAyahFolder: "Abdul_Basit_Murattal_192kbps",
    style: "مرتل",
    bitrate: "192",
    bioAr: "صوت عالمي خالد — ترتيل هادئ للحفظ.",
  },
  {
    id: "ali_jaber",
    nameAr: "علي جابر",
    nameEn: "Ali Jaber",
    image: "/qaris/ali_jaber.jpg",
    everyAyahFolder: "Ali_Jaber_64kbps",
    style: "مرتل",
    bitrate: "64",
    bioAr:
      "الشيخ علي عبد الله جابر — إمام سابق للمسجد الحرام · تسجيل كامل ١١٤ سورة.",
  },
  {
    id: "qatami",
    nameAr: "ناصر القطامي",
    nameEn: "Nasser Al-Qatami",
    image: "/qaris/qatami.webp",
    everyAyahFolder: "Nasser_Alqatami_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "قارئ سعودي بأداء عصري مؤثر — شائع بين الشباب.",
  },
  {
    id: "banna",
    nameAr: "محمود علي البنا",
    nameEn: "Mahmoud Ali Al-Banna",
    image: "/qaris/default-portrait.jpg",
    everyAyahFolder: "banna_48kbps",
    style: "مرتل",
    bitrate: "48",
    bioAr: "الشيخ محمود علي البنا — صوت مصري كلاسيكي عذب · تسجيل كامل على everyayah.",
  },
  {
    id: "neana",
    nameAr: "أحمد نعينع",
    nameEn: "Ahmed Neana",
    image: "/qaris/neana.jpg",
    everyAyahFolder: "Ahmed_Neana_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "قارئ مصري بصوت هادئ واضح — مناسب للحفظ والتكرار.",
  },
  // ── Remaining 9 (any order) — Ghamadi MUST be last (#20) ─────────────
  {
    id: "sudais",
    nameAr: "عبد الرحمن السديس",
    nameEn: "Abdurrahman As-Sudais",
    image: "/qaris/sudais.jpg",
    everyAyahFolder: "Abdurrahmaan_As-Sudais_192kbps",
    style: "مرتل",
    bitrate: "192",
    bioAr: "إمام المسجد الحرام — تلاوة مؤثرة شائعة في العالم الإسلامي.",
  },
  {
    id: "ajamy",
    nameAr: "أحمد العجمي",
    nameEn: "Ahmed Al-Ajmy",
    image: "/qaris/ajamy.jpg",
    everyAyahFolder: "Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net",
    style: "مرتل",
    bitrate: "128",
    bioAr: "قارئ سعودي بأداء واضح يفضّله كثير من الحفّاظ.",
  },
  {
    id: "shuraim",
    nameAr: "سعود الشريم",
    nameEn: "Saud Ash-Shuraim",
    image: "/qaris/shuraim.jpg",
    everyAyahFolder: "Saood_ash-Shuraym_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "إمام المسجد الحرام — تلاوة رصينة.",
  },
  {
    id: "ayyoub",
    nameAr: "محمد أيوب",
    nameEn: "Muhammad Ayyoub",
    image: "/qaris/ayyoub.jpg",
    everyAyahFolder: "Muhammad_Ayyoub_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "إمام سابق للمسجد النبوي — أداء متقن.",
  },
  {
    id: "shaatree",
    nameAr: "أبو بكر الشاطري",
    nameEn: "Abu Bakr Ash-Shaatree",
    image: "/qaris/shaatree.jpg",
    everyAyahFolder: "Abu_Bakr_Ash-Shaatree_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "قارئ يمني مشهور بتلاوة سلسة.",
  },
  {
    id: "hudhaify",
    nameAr: "علي الحذيفي",
    nameEn: "Ali Al-Hudhaify",
    image: "/qaris/hudhaify.jpg",
    everyAyahFolder: "Hudhaify_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "إمام المسجد النبوي — ترتيل واضح للمراجعة.",
  },
  {
    id: "basfar",
    nameAr: "عبد الله بصفر",
    nameEn: "Abdullah Basfar",
    image: "/qaris/basfar.jpg",
    everyAyahFolder: "Abdullah_Basfar_192kbps",
    style: "مرتل",
    bitrate: "192",
    bioAr: "ترتيل هادئ مناسب للتكرار الطويل.",
  },
  {
    id: "jibreel",
    nameAr: "محمد جبريل",
    nameEn: "Muhammad Jibreel",
    image: "/qaris/jibreel.jpg",
    everyAyahFolder: "Muhammad_Jibreel_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "قارئ مصري معروف بأداء خاشع.",
  },
  {
    id: "fares_abbad",
    nameAr: "فارس عباد",
    nameEn: "Fares Abbad",
    image: "/qaris/fares_abbad.webp",
    everyAyahFolder: "Fares_Abbad_64kbps",
    style: "مرتل",
    bitrate: "64",
    bioAr: "قارئ يمني — صوت عذب مناسب للاستماع الطويل.",
  },
  // #20 last — سعد الغامدي
  {
    id: "ghamadi",
    nameAr: "سعد الغامدي",
    nameEn: "Saad Al-Ghamadi",
    image: "/qaris/ghamadi.jpg",
    everyAyahFolder: "Ghamadi_40kbps",
    style: "مرتل",
    bitrate: "40",
    bioAr: "من أكثر الأصوات استماعاً في العالم العربي.",
  },
];

export const INCOMPLETE_QARI_IDS = new Set([
  "mustafa_ismail",
  "hazza_al_balushi",
  "islam_sobhi",
]);

export const QARI_CDN_AUDIT: Record<
  string,
  { complete114: boolean; source: string; note: string }
> = {
  mustafa_ismail: {
    complete114: false,
    source: "everyayah.com/data/Mustafa_Ismail_48kbps",
    note: "~4220 missing ayah files — excluded",
  },
  islam_sobhi: {
    complete114: false,
    source: "mp3quran surah pack",
    note: "Removed from UI library",
  },
  hazza_al_balushi: {
    complete114: false,
    source: "absent V2V",
    note: "Excluded",
  },
  banna: {
    complete114: true,
    source: "everyayah.com/data/banna_48kbps",
    note: "Mahmoud Ali Al-Banna full pack",
  },
};

export function getQari(id: string): Qari | undefined {
  return QARIS.find((q) => q.id === id);
}

export function getAvailableQaris(): Qari[] {
  return QARIS.filter((q) => !INCOMPLETE_QARI_IDS.has(q.id));
}

export function resolvePlayableQariId(preferredId?: string | null): string {
  if (
    preferredId &&
    getQari(preferredId) &&
    !INCOMPLETE_QARI_IDS.has(preferredId)
  ) {
    return preferredId;
  }
  if (preferredId === "islam_sobhi") return "alafasy";
  return "alafasy";
}

function everyayahVerseUrl(
  folder: string,
  surahNumber: number,
  ayahNumber: number
): string {
  const s = String(surahNumber).padStart(3, "0");
  const a = String(ayahNumber).padStart(3, "0");
  return `https://everyayah.com/data/${folder}/${s}${a}.mp3`;
}

export function ayahAudioUrl(
  qari: Qari | string,
  surahNumber: number,
  ayahNumber: number
): string {
  const resolvedId =
    typeof qari === "string" ? resolvePlayableQariId(qari) : qari.id;
  const q =
    typeof qari === "string"
      ? getQari(resolvedId)
      : INCOMPLETE_QARI_IDS.has(qari.id)
        ? getQari("alafasy")
        : qari;

  if (!q) {
    return everyayahVerseUrl("Alafasy_128kbps", surahNumber, ayahNumber);
  }

  if (q.playbackMode === "surah" && q.surahBaseUrl) {
    const missing = q.missingSurahs || [];
    if (missing.includes(surahNumber)) {
      return everyayahVerseUrl("Alafasy_128kbps", surahNumber, ayahNumber);
    }
    const s = String(surahNumber).padStart(3, "0");
    return `${q.surahBaseUrl}${s}.mp3`;
  }

  const folder = q.everyAyahFolder || "Alafasy_128kbps";
  if (folder === "surah") {
    return everyayahVerseUrl("Alafasy_128kbps", surahNumber, ayahNumber);
  }
  return everyayahVerseUrl(folder, surahNumber, ayahNumber);
}

export function qariPreviewAudioUrl(qari: Qari | string): string {
  const q =
    typeof qari === "string" ? getQari(resolvePlayableQariId(qari)) : qari;
  if (q?.playbackMode === "surah") {
    return ayahAudioUrl(qari, 1, 1);
  }
  return ayahAudioUrl(qari, 1, 2);
}
