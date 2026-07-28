import { NextRequest, NextResponse } from "next/server";
import { loginAction } from "@/lib/auth/actions";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
    };
    const result = await loginAction({
      email: body.email || "",
      password: body.password || "",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 401 });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "login failed",
      },
      { status: 500 }
    );
  }
}
