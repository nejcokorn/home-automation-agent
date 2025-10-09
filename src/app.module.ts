import { Module } from "@nestjs/common";
import { CanModule } from './can/can.module';
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

@Module({
	imports: [CanModule],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}