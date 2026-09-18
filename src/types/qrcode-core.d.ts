declare module 'qrcode/lib/core/qrcode.js' {
  const QRCore: {
    create: (
      data: string,
      options?: { errorCorrectionLevel?: string },
    ) => {
      modules: { size: number; get: (row: number, col: number) => boolean };
    };
  };
  export default QRCore;
}
