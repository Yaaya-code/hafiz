import type { Qari } from "./types";

/**
 * Reciter library — only reciters with full 114-surah everyayah.com libraries.
 * URL: https://everyayah.com/data/{folder}/{SSS}{AAA}.mp3
 * Portraits: /public/qaris/{id}.jpg (real photos, circular in UI)
 */
export const QARIS: Qari[] = [
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
    id: "ghamadi",
    nameAr: "سعد الغامدي",
    nameEn: "Saad Al-Ghamadi",
    image: "/qaris/ghamadi.jpg",
    everyAyahFolder: "Ghamadi_40kbps",
    style: "مرتل",
    bitrate: "40",
    bioAr: "من أكثر الأصوات استماعاً في العالم العربي.",
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
    id: "neana",
    nameAr: "أحمد نعينع",
    nameEn: "Ahmed Neana",
    image: "/qaris/neana.jpg",
    everyAyahFolder: "Ahmed_Neana_128kbps",
    style: "مرتل",
    bitrate: "128",
    bioAr: "قارئ مصري بصوت هادئ واضح — مناسب للحفظ والتكرار.",
  },
  // Omitted incomplete packs (see INCOMPLETE_QARI_IDS + QARI_CDN_AUDIT):
  // - Mustafa Ismail — everyayah ~4220 missing
  // - Hazza Al Balushi — no reliable complete pack on app CDNs
  // Islam Sobhi: added via mp3quran surah-level (109/114) — missing → Alafasy verse.
  {
    id: "islam_sobhi",
    nameAr: "إسلام صبحي",
    nameEn: "Islam Sobhi",
    image: "/qaris/default-portrait.jpg",
    everyAyahFolder: "surah", // not everyayah — see surahBaseUrl
    style: "مرتل",
    bitrate: "128",
    bioAr:
      "قارئ مصري معاصر بصوت خاشع — تسجيل سورة-بسورة (mp3quran · ١٠٩ سورة). السور الناقصة تُكمَّل بالعفاسي.",
    playbackMode: "surah",
    surahBaseUrl:
      "https://server14.mp3quran.net/islam/Rewayat-Hafs-A-n-Assem/",
    // mp3quran surah_list omits: 37, 39, 40, 45, 65
    missingSurahs: [37, 39, 40, 45, 65],
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
    id: "fares_abbad",
    nameAr: "فارس عباد",
    nameEn: "Fares Abbad",
    image: "/qaris/fares_abbad.webp",
    everyAyahFolder: "Fares_Abbad_64kbps",
    style: "مرتل",
    bitrate: "64",
    bioAr: "قارئ يمني — صوت عذب مناسب للاستماع الطويل.",
  },
  {
    id: "ali_jaber",
    nameAr: "علي جابر",
    nameEn: "Ali Jaber",
    /** Local verified portrait (Wikimedia face photo) — other qaris untouched */
    image: "/qaris/ali_jaber.jpg",
    everyAyahFolder: "Ali_Jaber_64kbps",
    style: "مرتل",
    bitrate: "64",
    bioAr:
      "الشيخ علي عبد الله جابر — إمام سابق للمسجد الحرام · تسجيل كامل ١١٤ سورة.",
  },
];

/**
 * Qari ids that must never appear in UI / playback preference.
 * - mustafa_ismail: everyayah incomplete (~4220 missing files)
 * - hazza_al_balushi: no reliable complete pack on app CDNs
 * Islam Sobhi is available (surah-mode mp3quran) — not in this set.
 */
export const INCOMPLETE_QARI_IDS = new Set([
  "mustafa_ismail",
  "hazza_al_balushi",
]);

/** Audit notes for procurement decisions (AI collaborators / product). */
export const QARI_CDN_AUDIT: Record<
  string,
  { complete114: boolean; source: string; note: string }
> = {
  mustafa_ismail: {
    complete114: false,
    source: "everyayah.com/data/Mustafa_Ismail_48kbps",
    note: "~4220 missing ayah files — excluded from getAvailableQaris()",
  },
  islam_sobhi: {
    complete114: false,
    source:
      "https://server14.mp3quran.net/islam/Rewayat-Hafs-A-n-Assem/ (109 surahs)",
    note:
      "Added as surah-level pack (not verse-by-verse). Missing surahs 37,39,40,45,65 fall back to Alafasy verse URLs. Scoped sessions still work; play-all reuses same surah file.",
  },
  hazza_al_balushi: {
    complete114: false,
    source:
      "everyayah.com (absent) / mp3quran.net/eng/hazza (surah-level) / way2quran ~98 surahs",
    note:
      "Hazza Al Balushi (هزاع البلوشي): no complete 114-surah verse-by-verse pack on everyayah CDN. Third-party hosts are surah-level or partial (~98). Excluded from getAvailableQaris() until a full V2V pack exists. Playback falls back to Alafasy on 404.",
  },
};

export function getQari(id: string): Qari | undefined {
  return QARIS.find((q) => q.id === id);
}

/** Reciters offered in UI (excludes known broken packs). */
export function getAvailableQaris(): Qari[] {
  return QARIS.filter((q) => !INCOMPLETE_QARI_IDS.has(q.id));
}

/**
 * Resolve a preferred qari id to a playable one.
 * Falls back to Alafasy if the saved preference was removed (e.g. incomplete pack).
 */
export function resolvePlayableQariId(preferredId?: string | null): string {
  if (preferredId && getQari(preferredId) && !INCOMPLETE_QARI_IDS.has(preferredId)) {
    return preferredId;
  }
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

/**
 * Audio URL for a reciter + ayah.
 * - verse mode (default): everyayah V2V
 * - surah mode (Islam Sobhi…): full-surah file; missing surahs → Alafasy verse
 */
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

/**
 * Authentic voice preview for the Qari library.
 * Surah-mode: full Al-Fatiha file. Verse-mode: Fatiha ayah 2 (avoids shared basmalah).
 */
export function qariPreviewAudioUrl(qari: Qari | string): string {
  const q = typeof qari === "string" ? getQari(resolvePlayableQariId(qari)) : qari;
  if (q?.playbackMode === "surah") {
    return ayahAudioUrl(qari, 1, 1);
  }
  return ayahAudioUrl(qari, 1, 2);
}

export function qariImageUrl(qari: Qari | string): string {
  const q = typeof qari === "string" ? getQari(qari) : qari;
  if (!q) return "/qaris/placeholder.svg";
  return q.image || `/qaris/${q.id}.jpg`;
}
