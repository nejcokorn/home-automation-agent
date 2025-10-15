import { Module } from "@nestjs/common";
import { CanModule } from './can/can.module';
import { DeviceModule } from './device/device.module';
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DeviceController } from "./device/device.controller";

@Module({
	imports: [CanModule, DeviceModule],
	controllers: [AppController, DeviceController],
	providers: [AppService],
})
export class AppModule {}