import { Module, Global } from '@nestjs/common';
import { DeviceService } from 'src/device/device.service';
import { DeviceController } from 'src/device/device.controller';
import { MqttModule } from '../mqtt/mqtt.module';

@Global()
@Module({
	imports: [MqttModule],
	providers: [DeviceService],
	controllers: [DeviceController],
	exports: [DeviceService],
})
export class DeviceModule {}