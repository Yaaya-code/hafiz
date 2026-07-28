import { NextRequest, NextResponse } from "next/server";
import { chatWithTeacher } from "@/lib/quran/llm-provider";

export const runtime = "nodejs";

/**
 * Free Quran teacher via RAG.
 * Optional Ollama if running locally — still free.
 * No paid API required.
 */

type Body = {
  messages: { role: "user" | "assistant"; content: string }[];
  context: {
    surahNumber: number;
    focusAyah?: number;
    fromAyah?: number;
    toAyah?: number;
    meanings?: Record<number, string>;
    lastCompletedAyah?: number;
    mode?: string;
  };
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const surahNumber = Number(body.context?.surahNumber);
    if (!surahNumber || surahNumber < 1 || surahNumber > 114) {
      return NextResponse.json({ error: "invalid surah" }, { status: 400 });
    }

    const messages = (body.messages || []).filter(
      (m) => m.content && (m.role === "user" || m.role === "assistant")
    );
    if (!messages.some((m) => m.role === "user")) {
      return NextResponse.json({ error: "no user message" }, { status: 400 });
    }

    const result = await chatWithTeacher({
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      context: {
        surahNumber,
        focusAyah: body.context?.focusAyah,
        fromAyah: body.context?.fromAyah,
        toAyah: body.context?.toAyah,
        meanings: body.context?.meanings || {},
        lastCompletedAyah: body.context?.lastCompletedAyah,
      },
    });

    return NextResponse.json({
      role: "assistant",
      content: result.content,
      source: result.source,
      chunksUsed: result.chunksUsed,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "chat failed" }, { status: 500 });
  }
}
