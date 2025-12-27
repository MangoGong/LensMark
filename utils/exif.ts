import ExifReader from 'exifreader';
import { ExifData } from '../types';

const convertDMSToDecimal = (dms: number[], ref: string): number | undefined => {
  if (!dms || dms.length < 3) return undefined;
  const degrees = dms[0];
  const minutes = dms[1];
  const seconds = dms[2];
  let decimal = degrees + minutes / 60 + seconds / 3600;
  if (ref === 'S' || ref === 'W') {
    decimal = decimal * -1;
  }
  return decimal;
};

export const extractExifData = async (file: File): Promise<ExifData> => {
  const tags = await ExifReader.load(file);

  const make = tags['Make']?.description || '';
  const model = tags['Model']?.description || 'Unknown Camera';
  const lens = tags['LensModel']?.description || tags['Lens']?.description || '';
  
  // Clean up focal length (e.g., "24 mm" -> "24mm")
  let focalLength = tags['FocalLength']?.description || '';
  focalLength = focalLength.replace(/\s+/g, '');

  let fNumber = tags['FNumber']?.description || '';
  // Ensure f-number format "f/1.8"
  if (fNumber && !fNumber.startsWith('f/')) {
    fNumber = `f/${fNumber}`;
  }

  const iso = tags['ISOSpeedRatings']?.description || '';
  
  let exposureTime = tags['ExposureTime']?.description || '';
  if (exposureTime && !exposureTime.endsWith('s')) {
      exposureTime = `${exposureTime}s`;
  }
  
  // Date formatting
  let dateTime = tags['DateTimeOriginal']?.description || '';
  if (dateTime) {
    const parts = dateTime.split(' ');
    if (parts.length > 0) {
      dateTime = parts[0].replace(/:/g, '.') + ' ' + (parts[1] || '');
    }
  } else {
    const date = new Date();
    dateTime = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  // Extract GPS
  let lat: number | undefined;
  let lon: number | undefined;
  let gpsString: string | undefined;

  const latTag = tags['GPSLatitude'];
  const lonTag = tags['GPSLongitude'];
  const latRef = tags['GPSLatitudeRef']?.description?.[0] || 'N';
  const lonRef = tags['GPSLongitudeRef']?.description?.[0] || 'E';

  if (latTag && lonTag) {
     // Check if values are available as numbers (modern ExifReader)
     if (Array.isArray(latTag.value) && Array.isArray(lonTag.value)) {
         // DMS Array usually
         lat = convertDMSToDecimal(latTag.value as number[], latRef);
         lon = convertDMSToDecimal(lonTag.value as number[], lonRef);
     } else {
         // Try parsing description if value array is missing (fallback)
         const latDesc = parseFloat(String(latTag.description));
         const lonDesc = parseFloat(String(lonTag.description));
         if (!isNaN(latDesc)) lat = latDesc;
         if (!isNaN(lonDesc)) lon = lonDesc;
     }

     if (lat !== undefined && lon !== undefined) {
         gpsString = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
     } else {
         gpsString = 'Location Data';
     }
  }

  return {
    make,
    model,
    lens,
    focalLength,
    fNumber,
    iso,
    exposureTime,
    dateTime,
    gps: gpsString,
    lat,
    lon
  };
};

export const getBrandLogoKey = (make: string): string => {
  const m = make.toLowerCase();
  if (m.includes('canon')) return 'CANON';
  if (m.includes('nikon')) return 'NIKON';
  if (m.includes('fujifilm') || m.includes('fuji')) return 'FUJIFILM';
  if (m.includes('sony')) return 'SONY';
  if (m.includes('leica')) return 'LEICA';
  if (m.includes('hasselblad')) return 'HASSELBLAD';
  if (m.includes('olympus') || m.includes('om digital')) return 'OLYMPUS';
  if (m.includes('panasonic') || m.includes('lumix')) return 'PANASONIC';
  if (m.includes('google') || m.includes('pixel')) return 'GOOGLE';
  if (m.includes('apple') || m.includes('iphone')) return 'APPLE';
  return 'DEFAULT';
};