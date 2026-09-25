import { Monitor } from "node-screenshots";
const monitor = Monitor.all().find((item) => item.isPrimary()) ?? Monitor.all()[0];
console.log(`monitor=${monitor.width()}x${monitor.height()} scale=${monitor.scaleFactor()}`);
const image = await monitor.captureImage();
const png = await image.toPng();
const jpeg = await image.toJpeg();
console.log(`pngBytes=${png.length} jpegBytes=${jpeg.length}`);
const ratio = jpeg.length / png.length;
console.log(`jpeg/png=${ratio.toFixed(3)}`);
