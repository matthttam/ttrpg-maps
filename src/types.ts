/** Direction a marker icon points */
export type MarkerDirection = "up" | "down" | "left" | "right";

/** Where text is placed relative to the marker icon */
export type TextPlacement = "above" | "below" | "left" | "right";

/** A reusable preset for marker styling */
export interface MarkerTemplate {
  id: string;
  name: string;
  note: string | null;
  description: string | null;
  direction: MarkerDirection;
  textPlacement: TextPlacement;
  color: string;
  icon: string | null;
  iconColor: string;
  useBaseMarker: boolean;
  shape: "pin" | "circle";
}

/** A single marker placed on a map */
export interface MapMarker {
  id: string;
  templateId: string;
  x: number;
  y: number;
  /** Overrides from template. Only set fields override. */
  note: string | null;
  description: string | null;
  direction: MarkerDirection | null;
  textPlacement: TextPlacement | null;
  color: string | null;
  icon: string | null;
  iconColor: string | null;
  useBaseMarker: boolean | null;
  shape: "pin" | "circle" | null;
}

/** A point used in distance scale or measurement */
export interface MapPoint {
  x: number;
  y: number;
}

/** Calibration data for distance measurement */
export interface DistanceScale {
  pointA: MapPoint;
  pointB: MapPoint;
  units: number;
  unitLabel: string;
}

/** Static config parsed from the ttrpgmap code block (YAML) */
export interface MapConfig {
  id: string;
  image: string;
  height: string | null;
  width: string | null;
  zoomMin: number;
  zoomMax: number;
  zoomStep: number;
}

/** Mutable per-map state stored in .ttrpgmap/ sidecar file */
export interface MapState {
  mapId: string;
  markers: MapMarker[];
  distanceScale: DistanceScale | null;
}

/** Plugin-wide settings stored in data.json */
export interface TTRPGMapsSettings {
  markerTemplates: MarkerTemplate[];
}

/** Default plugin settings */
export const DEFAULT_SETTINGS: TTRPGMapsSettings = {
  markerTemplates: [
    {
      id: "default",
      name: "Default",
      note: null,
      description: null,
      direction: "down",
      textPlacement: "above",
      color: "#ffffff",
      icon: null,
      iconColor: "#000000",
      useBaseMarker: true,
      shape: "pin",
    },
  ],
};

/** Default values for map config when not specified */
export const DEFAULT_MAP_CONFIG: Omit<MapConfig, "id" | "image"> = {
  height: null,
  width: null,
  zoomMin: 50,
  zoomMax: 200,
  zoomStep: 10,
};
