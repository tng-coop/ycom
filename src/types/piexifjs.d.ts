declare module 'piexifjs' {
  export const ImageIFD: {
    Make: number;
    Model: number;
    Software: number;
    DateTime: number;
    [key: string]: number;
  };
  export const ExifIFD: {
    DateTimeOriginal: number;
    [key: string]: number;
  };
  export const GPSIFD: {
    GPSVersionID: number;
    GPSLatitudeRef: number;
    GPSLatitude: number;
    GPSLongitudeRef: number;
    GPSLongitude: number;
    GPSAltitudeRef: number;
    GPSAltitude: number;
    GPSTimeStamp: number;
    GPSDateStamp: number;
    [key: string]: number;
  };
  export function dump(obj: any): string;
  export function insert(exifBytes: string, jpegData: string): string;
  export function load(jpegData: string): any;
  export function remove(jpegData: string): string;
}
