import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from '@/lib/toast';

export interface LocationMapProps {
  /** Latitude coordinate (number or numeric string, or empty/null) */
  latitude?: number | string | null;
  /** Longitude coordinate (number or numeric string, or empty/null) */
  longitude?: number | string | null;
  /** Callback fired when user selects or moves the pin */
  onChange?: (coords: { lat: number; lng: number }) => void;
  /** Whether the map is in view-only mode */
  readOnly?: boolean;
  /** Height of the map container (e.g. '100%', 280, '320px') */
  height?: number | string;
  /** Pharmacy name to display on the marker popup */
  pharmacyName?: string;
  /** Optional click handler for the whole map in read-only mode */
  onMapClick?: () => void;
  /** Additional CSS class name */
  className?: string;
  /** Optional hint text to display below or inside the map */
  hint?: string;
}

const DEFAULT_LAT = 31.5017; // Gaza / Palestine central fallback
const DEFAULT_LNG = 34.4668;
const ZOOM_WITH_COORDS = 15;
const ZOOM_DEFAULT = 11;

function parseCoordinate(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim());
  if (Number.isNaN(num) || !Number.isFinite(num)) return null;
  return num;
}

function createPinIcon(isDraggable: boolean) {
  return L.divIcon({
    className: 'daway-map-marker-pin',
    html: `
      <div class="daway-map-pin ${isDraggable ? 'is-draggable' : ''}">
        <i class="fas fa-location-dot" aria-hidden="true"></i>
      </div>
      <div class="daway-map-pin-pulse" aria-hidden="true"></div>
    `,
    iconSize: [36, 42],
    iconAnchor: [18, 40],
    popupAnchor: [0, -36],
  });
}

export function LocationMap({
  latitude,
  longitude,
  onChange,
  readOnly = false,
  height = '100%',
  pharmacyName,
  onMapClick,
  className = '',
  hint,
}: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [isLocating, setIsLocating] = useState(false);

  const parsedLat = parseCoordinate(latitude);
  const parsedLng = parseCoordinate(longitude);
  const hasCoords = parsedLat !== null && parsedLng !== null;

  // Initialize Leaflet map
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    // Safety: ensure no lingering leaflet ID from fast-refresh
    if ((el as unknown as { _leaflet_id?: number })._leaflet_id) {
      (el as unknown as { _leaflet_id?: null })._leaflet_id = null;
    }

    const initLat = parsedLat ?? DEFAULT_LAT;
    const initLng = parsedLng ?? DEFAULT_LNG;
    const initZoom = hasCoords ? ZOOM_WITH_COORDS : ZOOM_DEFAULT;

    const map = L.map(el, {
      center: [initLat, initLng],
      zoom: initZoom,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: !readOnly,
    });
    mapRef.current = map;

    // Zoom controls
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    // OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    // Marker creation
    const pinIcon = createPinIcon(!readOnly);
    let marker: L.Marker | null = null;

    if (hasCoords) {
      marker = L.marker([initLat, initLng], {
        icon: pinIcon,
        draggable: !readOnly,
      }).addTo(map);

      const label = pharmacyName || 'موقع الصيدلية';
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; text-align: center; padding: 4px;">
          <strong>${label}</strong>
          ${readOnly ? '' : '<br/><span style="color: #64748b; font-size: 11px;">اسحب الدبوس لتعديل الموقع</span>'}
        </div>
      `);

      if (!readOnly) {
        marker.on('dragend', () => {
          if (!marker) return;
          const pos = marker.getLatLng();
          const cleanLat = Number(pos.lat.toFixed(6));
          const cleanLng = Number(pos.lng.toFixed(6));
          onChangeRef.current?.({ lat: cleanLat, lng: cleanLng });
        });
      }

      markerRef.current = marker;
    }

    // Map click in interactive mode
    if (!readOnly) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        const cleanLat = Number(e.latlng.lat.toFixed(6));
        const cleanLng = Number(e.latlng.lng.toFixed(6));

        if (!markerRef.current) {
          const newMarker = L.marker([cleanLat, cleanLng], {
            icon: createPinIcon(true),
            draggable: true,
          }).addTo(map);

          newMarker.on('dragend', () => {
            const pos = newMarker.getLatLng();
            onChangeRef.current?.({
              lat: Number(pos.lat.toFixed(6)),
              lng: Number(pos.lng.toFixed(6)),
            });
          });

          markerRef.current = newMarker;
        } else {
          markerRef.current.setLatLng([cleanLat, cleanLng]);
        }

        onChangeRef.current?.({ lat: cleanLat, lng: cleanLng });
      });
    }

    // ResizeObserver ensures smooth rendering on modal animation / window resize
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // Keep marker & map center in sync when coordinates change externally
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (parsedLat !== null && parsedLng !== null) {
      if (markerRef.current) {
        const cur = markerRef.current.getLatLng();
        if (Math.abs(cur.lat - parsedLat) > 0.00001 || Math.abs(cur.lng - parsedLng) > 0.00001) {
          markerRef.current.setLatLng([parsedLat, parsedLng]);
          map.panTo([parsedLat, parsedLng]);
        }
      } else {
        const newMarker = L.marker([parsedLat, parsedLng], {
          icon: createPinIcon(!readOnly),
          draggable: !readOnly,
        }).addTo(map);

        if (!readOnly) {
          newMarker.on('dragend', () => {
            const pos = newMarker.getLatLng();
            onChangeRef.current?.({
              lat: Number(pos.lat.toFixed(6)),
              lng: Number(pos.lng.toFixed(6)),
            });
          });
        }

        markerRef.current = newMarker;
        map.setView([parsedLat, parsedLng], ZOOM_WITH_COORDS);
      }
    }
  }, [parsedLat, parsedLng, readOnly]);

  // Handle Geolocation
  function handleLocateMe(e: React.MouseEvent) {
    e.stopPropagation();
    if (!navigator.geolocation) {
      toast.error('خدمة تحديد الموقع غير مدعومة في متصفحك.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));

        const map = mapRef.current;
        if (map) {
          map.flyTo([lat, lng], ZOOM_WITH_COORDS);

          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
          } else {
            const newMarker = L.marker([lat, lng], {
              icon: createPinIcon(true),
              draggable: true,
            }).addTo(map);

            newMarker.on('dragend', () => {
              const p = newMarker.getLatLng();
              onChangeRef.current?.({
                lat: Number(p.lat.toFixed(6)),
                lng: Number(p.lng.toFixed(6)),
              });
            });

            markerRef.current = newMarker;
          }
        }

        onChangeRef.current?.({ lat, lng });
        toast.success('تم تحديد موقعك الحالي بنجاح.');
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error('تم رفض إذن الوصول إلى الموقع. يرجى تفعيله من إعدادات المتصفح.');
        } else {
          toast.error('تعذر الوصول إلى موقعك الحالي.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`daway-map-wrap ${readOnly ? 'is-readonly' : ''} ${className}`}
      style={{ height: resolvedHeight, position: 'relative' }}
      onClick={readOnly ? onMapClick : undefined}
    >
      <div
        ref={containerRef}
        className="daway-map-container"
        style={{
          width: '100%',
          height: '100%',
          direction: 'ltr',
        }}
      />

      {/* Floating Locate Button (interactive mode only) */}
      {!readOnly && (
        <button
          type="button"
          className="daway-map-locate-btn"
          onClick={handleLocateMe}
          disabled={isLocating}
          title="تحديد موقعي الحالي عبر GPS"
        >
          <i
            className={isLocating ? 'fas fa-spinner fa-spin' : 'fas fa-location-crosshairs'}
            aria-hidden="true"
          />
          <span>{isLocating ? 'جاري التحديد…' : 'موقعي الحالي'}</span>
        </button>
      )}

      {/* Read-only overlay if no coordinates are set */}
      {readOnly && !hasCoords && (
        <div className="daway-map-empty-overlay">
          <i className="fas fa-map-location-dot" aria-hidden="true" />
          <span>لم يتم تحديد الموقع بعد</span>
          <small>انقر لتحديد موقع الصيدلية على الخريطة</small>
        </div>
      )}

      {/* Read-only hover indicator if coords exist */}
      {readOnly && hasCoords && onMapClick && (
        <div className="daway-map-view-badge" title="انقر لتعديل الموقع">
          <i className="fas fa-up-right-from-square" aria-hidden="true" />
          <span>انقر للتكبير والتعديل</span>
        </div>
      )}

      {hint && <p className="daway-map-caption">{hint}</p>}
    </div>
  );
}
