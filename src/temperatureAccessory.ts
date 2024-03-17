import { PlatformAccessory, Service } from 'homebridge';

import { AmbientWeatherSensorsPlatform } from './platform';
import { DEVICE } from './types';


export class TemperatureAccessory {
  private service: Service;

  constructor(
    private readonly platform: AmbientWeatherSensorsPlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Ambient Weather')
      .setCharacteristic(this.platform.Characteristic.Model, 'Temperature Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.uniqueId);

    // get the TemperatureSensor service if it exists, otherwise create a new TemperatureSensor service
    this.service = this.accessory.getService(this.platform.Service.TemperatureSensor)
                || this.accessory.addService(this.platform.Service.TemperatureSensor);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    this.updateData();
    setInterval(this.updateData.bind(this), 2 * 60 * 1000);
  }

  fahrenheitToCelsius(temperature) {
    return (temperature - 32) * 5/9;
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  private handleCurrentTemperatureGet(): number {
    this.platform.log.debug('Triggered GET CurrentTemperature');

    //this.updateData();

    const currentValue = this.accessory.context.device.value;
    this.platform.log.debug(`CurrentTemperature: ${currentValue}`);
    return this.fahrenheitToCelsius(currentValue);
  }

  private updateData() {
    this.platform.log.debug(`${this.accessory.context.device.displayName}: Updating CurrentTemperature Data`);

    const Devices = this.platform.fetchDevices();

    if (Devices !== undefined && Devices !== null) {
      const sensor = Devices.filter( (o: DEVICE) => {
        return o.uniqueId === this.accessory.context.device.uniqueId;
      });

      const value = sensor[0].value;
      this.platform.log.debug(`${this.accessory.context.device.displayName}: SET CurrentTemperature: ${value}`);
      this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(this.fahrenheitToCelsius(value));
    }
  }
}