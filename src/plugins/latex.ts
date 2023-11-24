export class LatexConverter {
  public static async convert(latex: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const options = {
        math: `\\color{white}{${latex}}`,
        format: 'TeX',
        png: true,
        scale: 3,
      };
    });
  }
}
