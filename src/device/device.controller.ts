import { Body, Controller, Delete, Get, Param, ParseArrayPipe, Post } from "@nestjs/common";
import { DeviceService } from "src/device/device.service";
import { DeviceConfigDto } from "./device.config.dto";

@Controller()
export class DeviceController {
	constructor(
		private readonly device: DeviceService
	) {}

	@Get('can/:iface/device')
	async discover(
		@Param('iface') iface: string
	) {
		// Get devices
		let devices = await this.device.discover(iface);

		// Return list of devices this.discovered
		return devices;
	}

	@Get('can/:iface/device/:deviceId/ping')
	async ping(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number
	) {
		// Get devices
		let devices = await this.device.ping(iface, deviceId);

		// Return list of devices this.discovered
		return devices;
	}

	@Get('can/:iface/device/:deviceId/config')
	async getConfig(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
	) {
		// Get device configuration
		let config = this.device.getConfig(iface, deviceId);

		// Return configuration
		return config;
	}
	
	@Post('can/:iface/device/:deviceId/config')
	async setConfig(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
		@Body(new ParseArrayPipe({
			items: DeviceConfigDto,
			// Remove unknown properties
			whitelist: true,
			// Return 400 error on unknown fields
			forbidNonWhitelisted: true
		})) config: DeviceConfigDto[],
	) {
		// Set device configuration
		try {
			await this.device.setConfig(iface, deviceId, config);
		} catch (error) {
			return error;
		}

		// Get device configuration
		// Let user know what new configuration is like
		return await this.device.getConfig(iface, deviceId);
	}

	@Post('can/:iface/device/:deviceId/eeprom')
	async writeEEPROM(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number
	) {
		// Write device configuration
		return await this.device.writeEEPROM(iface, deviceId);
	}
	
	@Get('can/:iface/device/:deviceId/:portType/:portDirection/:portId')
	async readPort(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
		@Param('portType') portType: string,
		@Param('portType') portDirection: string,
		@Param('portId') portId: number,
	) {
		// TODO
	}

	@Post('can/:iface/device/:deviceId/:portType/:portDirection/:portId')
	async writePort(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
		@Param('portType') portType: string,
		@Param('portType') portDirection: string,
		@Param('portId') portId: number,
	) {
		// TODO
	}
}
