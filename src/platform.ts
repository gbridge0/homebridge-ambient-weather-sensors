import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { Cache } from './cache';
import { HumidityAccessory } from './humidityAccessory';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SolarRadiationAccessory } from './solarRadiationAccessory';
import { TemperatureAccessory } from './temperatureAccessory';
import { DEVICE } from './types';

import fetch from 'node-fetch';

export class AmbientWeatherSensorsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  private readonly CacheFile: string = `${this.api.user.storagePath()}/${this.config.platform}-${this.config.apiKey}.json`;

  private readonly Cache = new Cache(this.CacheFile, 2 * 60 * 1000, this.log);

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.platform);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.push(accessory);
  }

  determineSensorType(sensor: string) {
    if (sensor.includes('temp') && this.config.temperatureSensors) {
      return 'Temperature';
    } else if (sensor.includes('humid') && this.config.humiditySensors) {
      return 'Humidity';
    } else if (sensor.includes('solar') && this.config.solarRadiationSensors) {
      return 'Solar Radiation';
      // } else if (sensor.includes('baromabs') && this.config.barometricSensors) {
      //   return 'Barometric Pressure';
      // } else if (sensor.includes('windspeed') && this.config.windSensors) {
      //   return 'Wind Speed';
      // } else if (sensor === 'winddir' && this.config.windSensors) {
      //   return 'Wind Direction';
    } else {
      return 'NOT_SUPPORTED';
    }
  }

  parseDevices(json) {
    const Devices:DEVICE[] = [];

    if (Array.isArray(json)) {
      json.forEach( (obj) => {
        Object.entries(obj.lastData).forEach( (device) => {
          const type = this.determineSensorType(device[0]);
          if (type !== 'NOT_SUPPORTED') {
            Devices.push({
              macAddress: obj.macAddress,
              uniqueId: `${obj.macAddress}-${device[0]}`,
              displayName: `${obj.macAddress}-${device[0]}`,
              type: this.determineSensorType(device[0]),
              value: device[1] as number,
            });
          }
        });
      });
    }

    return Devices;
  }

  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

  async fetchDevices() {
    this.log.debug('Fetching sensors from cache');

    try {
      // always use cache data if available
      const cache = this.Cache.read();
      return this.parseDevices(cache.data);
    } catch(error) {
      let message;
      if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      this.log.error('ERROR:', message);
      return [];
    }

  }

  // async function to fetch the devices from the remote API
  async fetchDevicesFromAPI() {
    this.log.debug('----- Fetching sensors from ambientweather API -----');

    try {
      const url = `https://rt.ambientweather.net/v1/devices?applicationKey=${this.config.applicationKey}&apiKey=${this.config.apiKey}`;
      const response = await fetch(url);
      const json = await response.json();

      this.Cache.write(json);

      return this.parseDevices(json);
    } catch(error) {
      let message;
      if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      this.log.error('ERROR:', message);
      return [];
    }
  }

  deregisterAccessories(Devices: DEVICE[]){
    const currentDevices = Devices.map((device) => {
      return device.displayName;
    });

    const cacheMatch = this.accessories.filter( (accessory) => {
      return !currentDevices.includes(accessory.displayName);
    });

    cacheMatch.map( (accessory) => {
      this.log.info(`De-registering accessory [${accessory.displayName}]. It was either not found in the API response,
      or the sensor type has been disabled in the plugin configuration`);

      // remove platform accessories when no longer present
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    });
  }

  async discoverDevices() {
    try {

      const Devices = await this.fetchDevicesFromAPI();

      // remove any existing accessories that arent returned by the API
      this.deregisterAccessories(Devices);

      this.log.debug(`TEMPERATURE SENSORS: ${this.config.temperatureSensors}`);
      this.log.debug(`HUMIDITY SENSORS: ${this.config.humiditySensors}`);
      this.log.debug(`BAROMETRIC SENSORS: ${this.config.barometricSensors}`);
      this.log.debug(`WIND SENSORS: ${this.config.windSensors}`);
      this.log.debug(`SOLAR RADIATION SENSORS: ${this.config.solarRadiationSensors}`);

      // loop over the discovered devices and register each one if it has not already been registered
      for (const device of Devices) {

        const uuid = this.api.hap.uuid.generate(device.uniqueId);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // the accessory already exists
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

          if (existingAccessory.context.device.type === 'Temperature') {
            new TemperatureAccessory(this, existingAccessory);
          } else if (existingAccessory.context.device.type === 'Humidity') {
            new HumidityAccessory(this, existingAccessory);
          } else if (existingAccessory.context.device.type === 'Solar Radiation') {
            new SolarRadiationAccessory(this, existingAccessory);
          }
        } else {
          // the accessory does not yet exist, so we need to create it
          this.log.info('Adding new accessory:', device.displayName);

          // create a new accessory
          const accessory = new this.api.platformAccessory(device.displayName, uuid);

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = device;

          if (accessory.context.device.type === 'Temperature') {
            new TemperatureAccessory(this, accessory);
          } else if (accessory.context.device.type === 'Humidity') {
            new HumidityAccessory(this, accessory);
          } else if (accessory.context.device.type === 'Solar Radiation') {
            new SolarRadiationAccessory(this, accessory);
          }

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }

        // load from remote API every 2 minutes
        this.log.debug('Setting up interval to fetch sensors from remote API every 2 minutes');
        setInterval(this.fetchDevicesFromAPI.bind(this), 2 * 60 * 1000);
      }
    } catch(error) {
      let message;
      if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      this.log.error('ERROR:', message);
    }
  }
}
