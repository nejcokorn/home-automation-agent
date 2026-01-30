import { Module } from "@nestjs/common";
import { CanModule } from './can/can.module';
import { DeviceModule } from './device/device.module';
import { DeviceController } from "./device/device.controller";

@Module({
	imports: [CanModule, DeviceModule],
	controllers: [DeviceController],
	providers: [],
})
export class AppModule {}