import * as tf from '@tensorflow/tfjs-node';
import * as Jimp from 'jimp';
import { resolve } from 'path';

export class AnimeDetector {
  readonly imageSize: number = 224;
  model: tf.GraphModel;

  async initialize(): Promise<void> {
    this.model = await tf.loadGraphModel('file://./src/ml_model/model.json');
    resolve();
  }

  public async predict(url) {
    const image = await Jimp.read(url);
    image.resize(this.imageSize, this.imageSize);

    const imgData = [];

    for (let i = 0; i < this.imageSize; i++) {
      imgData.push([]);
      for (let j = 0; j < this.imageSize; j++) {
        const pixel = Jimp.intToRGBA(image.getPixelColor(i, j));
        imgData[i].push([]);
        imgData[i][j].push(pixel.r / 255);
        imgData[i][j].push(pixel.g / 255);
        imgData[i][j].push(pixel.b / 255);
      }
    }

    const imgTensor = tf.tensor([imgData]);
    return this.model.predict(imgTensor);
  }
}
