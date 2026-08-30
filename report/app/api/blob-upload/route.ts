import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const dynamic = "force-dynamic";

// 브라우저에서 Blob으로 파일을 "직접" 업로드하기 위한 토큰 발급 엔드포인트.
// 서버 함수 본문 크기 제한(≈4.5MB)을 우회하므로 동영상 등 큰 파일도 업로드 가능.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        // 사진·동영상 + 문서(PPT·워드·엑셀·PDF·한글 등). 일부 문서는 octet-stream으로 올라옴.
        allowedContentTypes: ["image/*", "video/*", "application/*", "text/*"],
        addRandomSuffix: true,
        maximumSizeInBytes: 1024 * 1024 * 1024, // 1GB
      }),
      // 업로드 완료 후 메타데이터 저장은 클라이언트가 /api/media로 처리하므로 여기선 생략
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
