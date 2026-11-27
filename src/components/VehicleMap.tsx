import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { NormalizedVehicle } from '../types';

interface VehicleMapProps {
  vehicles: NormalizedVehicle[];
  mapTileUrl?: string;
  heightClass?: string;
}

export function VehicleMap({
  vehicles,
  mapTileUrl,
  heightClass = 'h-64',
}: VehicleMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const validVehicles = vehicles.filter(
    (v) => typeof v.latitude === 'number' && typeof v.longitude === 'number'
  );

  useEffect(() => {
    if (!containerRef.current || validVehicles.length === 0) return;

    const tileUrl =
      mapTileUrl?.trim() || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    const first = validVehicles[0];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [first.longitude!, first.latitude!],
      zoom: validVehicles.length === 1 ? 12 : 5,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    const bounds = new maplibregl.LngLatBounds();
    for (const v of validVehicles) {
      const color =
        v.status === 'moving'
          ? '#059669'
          : v.status === 'idle'
            ? '#D97706'
            : v.isSilent || v.status === 'offline'
              ? '#DC2626'
              : '#475569';

      const el = document.createElement('div');
      el.className = 'w-4 h-4 rounded-full border-2 border-white shadow-md cursor-pointer';
      el.style.backgroundColor = color;

      const popupHtml = `
        <div style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.4;min-width:160px">
          <div style="font-weight:700;color:#0f172a">${v.plateNumber}</div>
          <div style="color:#475569">${v.name}</div>
          <div style="margin-top:4px">Status: <b>${v.status}</b> · ${v.speedKmh} km/h</div>
          ${v.address ? `<div style="color:#64748b;margin-top:2px">${v.address}</div>` : ''}
        </div>
      `;

      new maplibregl.Marker({ element: el })
        .setLngLat([v.longitude!, v.latitude!])
        .setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(popupHtml))
        .addTo(map);

      bounds.extend([v.longitude!, v.latitude!]);
    }

    if (validVehicles.length > 1) {
      map.fitBounds(bounds, { padding: 40, maxZoom: 12, duration: 0 });
    }

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [JSON.stringify(validVehicles.map((v) => [v.id, v.latitude, v.longitude, v.status])), mapTileUrl]);

  if (validVehicles.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-100 p-4 text-xs text-slate-500">
        No GPS coordinates available for map rendering.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div ref={containerRef} className={`w-full ${heightClass}`} />
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" /> Moving</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-600" /> Idle</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-600" /> Parked</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" /> Silent / Offline</span>
      </div>
    </div>
  );
}
