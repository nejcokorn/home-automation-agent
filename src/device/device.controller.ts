import { Body, Controller, Get, Delete, Param, ParseArrayPipe, Post, UsePipes, ValidationPipe } from "@nestjs/common";
import { DeviceService } from "src/device/device.service";
import { DeviceConfigDto, DeviceCommandDto } from "./device.dto";

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
		return {
			success: true,
			data: devices
		};
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
		return {
			success: true,
			data: devices
		};
	}

	@Get('can/:iface/device/:deviceId/config')
	async getConfig(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
	) {
		// Get device configuration
		let deviceConfig = this.device.getConfig({
			iface,
			deviceId
		});

		// Return configuration
		return {
			success: true,
			data: deviceConfig
		};
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
		let deviceConfig = await this.device.getConfig({
			iface,
			deviceId
		});

		return {
			success: true,
			data: deviceConfig
		};
	}

	@Post('can/:iface/device/:deviceId/eeprom')
	async writeEEPROM(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number
	) {
		// Write device configuration
		let EEPROMSize = await this.device.writeEEPROM(iface, deviceId);

		return {
			success: true,
			data: {
				EEPROMSize: EEPROMSize
			}
		};
	}

	@Get('can/:iface/device/:deviceId/delay')
	async listDelays(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
	) {
		// Get device configuration
		let delays = await this.device.listDelays(iface, deviceId);

		// Return configuration
		return {
			success: true,
			data: delays
		};
	}

	@Delete('can/:iface/device/:deviceId/delay/:delayId')
	async clearDelayById(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
		@Param('delayId') delayId: number,
	) {
		// Get device configuration
		await this.device.clearDelayById(iface, deviceId, delayId);

		// Return configuration
		return {
			success: true,
			data: {
				deletedDelayIds: [delayId]
			}
		};
	}

	@Delete('can/:iface/device/:deviceId/delay/port/:port')
	async clearDelayByPort(
		@Param('iface') iface: string,
		@Param('deviceId') deviceId: number,
		@Param('port') port: number,
	) {
		// Get device configuration
		await this.device.clearDelayByPort(iface, deviceId, port);

		// Return configuration
		return {
			success: true,
			data: {
				// TODO list of delited delays
				deletedDelayIds: []
			}
		};
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
		let currentState = await this.device.getPort({
			iface,
			deviceId,
			signalType,
			direction,
			portId
		});
		return {
			success: true,
			data: {
				currentState: currentState
			}
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
		let currentState = await this.device.setPort({
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
			success: true,
			data: {
				currentState: currentState
			}
		}
	}
}
