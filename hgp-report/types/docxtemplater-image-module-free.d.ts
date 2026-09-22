// docxtemplater-image-module-free 는 타입 정의를 제공하지 않아 최소 선언만 둡니다.
declare module "docxtemplater-image-module-free" {
  interface ImageModuleOptions {
    getImage: (tagValue: string, tagName?: string) => Uint8Array | ArrayBuffer;
    getSize: (img?: unknown, tagValue?: string, tagName?: string) => [number, number];
    centered?: boolean;
  }
  export default class ImageModule {
    constructor(options: ImageModuleOptions);
  }
}
