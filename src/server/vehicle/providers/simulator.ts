import type {
  DeviceHealth,
  NormalizedVehicle,
  VehicleEvent,
  VehicleTrip,
} from '../../../shared/vehicle-types.ts';

interface SeedUnit {
  id: string;
  plateNumber: string;
  name: string;
  fleetGroup: string;
  vehicleType: string;
  driverName: string;
  lat: number;
  lng: number;
  address: string;
  baseSpeed: number;
  headingDeg: number;
  ignition: boolean;
  odometerKm: number;
  dailyMileageKm: number;
  maxSpeedKmh: number;
  fuelLevelPct: number;
  staleMinutes: number;
}

const SIMULATED_FLEET: SeedUnit[] = [
  { id: 'sim-01', plateNumber: 'B 9102 KRN', name: 'Wingbox Jakarta 01', fleetGroup: 'Jabodetabek Cold-Chain', vehicleType: 'Refrigerated Wingbox', driverName: 'Budi Santoso', lat: -6.1754, lng: 106.8272, address: 'Jl. Medan Merdeka Barat, Jakarta Pusat', baseSpeed: 54, headingDeg: 95, ignition: true, odometerKm: 142380, dailyMileageKm: 184.5, maxSpeedKmh: 82, fuelLevelPct: 74, staleMinutes: 1 },
  { id: 'sim-02', plateNumber: 'B 8410 JKT', name: 'CDD Express 02', fleetGroup: 'Jabodetabek Distribution', vehicleType: 'Colt Diesel Double', driverName: 'Agus Pratama', lat: -6.2297, lng: 106.8669, address: 'Tol Dalam Kota Cawang, Jakarta Timur', baseSpeed: 68, headingDeg: 140, ignition: true, odometerKm: 98410, dailyMileageKm: 212.0, maxSpeedKmh: 88, fuelLevelPct: 62, staleMinutes: 2 },
  { id: 'sim-03', plateNumber: 'B 9341 KRN', name: 'Fuso Container 03', fleetGroup: 'Port Tanjung Priok', vehicleType: 'Prime Mover 40ft', driverName: 'Hendra Wijaya', lat: -6.1065, lng: 106.8804, address: 'Terminal 3 Pelabuhan Tanjung Priok, Jakarta Utara', baseSpeed: 12, headingDeg: 210, ignition: true, odometerKm: 231900, dailyMileageKm: 94.2, maxSpeedKmh: 65, fuelLevelPct: 51, staleMinutes: 1 },
  { id: 'sim-04', plateNumber: 'B 9558 BEK', name: 'Van Cikarang 04', fleetGroup: 'Jabodetabek Distribution', vehicleType: 'Blind Van', driverName: 'Dedi Kurniawan', lat: -6.2869, lng: 107.1436, address: 'Kawasan Industri Jababeka, Cikarang', baseSpeed: 0, headingDeg: 0, ignition: false, odometerKm: 64120, dailyMileageKm: 68.4, maxSpeedKmh: 76, fuelLevelPct: 89, staleMinutes: 6 },
  { id: 'sim-05', plateNumber: 'B 9012 TNG', name: 'Box Tangerang 05', fleetGroup: 'Jabodetabek Cold-Chain', vehicleType: 'Thermo Box 6-Wheeler', driverName: 'Rudi Hartono', lat: -6.1783, lng: 106.6319, address: 'Jl. Daan Mogot KM 18, Tangerang', baseSpeed: 42, headingDeg: 280, ignition: true, odometerKm: 112500, dailyMileageKm: 141.7, maxSpeedKmh: 79, fuelLevelPct: 45, staleMinutes: 2 },
  { id: 'sim-06', plateNumber: 'D 7721 BDG', name: 'Bandung Shuttle 06', fleetGroup: 'West Java Corridor', vehicleType: 'Engkel Box', driverName: 'Asep Sunandar', lat: -6.9175, lng: 107.6191, address: 'Jl. Soekarno-Hatta, Bandung', baseSpeed: 47, headingDeg: 115, ignition: true, odometerKm: 88320, dailyMileageKm: 162.3, maxSpeedKmh: 84, fuelLevelPct: 68, staleMinutes: 3 },
  { id: 'sim-07', plateNumber: 'D 8814 KRN', name: 'Cimahi Cargo 07', fleetGroup: 'West Java Corridor', vehicleType: 'CDD Long', driverName: 'Yusuf Maulana', lat: -6.8722, lng: 107.5422, address: 'Gerbang Tol Baros, Cimahi', baseSpeed: 76, headingDeg: 310, ignition: true, odometerKm: 154200, dailyMileageKm: 248.6, maxSpeedKmh: 94, fuelLevelPct: 57, staleMinutes: 1 },
  { id: 'sim-08', plateNumber: 'L 9304 SBY', name: 'Surabaya Reefer 08', fleetGroup: 'East Java Hub', vehicleType: 'Refrigerated Wingbox', driverName: 'Slamet Riyadi', lat: -7.2575, lng: 112.7521, address: 'Jl. Ahmad Yani, Surabaya', baseSpeed: 51, headingDeg: 185, ignition: true, odometerKm: 176400, dailyMileageKm: 193.1, maxSpeedKmh: 83, fuelLevelPct: 71, staleMinutes: 2 },
  { id: 'sim-09', plateNumber: 'L 8192 KRN', name: 'Tanjung Perak 09', fleetGroup: 'East Java Hub', vehicleType: 'Trailer 20ft', driverName: 'Eko Prasetyo', lat: -7.2008, lng: 112.7289, address: 'Pelabuhan Tanjung Perak, Surabaya', baseSpeed: 0, headingDeg: 45, ignition: true, odometerKm: 205100, dailyMileageKm: 52.0, maxSpeedKmh: 61, fuelLevelPct: 39, staleMinutes: 4 },
  { id: 'sim-10', plateNumber: 'H 9411 SMG', name: 'Semarang Linehaul 10', fleetGroup: 'Central Java Corridor', vehicleType: 'Tronton Wingbox', driverName: 'Wahyu Nugroho', lat: -6.9667, lng: 110.4167, address: 'Tol Semarang-Batang KM 412, Semarang', baseSpeed: 81, headingDeg: 270, ignition: true, odometerKm: 263800, dailyMileageKm: 318.9, maxSpeedKmh: 97, fuelLevelPct: 63, staleMinutes: 1 },
  { id: 'sim-11', plateNumber: 'H 8023 KRN', name: 'Kendal Courier 11', fleetGroup: 'Central Java Corridor', vehicleType: 'Colt Diesel Double', driverName: 'Fajar Sidik', lat: -6.9278, lng: 110.2038, address: 'Kawasan Industri Kendal, Jawa Tengah', baseSpeed: 0, headingDeg: 90, ignition: false, odometerKm: 74910, dailyMileageKm: 110.4, maxSpeedKmh: 77, fuelLevelPct: 82, staleMinutes: 14 },
  { id: 'sim-12', plateNumber: 'BK 9188 MDN', name: 'Medan Belawan 12', fleetGroup: 'Sumatra North Hub', vehicleType: 'Container 40ft', driverName: 'Rizal Lubis', lat: 3.5952, lng: 98.6722, address: 'Jl. Tol Belmera, Medan', baseSpeed: 59, headingDeg: 15, ignition: true, odometerKm: 189400, dailyMileageKm: 175.0, maxSpeedKmh: 85, fuelLevelPct: 54, staleMinutes: 2 },
  { id: 'sim-13', plateNumber: 'DD 8741 MKS', name: 'Makassar Port 13', fleetGroup: 'Sulawesi Hub', vehicleType: 'Engkel Box', driverName: 'Arman Daeng', lat: -5.1477, lng: 119.4327, address: 'Jl. Nusantara, Makassar', baseSpeed: 34, headingDeg: 130, ignition: true, odometerKm: 109300, dailyMileageKm: 121.8, maxSpeedKmh: 72, fuelLevelPct: 66, staleMinutes: 3 },
  { id: 'sim-14', plateNumber: 'KT 9602 BPN', name: 'Balikpapan Mining 14', fleetGroup: 'Kalimantan Energy', vehicleType: '4x4 Service Truck', driverName: 'Taufik Hidayat', lat: -1.2379, lng: 116.8529, address: 'Jl. Soekarno-Hatta KM 15, Balikpapan', baseSpeed: 44, headingDeg: 60, ignition: true, odometerKm: 132750, dailyMileageKm: 156.2, maxSpeedKmh: 80, fuelLevelPct: 78, staleMinutes: 2 },
  { id: 'sim-15', plateNumber: 'B 9770 KRN', name: 'Karawang Logistics 15', fleetGroup: 'West Java Corridor', vehicleType: 'Tronton Box', driverName: 'Ilham Akbar', lat: -6.3227, lng: 107.3376, address: 'KIIC Karawang Barat', baseSpeed: 62, headingDeg: 110, ignition: true, odometerKm: 194500, dailyMileageKm: 229.4, maxSpeedKmh: 89, fuelLevelPct: 48, staleMinutes: 1 },
  { id: 'sim-16', plateNumber: 'B 9223 DEP', name: 'Depok Last-Mile 16', fleetGroup: 'Jabodetabek Distribution', vehicleType: 'EV Delivery Van', driverName: 'Nanda Putra', lat: -6.4025, lng: 106.7942, address: 'Jl. Margonda Raya, Depok', baseSpeed: 28, headingDeg: 190, ignition: true, odometerKm: 41200, dailyMileageKm: 87.6, maxSpeedKmh: 64, fuelLevelPct: 81, staleMinutes: 1 },
  { id: 'sim-17', plateNumber: 'B 9881 BKS', name: 'Bekasi Depot 17', fleetGroup: 'Jabodetabek Distribution', vehicleType: 'Colt Diesel Double', driverName: 'Surya Darma', lat: -6.2383, lng: 106.9756, address: 'Jl. Ahmad Yani, Bekasi', baseSpeed: 0, headingDeg: 270, ignition: false, odometerKm: 82400, dailyMileageKm: 44.5, maxSpeedKmh: 71, fuelLevelPct: 92, staleMinutes: 22 },
  { id: 'sim-18', plateNumber: 'L 9512 SDA', name: 'Sidoarjo Cold 18', fleetGroup: 'East Java Hub', vehicleType: 'Thermo Box 6-Wheeler', driverName: 'Bagus Setiawan', lat: -7.4478, lng: 112.7183, address: 'Safe N Lock Industrial Park, Sidoarjo', baseSpeed: 55, headingDeg: 25, ignition: true, odometerKm: 118900, dailyMileageKm: 188.0, maxSpeedKmh: 81, fuelLevelPct: 60, staleMinutes: 2 },
  { id: 'sim-19', plateNumber: 'AB 8415 YGY', name: 'Jogja Express 19', fleetGroup: 'Central Java Corridor', vehicleType: 'Blind Van', driverName: 'Dimas Pamungkas', lat: -7.7956, lng: 110.3695, address: 'Ring Road Utara, Yogyakarta', baseSpeed: 39, headingDeg: 340, ignition: true, odometerKm: 67800, dailyMileageKm: 134.2, maxSpeedKmh: 75, fuelLevelPct: 72, staleMinutes: 3 },
  { id: 'sim-20', plateNumber: 'B 9045 KRN', name: 'Merak Ferry 20', fleetGroup: 'Port Tanjung Priok', vehicleType: 'Wingbox 10-Wheeler', driverName: 'Kholil Rahman', lat: -5.9303, lng: 105.9994, address: 'Pelabuhan Merak, Banten', baseSpeed: 0, headingDeg: 315, ignition: false, odometerKm: 284100, dailyMileageKm: 128.0, maxSpeedKmh: 86, fuelLevelPct: 53, staleMinutes: 9 },
  { id: 'sim-21', plateNumber: 'B 9611 SIL', name: 'Cikampek Silent 21', fleetGroup: 'West Java Corridor', vehicleType: 'Colt Diesel Double', driverName: 'Joko Susilo', lat: -6.4152, lng: 107.4561, address: 'Rest Area KM 57 Tol Jakarta-Cikampek', baseSpeed: 0, headingDeg: 100, ignition: false, odometerKm: 145600, dailyMileageKm: 32.1, maxSpeedKmh: 74, fuelLevelPct: 28, staleMinutes: 185 },
  { id: 'sim-22', plateNumber: 'L 9772 SIL', name: 'Gresik Silent 22', fleetGroup: 'East Java Hub', vehicleType: 'Tronton Wingbox', driverName: 'Haris Munandar', lat: -7.1566, lng: 112.6555, address: 'Kawasan Industri Gresik', baseSpeed: 0, headingDeg: 180, ignition: false, odometerKm: 219300, dailyMileageKm: 18.4, maxSpeedKmh: 69, fuelLevelPct: 19, staleMinutes: 410 },
];

export class SimulatorVehicleProvider {
  private liveDrift: boolean;

  constructor(config?: { liveDrift?: boolean }) {
    this.liveDrift = config?.liveDrift ?? true;
  }

  async testConnection(): Promise<{ ok: boolean; message: string; latencyMs: number }> {
    return {
      ok: true,
      message: `Simulator active with ${SIMULATED_FLEET.length} Indonesian commercial fleet units.`,
      latencyMs: 8,
    };
  }

  async listVehicles(opts?: {
    allowedFleetGroups?: string[];
    staleThresholdMinutes?: number;
  }): Promise<NormalizedVehicle[]> {
    const staleLimit = opts?.staleThresholdMinutes ?? 60;
    const nowMs = Date.now();
    const tick = Math.floor(nowMs / 15000);

    let units = SIMULATED_FLEET.map((u, idx): NormalizedVehicle => {
      const driftAngle = ((tick + idx * 7) % 360) * (Math.PI / 180);
      const isMoving = u.baseSpeed > 0 && u.staleMinutes < staleLimit;
      const latOffset = this.liveDrift && isMoving ? Math.sin(driftAngle) * 0.0022 : 0;
      const lngOffset = this.liveDrift && isMoving ? Math.cos(driftAngle) * 0.0022 : 0;
      const speedJitter = this.liveDrift && isMoving ? ((tick + idx) % 7) - 3 : 0;
      const speedKmh = isMoving ? Math.max(5, u.baseSpeed + speedJitter) : 0;
      const isSilent = u.staleMinutes >= staleLimit;
      const lastUpdateAt = new Date(nowMs - u.staleMinutes * 60000).toISOString();

      return {
        id: u.id,
        plateNumber: u.plateNumber,
        name: u.name,
        fleetGroup: u.fleetGroup,
        vehicleType: u.vehicleType,
        driverName: u.driverName,
        address: u.address,
        status: isSilent ? 'offline' : isMoving ? 'moving' : u.ignition ? 'idle' : 'parked',
        speedKmh,
        headingDeg: u.headingDeg,
        latitude: Number((u.lat + latOffset).toFixed(6)),
        longitude: Number((u.lng + lngOffset).toFixed(6)),
        ignition: u.ignition,
        odometerKm: u.odometerKm,
        dailyMileageKm: u.dailyMileageKm,
        maxSpeedKmh: Math.max(u.maxSpeedKmh, speedKmh),
        fuelLevelPct: u.fuelLevelPct,
        lastUpdateAt,
        staleMinutes: u.staleMinutes,
        isSilent,
        isSimulated: true,
        availableCapabilities: ['positions', 'trips', 'events', 'deviceHealth', 'dailyMileage'],
      };
    });

    if (opts?.allowedFleetGroups && opts.allowedFleetGroups.length > 0) {
      const allowed = new Set(opts.allowedFleetGroups.map((g) => g.toLowerCase()));
      units = units.filter((v) => allowed.has(v.fleetGroup.toLowerCase()));
    }
    return units;
  }

  async getTripHistory(vehicle: NormalizedVehicle): Promise<VehicleTrip[]> {
    const now = Date.now();
    return [
      {
        id: `trip-${vehicle.id}-1`,
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        startTime: new Date(now - 6 * 3600 * 1000).toISOString(),
        endTime: new Date(now - 3.5 * 3600 * 1000).toISOString(),
        startAddress: `${vehicle.fleetGroup} Hub`,
        endAddress: vehicle.address || 'Transit Checkpoint',
        distanceKm: Number(((vehicle.dailyMileageKm || 64) * 0.6).toFixed(1)),
        durationMinutes: 150,
        maxSpeedKmh: vehicle.maxSpeedKmh || 78,
        averageSpeedKmh: 46,
      },
      {
        id: `trip-${vehicle.id}-2`,
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        startTime: new Date(now - 2.5 * 3600 * 1000).toISOString(),
        endTime: vehicle.lastUpdateAt,
        startAddress: 'Transit Checkpoint',
        endAddress: vehicle.address || 'Current Reported Location',
        distanceKm: Number(((vehicle.dailyMileageKm || 64) * 0.4).toFixed(1)),
        durationMinutes: 110,
        maxSpeedKmh: Math.max(vehicle.speedKmh, 62),
        averageSpeedKmh: 38,
      },
    ];
  }

  async getVehicleEvents(vehicle: NormalizedVehicle): Promise<VehicleEvent[]> {
    const now = Date.now();
    const events: VehicleEvent[] = [
      {
        id: `evt-${vehicle.id}-1`,
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        type: vehicle.ignition ? 'ignition_on' : 'ignition_off',
        severity: 'info',
        timestamp: new Date(now - 4 * 3600 * 1000).toISOString(),
        message: vehicle.ignition ? 'Ignition switched ON at hub departure' : 'Ignition switched OFF at parking bay',
        address: vehicle.address,
      },
    ];
    if ((vehicle.maxSpeedKmh || 0) >= 85) {
      events.push({
        id: `evt-${vehicle.id}-2`,
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        type: 'overspeed',
        severity: 'warning',
        timestamp: new Date(now - 95 * 60000).toISOString(),
        message: `Overspeed threshold exceeded (${vehicle.maxSpeedKmh} km/h > 85 km/h limit)`,
        speedKmh: vehicle.maxSpeedKmh || undefined,
        address: vehicle.address,
      });
    }
    if (vehicle.isSilent) {
      events.push({
        id: `evt-${vehicle.id}-3`,
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        type: 'device_offline',
        severity: 'critical',
        timestamp: vehicle.lastUpdateAt,
        message: `GPS unit silent for ${vehicle.staleMinutes} minutes`,
        address: vehicle.address,
      });
    }
    return events;
  }

  async getDeviceHealth(vehicle: NormalizedVehicle): Promise<DeviceHealth> {
    return {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      imei: `SIM-86012004${vehicle.id.replace(/\D/g, '').padStart(4, '0')}`,
      transmitting: !vehicle.isSilent,
      lastHeartbeatAt: vehicle.lastUpdateAt,
      staleMinutes: vehicle.staleMinutes,
      batteryVoltage: vehicle.isSilent ? 11.4 : 13.8,
      signalStrength: vehicle.isSilent ? 'Lost' : '4G LTE Good',
      satellites: vehicle.isSilent ? 0 : 11,
    };
  }
}
