/** The widest horizontal accuracy radius, in meters, that TDLib's `Location` keeps. */
export const MAX_HORIZONTAL_ACCURACY_METERS = 1500;

/** A point on Earth that a user shares, as TDLib's `Location` holds it. */
export interface GeoLocation {
  /** From -90 to 90 degrees. */
  readonly latitude: number;
  /** From -180 to 180 degrees. */
  readonly longitude: number;
  /**
   * The radius of uncertainty, as the whole meters TDLib's `get_input_geo_point` sends Telegram;
   * omitted when unknown.
   */
  readonly horizontalAccuracyMeters?: number;
}

/**
 * Creates a location from the coordinates and accuracy a client reports, rounding the accuracy up
 * to whole meters as TDLib's `get_input_geo_point` does. An accuracy of 0 means unknown.
 */
export function createGeoLocation(
  latitude: number,
  longitude: number,
  horizontalAccuracyMeters: number,
): GeoLocation {
  const roundedAccuracyMeters = Math.ceil(horizontalAccuracyMeters);
  return {
    latitude,
    longitude,
    ...(roundedAccuracyMeters > 0 ? { horizontalAccuracyMeters: roundedAccuracyMeters } : {}),
  };
}
