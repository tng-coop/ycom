import * as piexif from 'piexifjs';

/**
 * Converts a decimal degree number to EXIF Rational format: [[degrees, 1], [minutes, 1], [seconds * 10000, 10000]]
 */
export function degToExif(deg: number): [[number, number], [number, number], [number, number]] {
  const absolute = Math.abs(deg);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = (minutesNotTruncated - minutes) * 60;

  // We multiply seconds by 10000 to keep high precision (up to 4 decimal places)
  return [
    [degrees, 1],
    [minutes, 1],
    [Math.round(seconds * 10000), 10000]
  ];
}

/**
 * Injects GPS metadata into a JPEG base64 string.
 * @param jpegBase64 The source JPEG as a base64 Data URL or raw base64 string.
 * @param lat Decimal latitude (e.g. 35.1462)
 * @param lng Decimal longitude (e.g. 139.1023)
 * @param alt Decimal altitude in meters (optional)
 * @returns The new JPEG base64 Data URL with EXIF tags.
 */
export function insertGpsToJpeg(
  jpegBase64: string,
  lat: number,
  lng: number,
  alt?: number | null
): string {
  // Ensure we have a clean base64 string (remove data URL prefix if present)
  let cleanBase64 = jpegBase64;
  let prefix = '';
  if (jpegBase64.startsWith('data:image/jpeg;base64,')) {
    prefix = 'data:image/jpeg;base64,';
    cleanBase64 = jpegBase64.substring(prefix.length);
  }

  // Create the EXIF object structure
  const now = new Date();
  const dateString = now.getFullYear() + ':' +
    String(now.getMonth() + 1).padStart(2, '0') + ':' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');

  const gpsObj: any = {
    [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
    [piexif.GPSIFD.GPSLatitudeRef]: lat >= 0 ? 'N' : 'S',
    [piexif.GPSIFD.GPSLatitude]: degToExif(lat),
    [piexif.GPSIFD.GPSLongitudeRef]: lng >= 0 ? 'E' : 'W',
    [piexif.GPSIFD.GPSLongitude]: degToExif(lng),
  };

  if (alt !== undefined && alt !== null) {
    gpsObj[piexif.GPSIFD.GPSAltitudeRef] = alt >= 0 ? 0 : 1;
    gpsObj[piexif.GPSIFD.GPSAltitude] = [Math.round(Math.abs(alt) * 100), 100];
  }

  const exifObj = {
    '0th': {
      [piexif.ImageIFD.Make]: 'Ycom',
      [piexif.ImageIFD.Model]: 'GPS Camera',
      [piexif.ImageIFD.Software]: 'Ycom WebApp',
      [piexif.ImageIFD.DateTime]: dateString,
    },
    'Exif': {
      [piexif.ExifIFD.DateTimeOriginal]: dateString,
    },
    'GPS': gpsObj
  };

  const exifBytes = piexif.dump(exifObj);
  const newBase64 = piexif.insert(exifBytes, cleanBase64);

  return prefix + newBase64;
}
