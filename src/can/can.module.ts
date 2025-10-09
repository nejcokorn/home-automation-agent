import { Module, Global } from '@nestjs/common';
import { CanService } from './can.service';
import { CanController } from './can.controller';
import { MqttModule } from '../mqtt/mqtt.module';
import { CanMqttBridge } from './can.mqtt-bridge';

@Global()
@Module({
  imports: [MqttModule],
  providers: [CanService, CanMqttBridge],
  controllers: [CanController],
  exports: [CanService],
})
export class CanModule {}