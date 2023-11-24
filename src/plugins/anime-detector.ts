import * as Jimp from 'jimp';
import { resolve } from 'path';

export class AnimeDetector {
  readonly imageSize: number = 224;

  async initialize(): Promise<void> {
    resolve();
  }

  public async predict(url) {
    return null;
  }
}
