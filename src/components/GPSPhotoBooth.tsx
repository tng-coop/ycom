import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Camera, 
  MapPin, 
  Download, 
  Trash, 
  Upload, 
  X, 
  Check, 
  Info, 
  Navigation,
  Image as ImageIcon
} from 'lucide-react';
import { insertGpsToJpeg } from '../utils/exifHelper';

interface CapturedPhoto {
  id: string;
  dataUrl: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
}

export default function GPSPhotoBooth() {
  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Geolocation states
  const [locationStatus, setLocationStatus] = useState<'searching' | 'locked' | 'error' | 'denied'>('searching');
  const [gpsCoords, setGpsCoords] = useState<GeolocationCoordinates | null>(null);

  // Manual GPS Override states (useful for desktops or debug)
  const [manualLat, setManualLat] = useState<number>(35.1462); // Default Yugawara
  const [manualLng, setManualLng] = useState<number>(139.1023);
  const [manualAlt, setManualAlt] = useState<number>(102);
  const [useManualGps, setUseManualGps] = useState<boolean>(false);

  // Gallery and Active Photo review states
  const [gallery, setGallery] = useState<CapturedPhoto[]>([]);
  const [activePhoto, setActivePhoto] = useState<CapturedPhoto | null>(null);

  // Initialize GPS Watcher
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setUseManualGps(true);
      return;
    }

    setLocationStatus('searching');
    const id = navigator.geolocation.watchPosition(
      (position) => {
        setGpsCoords(position.coords);
        setLocationStatus('locked');
        // Pre-fill manual inputs with actual coordinates just in case
        setManualLat(Number(position.coords.latitude.toFixed(6)));
        setManualLng(Number(position.coords.longitude.toFixed(6)));
        if (position.coords.altitude !== null) {
          setManualAlt(Math.round(position.coords.altitude));
        }
      },
      (error) => {
        console.warn("Geolocation watch error:", error);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus('denied');
        } else {
          setLocationStatus('error');
        }
        setUseManualGps(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    return () => {
      navigator.geolocation.clearWatch(id);
    };
  }, []);

  // File and Camera upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        // Load the image to convert it to JPEG via Canvas (handles PNG/WebP/HEIC fallbacks)
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            try {
              const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.9);
              processPhotoData(jpegDataUrl);
            } catch (canvasErr) {
              console.error("Canvas toDataURL failed, using raw dataUrl:", canvasErr);
              processPhotoData(dataUrl);
            }
          } else {
            processPhotoData(dataUrl);
          }
        };
        img.onerror = () => {
          console.error("Failed to load image element, attempting direct processing");
          processPhotoData(dataUrl);
        };
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
    
    // Clear input value so same file can be selected again
    e.target.value = '';
  };

  // Common photo processor (EXIF injector)
  const processPhotoData = (dataUrl: string) => {
    const finalLat = useManualGps || !gpsCoords ? manualLat : gpsCoords.latitude;
    const finalLng = useManualGps || !gpsCoords ? manualLng : gpsCoords.longitude;
    const finalAlt = useManualGps || !gpsCoords ? manualAlt : (gpsCoords.altitude || 0);
    const finalAcc = useManualGps || !gpsCoords ? 0 : (gpsCoords.accuracy || 0);

    try {
      // Injects EXIF GPS block directly in browser
      const processedDataUrl = insertGpsToJpeg(dataUrl, finalLat, finalLng, finalAlt);
      
      const newPhoto: CapturedPhoto = {
        id: Date.now().toString(),
        dataUrl: processedDataUrl,
        timestamp: new Date(),
        latitude: finalLat,
        longitude: finalLng,
        altitude: finalAlt,
        accuracy: finalAcc
      };

      setGallery(prev => [newPhoto, ...prev]);
      setActivePhoto(newPhoto);
    } catch (err) {
      console.error("Failed to inject GPS metadata:", err);
      alert("Error embedding GPS metadata into JPEG binary.");
    }
  };

  // Handle Review Map initialization and updates
  useEffect(() => {
    if (!activePhoto || !mapContainerRef.current) {
      // Clean up map when exiting review
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
      return;
    }

    const { latitude, longitude } = activePhoto;

    if (!mapRef.current) {
      // Create Map
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: true,
        zoomSnap: 1,
        zoomDelta: 1
      }).setView([latitude, longitude], 15);

      mapRef.current = map;

      // Add zoom control
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // CartoDB Dark Matter
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);

      // Custom Glowing pin marker
      const glowingIcon = L.divIcon({
        html: `
          <div class="glow-marker-outer">
            <div class="glow-marker-pulse"></div>
            <div class="glow-marker-inner" style="background-color: #10b981;"></div>
          </div>
        `,
        className: 'custom-glowing-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([latitude, longitude], { icon: glowingIcon }).addTo(map);
      markerRef.current = marker;
    } else {
      // Map already exists, update position
      mapRef.current.setView([latitude, longitude], 15);
      if (markerRef.current) {
        markerRef.current.setLatLng([latitude, longitude]);
      }
    }
  }, [activePhoto]);

  // Trigger File Download
  const downloadPhoto = (photo: CapturedPhoto) => {
    const link = document.createElement('a');
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = photo.timestamp.getFullYear() + 
      pad(photo.timestamp.getMonth() + 1) + 
      pad(photo.timestamp.getDate()) + '_' +
      pad(photo.timestamp.getHours()) + 
      pad(photo.timestamp.getMinutes()) + 
      pad(photo.timestamp.getSeconds());
    
    link.download = `ycom_gps_photo_${dateStr}.jpg`;
    link.href = photo.dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deletePhoto = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setGallery(prev => prev.filter(p => p.id !== id));
    if (activePhoto?.id === id) {
      setActivePhoto(null);
    }
  };

  return (
    <section className="glass-card radar-hub-container gps-booth-container">
      <div className="radar-hub-header">
        <div className="title-area">
          <div className={`live-badge ${locationStatus === 'locked' ? 'gps-locked' : 'gps-searching'}`}>
            <span className="live-dot"></span>
            {locationStatus === 'locked' ? 'GPS LOCKED' : 'ACQUIRING GPS...'}
          </div>
          <h2>GPS Photo Metadata Embedder</h2>
          <p className="description">
            Capture photos instantly embedding physical coordinates (EXIF) client-side. No DB, no uploads.
          </p>
        </div>
      </div>

      <div className="radar-hub-grid">
        {/* LEFT COLUMN: VIEWPORT OR ACTIVE REVIEW */}
        <div className="radar-map-column">
          {!activePhoto ? (
            /* PHOTO CAPTURE OPTIONS VIEW */
            <div className="map-wrapper camera-viewport-wrapper">
              <div className="camera-offline-state">
                <div className="camera-placeholder-box">
                  <ImageIcon className="w-16 h-16 text-blue-400/80 mb-2" />
                  <h4>Ready to Capture</h4>
                  <p className="text-gray-400 text-xs max-w-sm mb-6">
                    Take a new photo or select one from your library. Your active GPS coordinates will be welded into the image headers.
                  </p>
                  
                  <div className="action-buttons-row">
                    <label className="play-btn upload-btn-fallback" style={{ cursor: 'pointer' }}>
                      <Camera className="w-4 h-4 mr-2" />
                      Take Photo
                      <input 
                        type="file" 
                        accept="image/jpeg,image/jpg" 
                        capture="environment" 
                        onChange={handleFileUpload} 
                        style={{ display: 'none' }}
                      />
                    </label>
                    
                    <label className="play-btn secondary-btn" style={{ cursor: 'pointer' }}>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload / Select File
                      <input 
                        type="file" 
                        accept="image/jpeg,image/jpg" 
                        onChange={handleFileUpload} 
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* PHOTO REVIEW MODE */
            <div className="photo-review-mode">
              <div className="review-image-pane">
                <img src={activePhoto.dataUrl} alt="Captured" className="review-img" />
                <button onClick={() => setActivePhoto(null)} className="close-review-btn" title="Back to Camera">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Leaflet map displaying where this photo was snapped */}
              <div className="review-map-pane">
                <div ref={mapContainerRef} className="review-leaflet-container" />
                <div className="map-hud-pin-overlay">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <span>Snapped at exact coordinate pin</span>
                </div>
              </div>
            </div>
          )}

          {/* LOWER ACTIONS BUTTONS */}
          {activePhoto && (
            <div className="map-controls-panel review-actions-bar">
              <button onClick={() => downloadPhoto(activePhoto)} className="play-btn download-btn">
                <Download className="w-4 h-4 mr-2" />
                Download GPS JPEG
              </button>
              <button onClick={() => setActivePhoto(null)} className="play-btn secondary-btn">
                Return
              </button>
              <button onClick={() => deletePhoto(activePhoto.id)} className="play-btn danger-btn">
                <Trash className="w-4 h-4 mr-2" />
                Delete
              </button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: GPS STATUS PANEL & GALLERY */}
        <div className="weather-dashboard-column gps-info-column">
          {/* Active Geolocation Status Card */}
          <div className="dashboard-card gps-status-card">
            <div className="card-icon-header">
              <Navigation className={`w-5 h-5 ${locationStatus === 'locked' ? 'text-emerald-400' : 'text-amber-500'}`} />
              <span className="card-label">GPS COORDINATE SYSTEM</span>
            </div>

            <div className="gps-readings-grid">
              <div className="reading-item">
                <span className="reading-label">Latitude</span>
                <span className="reading-val">
                  {locationStatus === 'locked' && gpsCoords && !useManualGps 
                    ? gpsCoords.latitude.toFixed(6) 
                    : manualLat.toFixed(6)}° {((locationStatus === 'locked' && gpsCoords && !useManualGps ? gpsCoords.latitude : manualLat) >= 0) ? 'N' : 'S'}
                </span>
              </div>
              <div className="reading-item">
                <span className="reading-label">Longitude</span>
                <span className="reading-val">
                  {locationStatus === 'locked' && gpsCoords && !useManualGps 
                    ? gpsCoords.longitude.toFixed(6) 
                    : manualLng.toFixed(6)}° {((locationStatus === 'locked' && gpsCoords && !useManualGps ? gpsCoords.longitude : manualLng) >= 0) ? 'E' : 'W'}
                </span>
              </div>
              <div className="reading-item">
                <span className="reading-label">Altitude</span>
                <span className="reading-val">
                  {locationStatus === 'locked' && gpsCoords && !useManualGps 
                    ? (gpsCoords.altitude !== null ? `${Math.round(gpsCoords.altitude)}m` : '0m')
                    : `${manualAlt}m`}
                </span>
              </div>
              <div className="reading-item">
                <span className="reading-label">Precision Lock</span>
                <span className="reading-val text-emerald-400">
                  {locationStatus === 'locked' && gpsCoords && !useManualGps 
                    ? `±${Math.round(gpsCoords.accuracy)}m` 
                    : 'Override'}
                </span>
              </div>
            </div>

            {/* Manual Override inputs toggle */}
            <div className="gps-override-toggle-area">
              <label className="toggle-checkbox-label">
                <input 
                  type="checkbox" 
                  checked={useManualGps} 
                  onChange={(e) => setUseManualGps(e.target.checked)} 
                />
                <span>Override/Manual Coordinate Input</span>
              </label>
            </div>

            {useManualGps && (
              <div className="gps-manual-inputs fade-in">
                <div className="input-group">
                  <label htmlFor="manual-lat">Lat</label>
                  <input 
                    id="manual-lat"
                    type="number" 
                    step="0.0001" 
                    value={manualLat} 
                    onChange={(e) => setManualLat(parseFloat(e.target.value) || 0)} 
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="manual-lng">Lng</label>
                  <input 
                    id="manual-lng"
                    type="number" 
                    step="0.0001" 
                    value={manualLng} 
                    onChange={(e) => setManualLng(parseFloat(e.target.value) || 0)} 
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="manual-alt">Alt (m)</label>
                  <input 
                    id="manual-alt"
                    type="number" 
                    value={manualAlt} 
                    onChange={(e) => setManualAlt(parseInt(e.target.value) || 0)} 
                  />
                </div>
              </div>
            )}
          </div>

          {/* If Reviewing, show EXIF tags list, otherwise show instructions */}
          {activePhoto ? (
            <div className="dashboard-card exif-inspector-card fade-in">
              <div className="card-icon-header">
                <Info className="w-5 h-5 text-blue-400" />
                <span className="card-label">EXIF METADATA PREVIEW (EMBEDDED)</span>
              </div>
              <div className="exif-table-wrapper">
                <table className="exif-table">
                  <thead>
                    <tr>
                      <th>EXIF Tag</th>
                      <th>Value in JPEG Binary</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Make / Model</td>
                      <td>Ycom / GPS Camera</td>
                    </tr>
                    <tr>
                      <td>Software</td>
                      <td>Ycom WebApp</td>
                    </tr>
                    <tr>
                      <td>GPSLatitude</td>
                      <td>{activePhoto.latitude.toFixed(6)} ({activePhoto.latitude >= 0 ? 'N' : 'S'})</td>
                    </tr>
                    <tr>
                      <td>GPSLongitude</td>
                      <td>{activePhoto.longitude.toFixed(6)} ({activePhoto.longitude >= 0 ? 'E' : 'W'})</td>
                    </tr>
                    <tr>
                      <td>GPSAltitude</td>
                      <td>{activePhoto.altitude !== null ? `${activePhoto.altitude} meters` : '0 meters'}</td>
                    </tr>
                    <tr>
                      <td>DateTimeOriginal</td>
                      <td>{activePhoto.timestamp.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td>GPSVersionID</td>
                      <td>2.3.0.0</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="exif-guarantee">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>EXIF blocks injected directly into raw JPEG bytes</span>
              </div>
            </div>
          ) : (
            <div className="dashboard-card instructions-card">
              <div className="card-icon-header">
                <Info className="w-5 h-5 text-blue-400" />
                <span className="card-label">METADATA DISCOVERY</span>
              </div>
              <p className="instruction-text">
                When you take a photo or select an image file, this web utility reads its binary contents, embeds high-fidelity TIFF/EXIF location tags, and welds the bytes together directly in your browser.
              </p>
              <p className="instruction-text font-semibold text-blue-300">
                The GPS coordinates reside completely inside the file, maintaining 100% privacy with zero databases or backend processing.
              </p>
            </div>
          )}

          {/* Session History Gallery */}
          <div className="dashboard-card session-gallery-card">
            <div className="card-icon-header">
              <ImageIcon className="w-5 h-5 text-indigo-400" />
              <span className="card-label">SESSION GALLERY ({gallery.length})</span>
            </div>
            
            {gallery.length === 0 ? (
              <div className="empty-gallery-state">
                <span>No photos captured this session yet. Snipped files will appear here.</span>
              </div>
            ) : (
              <div className="gallery-thumbnails-grid">
                {gallery.map((photo) => (
                  <div 
                    key={photo.id} 
                    onClick={() => setActivePhoto(photo)}
                    className={`gallery-thumb-card ${activePhoto?.id === photo.id ? 'active' : ''}`}
                  >
                    <img src={photo.dataUrl} alt="Snip" className="thumb-img" />
                    <div className="thumb-meta-overlay">
                      <span className="thumb-coordinates">
                        {photo.latitude.toFixed(3)}, {photo.longitude.toFixed(3)}
                      </span>
                    </div>
                    <button 
                      onClick={(e) => deletePhoto(photo.id, e)} 
                      className="thumb-delete-btn"
                      title="Delete Image"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
