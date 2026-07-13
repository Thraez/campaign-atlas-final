// Shared react-leaflet mock for page-level smoke tests.
//
// react-leaflet's real components need a live Leaflet map, which does not exist
// in jsdom. This mock renders every layout component as a plain <div> that
// forwards its children, and returns a single STABLE map object from the hooks.
//
// STABILITY MATTERS: `useMap()`/`useMapEvents()` must return the *same* object
// every call, exactly as real react-leaflet does. A fresh object per render
// re-runs viewport effects (e.g. AtlasMinimap) forever and spins into an
// infinite render loop. See src/test/accessibility-labels.test.tsx for the
// original warning.
//
// USAGE (the `vi.mock` call must live in the test file so vitest hoists it
// above the page import — a helper that calls `vi.mock` at runtime is too late,
// because ES imports are already hoisted):
//
//   vi.mock("react-leaflet", async () => {
//     const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
//     return makeReactLeafletModule();
//   });

import { vi } from "vitest";
import React from "react";

const bounds = {
  getNorth: () => 1000,
  getSouth: () => 0,
  getEast: () => 1000,
  getWest: () => 0,
  getSouthWest: () => ({ lng: 0, lat: 0 }),
  getNorthEast: () => ({ lng: 1000, lat: 1000 }),
  getCenter: () => ({ lng: 500, lat: 500 }),
  contains: () => true,
  isValid: () => true,
};
// self-reference for extend()
(bounds as unknown as { extend: () => unknown }).extend = () => bounds;

const STABLE_MAP = {
  getBounds: () => bounds,
  getZoom: () => 0,
  getMinZoom: () => -5,
  getMaxZoom: () => 5,
  getCenter: () => ({ lng: 500, lat: 500 }),
  getContainer: () => document.createElement("div"),
  getSize: () => ({ x: 800, y: 600 }),
  getPanes: () => ({ overlayPane: document.createElement("div") }),
  getPane: () => document.createElement("div"),
  createPane: () => document.createElement("div"),
  setView: vi.fn(),
  flyTo: vi.fn(),
  panTo: vi.fn(),
  fitBounds: vi.fn(),
  setZoom: vi.fn(),
  setMaxBounds: vi.fn(),
  invalidateSize: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  hasLayer: () => false,
  eachLayer: vi.fn(),
  openPopup: vi.fn(),
  closePopup: vi.fn(),
  project: () => ({ x: 0, y: 0 }),
  unproject: () => ({ lng: 0, lat: 0 }),
  latLngToLayerPoint: () => ({ x: 0, y: 0 }),
  layerPointToLatLng: () => ({ lng: 0, lat: 0 }),
  containerPointToLatLng: () => ({ lng: 0, lat: 0 }),
  latLngToContainerPoint: () => ({ x: 0, y: 0 }),
  mouseEventToLatLng: () => ({ lng: 0, lat: 0 }),
  distance: () => 0,
};

/** The stable fake Leaflet map instance the hooks return. Exported for tests
 *  that want to assert against map calls (e.g. flyTo). */
export const stableMap = STABLE_MAP;

/** Build the mock module object passed to `vi.mock("react-leaflet", ...)`. */
export function makeReactLeafletModule() {
  // forwardRef so layers that attach a ref to an overlay (e.g.
  // MapLayerEditableOverlay → ImageOverlay) don't trip React's
  // "function components cannot be given refs" warning.
  const pass = (name: string) =>
    React.forwardRef<HTMLDivElement, { children?: React.ReactNode }>(
      function LeafletMock({ children }, ref) {
        return React.createElement("div", { "data-leaflet": name, ref }, children);
      },
    );
  return {
    MapContainer: pass("MapContainer"),
    TileLayer: pass("TileLayer"),
    ImageOverlay: pass("ImageOverlay"),
    SVGOverlay: pass("SVGOverlay"),
    VideoOverlay: pass("VideoOverlay"),
    Marker: pass("Marker"),
    Popup: pass("Popup"),
    Tooltip: pass("Tooltip"),
    Polygon: pass("Polygon"),
    Polyline: pass("Polyline"),
    Circle: pass("Circle"),
    CircleMarker: pass("CircleMarker"),
    Rectangle: pass("Rectangle"),
    Pane: pass("Pane"),
    LayerGroup: pass("LayerGroup"),
    FeatureGroup: pass("FeatureGroup"),
    GeoJSON: pass("GeoJSON"),
    useMap: () => STABLE_MAP,
    useMapEvent: () => STABLE_MAP,
    useMapEvents: () => STABLE_MAP,
  };
}
