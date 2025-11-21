import { Body, Controller, Get, Param, ParseArrayPipe, Post, UsePipes, ValidationPipe } from "@nestjs/common";
import { DeviceService } from "src/device/device.service";
import { DeviceConfigDto, DeviceCommandDto } from "./device.dto";
import { DataControl } from "./device.types";

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
		let devices = await this.device.discover({
			iface
		});

		// Return list of devices this.discovered
		return devices;
	}

	@Get('can/:iface/device/:deviceId/ping')
	async ping(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number
	) {
		// Get devices
		let devices = await this.device.ping({
			iface,
			deviceId
		});

		// Return list of devices this.discovered
		return devices;
	}

	@Get('can/:iface/device/:deviceId/config')
	async getConfig(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
	) {
		// Get device configuration
		let config = this.device.getConfig({
			iface,
			deviceId
		});

		// Return configuration
		return config;
	}
	
	@Post('can/:iface/device/:deviceId/config')
	@UsePipes(new ValidationPipe({
		transform: true,
		whitelist: true,
		forbidNonWhitelisted: true
	}))
	async setConfig(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
		@Body(new ParseArrayPipe({
			items: DeviceConfigDto,
			whitelist: true,
			forbidNonWhitelisted: true
		})) config: DeviceConfigDto[],
	) {
		// Set device configuration
		try {
			await this.device.setConfig({
				iface,
				deviceId,
				config
			});
		} catch (error) {
			return error;
		}

		// Get device configuration
		// Let user know what new configuration is like
		return await this.device.getConfig({
			iface,
			deviceId
		});
	}

	@Post('can/:iface/device/:deviceId/eeprom')
	async writeEEPROM(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number
	) {
		// Write device configuration
		let EEPROMSize = await this.device.writeEEPROM(iface, deviceId);

		return {
			size: EEPROMSize
		}
	}
	
	@Get('can/:iface/device/:deviceId/:signalType/:direction/:portId')
	async getPort(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
		@Param('signalType') signalType: string,
		@Param('direction') direction: string,
		@Param('portId') portId: number,
	) {
		// Read from device port
		let state = await this.device.getPort({
			iface,
			deviceId,
			signalType,
			direction,
			portId
		});
		return {
			state: state
		}
	}

	@Post('can/:iface/device/:deviceId/:signalType/:direction/:portId')
	@UsePipes(new ValidationPipe({
		transform: true,
		whitelist: true,
		forbidNonWhitelisted: true
	}))
	async setPort(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
		@Param('signalType') signalType: string,
		@Param('direction') direction: string,
		@Param('portId') portId: number,
		@Body() payload: DeviceCommandDto,
	) {
		// Write to device port
		let state = await this.device.setPort({
			iface,
			deviceId,
			signalType,
			direction,
			portId,
			type: payload.type,
			delay: payload.delay,
			extra: payload.extra
		});

		return {
			state: state
		}
	}
}
