import { NextRequest, NextResponse } from "next/server";

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      message: "Not implemented yet.",
      data: null,
      errors: null,
    },
    { status: 501 }
  );
}
