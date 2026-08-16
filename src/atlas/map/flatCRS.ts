import L from "leaflet";

// Flat CRS for non-globe world (top-left origin via lat = height - y)
export const FlatCRS = L.extend({}, L.CRS.Simple) as L.CRS;
