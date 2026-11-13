declare module 'fit-file-parser' {
  export type FitRecord = {
    position_lat?: number
    position_long?: number
    positionLat?: number
    positionLong?: number
    elapsed_time?: number
    distance?: number
    altitude?: number
    enhanced_altitude?: number
    speed?: number
    enhanced_speed?: number
    heart_rate?: number
    cadence?: number
  }

  export type FitData = {
    records?: FitRecord[]
  }

  export default class FitParser {
    constructor(options?: {
      force?: boolean
      mode?: 'list' | 'cascade' | 'both'
      lengthUnit?: string
      speedUnit?: string
      temperatureUnit?: string
      elapsedRecordField?: boolean
    })

    parse(content: ArrayBuffer | Uint8Array, callback: (error: string | null, data: FitData) => void): void
  }
}
