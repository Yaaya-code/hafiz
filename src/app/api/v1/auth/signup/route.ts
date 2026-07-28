import { NextRequest, NextResponse } from "next/server";
import { signupAction } from "@/lib/auth/actions";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      password?: string;
      guestKey?: string;
    };
    const result = await signupAction({
      name: body.name || "",
      email: body.email || "",
      password: body.password || "",
      guestKey: body.guestKey,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "signup failed",
      },
      { status: 500 }
    );
  }
}
